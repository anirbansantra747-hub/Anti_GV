/**
 * @file memfsService.js
 * @description The absolute source of truth for the active Workspace.
 * Implements an O(1) in-memory nested Map of DirectoryNodes and FileNodes.
 * Automatically delegates to blobStore for actual content deduplication.
 */

import { blobStore } from './blobStore.js';
import { bus, Events } from './eventBus.js';
import { processFileContent } from './largefile.js';
import { guardWrite, guardRead } from './fsGuard.js';
import { FsNotFoundError, FsInvalidPathError } from './fsErrors.js';

class MemfsService {
  constructor() {
    /** @type {import('../models/WorkspaceContracts.js').Workspace} */
    this.workspace = {
      id: 'default-workspace',
      version: 'initial-root-hash',
      state: 'IDLE',
      locked: false,
      root: {
        type: 'dir',
        id: 'root',
        name: '/',
        children: new Map()
      }
    };
  }

  /**
   * Helper to traverse down to a specific path's parent directory.
   * @param {string} path - e.g., "src/components/Button.js"
   * @param {boolean} createIfMissing - If true, creates intermediate directories.
   * @returns {{ parentNode: import('../models/WorkspaceContracts.js').DirectoryNode, nodeName: string } | null}
   */
  _traverse(path, createIfMissing = false) {
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 0) return { parentNode: this.workspace.root, nodeName: '/' };

    let current = this.workspace.root;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      let next = current.children.get(seg);

      if (!next && createIfMissing) {
        next = { type: 'dir', id: crypto.randomUUID(), name: seg, children: new Map() };
        current.children.set(seg, next);
      } else if (!next || next.type !== 'dir') {
        return null; // Path broken or hit a file instead of a dir
      }
      current = next;
    }
    
    return { parentNode: current, nodeName: segments[segments.length - 1] };
  }

  /**
   * Reads a file asynchronously from the underlying blob store.
   * @param {string} path 
   * @param {string} encoding (e.g. 'utf8')
   * @returns {Promise<string>}
   */
  async readFileSync(path, encoding = 'utf8') {
    guardRead(path);
    const loc = this._traverse(path, false);
    if (!loc) throw new FsNotFoundError(path);
    
    const node = loc.parentNode.children.get(loc.nodeName);
    if (!node || node.type !== 'file') throw new FsNotFoundError(path);

    const content = await blobStore.get(node.blobId);
    
    if (encoding === 'utf8') {
      if (typeof content === 'string') return content;
      const decoder = new TextDecoder(encoding);
      return decoder.decode(content);
    }
    
    return content;
  }

  /**
   * Writes content to a file. Defers data to the blobStore to get a hash identity.
   * @param {string} path 
   * @param {string | ArrayBuffer} content 
   */
  async writeFileSync(path, content, moduleId = 'UI') {
    guardWrite(path, moduleId);
    const loc = this._traverse(path, true);
    if (!loc) throw new FsInvalidPathError(path, 'Could not resolve parent directory');

    // Use processFileContent which handles the >2MB binary flag + streaming hash
    const { blobId, hash, binary } = await processFileContent(content);

    let node = loc.parentNode.children.get(loc.nodeName);
    if (node && node.type === 'dir') {
      throw new Error(`EISDIR: illegal operation on a directory, writeFileSync '${path}'`);
    }

    if (!node) {
      node = {
        type: 'file',
        id: crypto.randomUUID(),
        name: loc.nodeName,
        hash: `FILE|${hash}`,
        blobId,
        binary,
      };
      loc.parentNode.children.set(loc.nodeName, node);
    } else {
      node.hash   = `FILE|${hash}`;
      node.blobId = blobId;
      node.binary = binary;
    }

    this._triggerWorkspaceUpdate();
  }

  /**
   * Creates a directory recursively.
   * @param {string} dirPath 
   * @param {{ recursive?: boolean }} options 
   */
  mkdirSync(dirPath, options = { recursive: true }, moduleId = 'UI') {
    guardWrite(dirPath, moduleId);
    const loc = this._traverse(dirPath, options.recursive);
    if (!loc) throw new FsInvalidPathError(dirPath, 'Could not resolve parent for mkdir');

    if (!loc.parentNode.children.has(loc.nodeName)) {
      loc.parentNode.children.set(loc.nodeName, { 
        type: 'dir', 
        id: crypto.randomUUID(), 
        name: loc.nodeName, 
        children: new Map() 
      });
      this._triggerWorkspaceUpdate();
    }
  }

  /**
   * Recursively list all fully qualified paths in the filesystem.
   * Useful for exporting a Flat context string for LLM Agent.
   * @param {string} basePath 
   * @param {{ recursive?: boolean }} options 
   * @returns {string[]}
   */
  readdirSync(basePath = '/', options = { recursive: true }) {
    const results = [];
    const loc = basePath === '/' ? { parentNode: this.workspace.root, nodeName: '/' } : this._traverse(basePath, false);

    if (!loc) throw new Error(`ENOENT: no such file or directory, readdirSync '${basePath}'`);

    const targetNode = basePath === '/' ? this.workspace.root : loc.parentNode.children.get(loc.nodeName);
    
    if (!targetNode || targetNode.type !== 'dir') throw new Error(`ENOTDIR: not a directory, readdirSync '${basePath}'`);

    function walk(node, currentPath) {
      for (const [name, child] of node.children.entries()) {
        const fullPath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
        results.push(fullPath);
        if (options.recursive && child.type === 'dir') {
          walk(child, fullPath);
        }
      }
    }

    walk(targetNode, basePath);
    return results;
  }

  /**
   * Deletes a file or directory recursively.
   * @param {string} path 
   */
  unlinkSync(path, moduleId = 'UI') {
    guardWrite(path, moduleId);
    const loc = this._traverse(path, false);
    if (!loc || !loc.parentNode.children.has(loc.nodeName)) {
       throw new FsNotFoundError(path);
    }
    
    loc.parentNode.children.delete(loc.nodeName);
    this._triggerWorkspaceUpdate();
  }

  /**
   * Checks if a path exists.
   * @param {string} path 
   * @returns {boolean}
   */
  existsSync(path) {
    if (path === '/') return true;
    const loc = this._traverse(path, false);
    return loc ? loc.parentNode.children.has(loc.nodeName) : false;
  }

  // Emits FS_MUTATED on the eventBus — triggers Tier 2 debounced save and reactive store update.
  _triggerWorkspaceUpdate() {
    bus.emit(Events.FS_MUTATED, { workspaceId: this.workspace.id });
  }
}

export const memfs = new MemfsService();
