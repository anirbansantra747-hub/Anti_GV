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
        children: new Map(),
      },
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
   * Reads a file from the underlying blob store.
   * @param {string} path
   * @param {string} encoding (e.g. 'utf8')
   * @returns {Promise<string>}
   */
  async readFile(path, encoding = 'utf8') {
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
  async writeFile(path, content, moduleId = 'UI', silent = false) {
    guardWrite(path, moduleId);
    const loc = this._traverse(path, true);
    if (!loc) throw new FsInvalidPathError(path, 'Could not resolve parent directory');

    // Use processFileContent which handles the >2MB binary flag + streaming hash
    const { blobId, hash, binary } = await processFileContent(content);

    let node = loc.parentNode.children.get(loc.nodeName);
    if (node && node.type === 'dir') {
      throw new Error(`EISDIR: illegal operation on a directory, writeFile '${path}'`);
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
      // Decrement ref on the old blob before overwriting
      if (node.blobId !== blobId) blobStore.decRef(node.blobId);
      node.hash = `FILE|${hash}`;
      node.blobId = blobId;
      node.binary = binary;
    }

    if (!silent) {
      this._triggerWorkspaceUpdate(path);
    }
  }

  /**
   * Creates a directory recursively.
   * @param {string} dirPath
   * @param {{ recursive?: boolean }} options
   */
  mkdir(dirPath, options = { recursive: true }, moduleId = 'UI') {
    guardWrite(dirPath, moduleId);
    const loc = this._traverse(dirPath, options.recursive);
    if (!loc) throw new FsInvalidPathError(dirPath, 'Could not resolve parent for mkdir');

    if (!loc.parentNode.children.has(loc.nodeName)) {
      loc.parentNode.children.set(loc.nodeName, {
        type: 'dir',
        id: crypto.randomUUID(),
        name: loc.nodeName,
        children: new Map(),
      });
      this._triggerWorkspaceUpdate(dirPath);
    }
  }

  /**
   * Recursively list all fully qualified paths in the filesystem.
   * Useful for exporting a Flat context string for LLM Agent.
   * @param {string} basePath
   * @param {{ recursive?: boolean }} options
   * @returns {string[]}
   */
  readdir(basePath = '/', options = { recursive: true }) {
    const results = [];
    const loc =
      basePath === '/'
        ? { parentNode: this.workspace.root, nodeName: '/' }
        : this._traverse(basePath, false);

    if (!loc) throw new Error(`ENOENT: no such file or directory, readdirSync '${basePath}'`);

    const targetNode =
      basePath === '/' ? this.workspace.root : loc.parentNode.children.get(loc.nodeName);

    if (!targetNode || targetNode.type !== 'dir')
      throw new Error(`ENOTDIR: not a directory, readdirSync '${basePath}'`);

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
  unlink(path, moduleId = 'UI') {
    guardWrite(path, moduleId);
    const loc = this._traverse(path, false);
    if (!loc || !loc.parentNode.children.has(loc.nodeName)) {
      throw new FsNotFoundError(path);
    }

    // Decrement blob refs for deleted nodes
    const deletedNode = loc.parentNode.children.get(loc.nodeName);
    this._decRefTree(deletedNode);

    loc.parentNode.children.delete(loc.nodeName);
    this._triggerWorkspaceUpdate(path);
  }

  /**
   * Atomically renames/moves a file or directory.
   * @param {string} oldPath
   * @param {string} newPath
   * @param {string} [moduleId='UI']
   */
  rename(oldPath, newPath, moduleId = 'UI') {
    guardWrite(oldPath, moduleId);
    guardWrite(newPath, moduleId);

    const srcLoc = this._traverse(oldPath, false);
    if (!srcLoc || !srcLoc.parentNode.children.has(srcLoc.nodeName)) {
      throw new FsNotFoundError(oldPath);
    }

    const dstLoc = this._traverse(newPath, true);
    if (!dstLoc)
      throw new FsInvalidPathError(newPath, 'Could not resolve parent for rename target');

    const node = srcLoc.parentNode.children.get(srcLoc.nodeName);
    srcLoc.parentNode.children.delete(srcLoc.nodeName);

    node.name = dstLoc.nodeName;
    dstLoc.parentNode.children.set(dstLoc.nodeName, node);

    this._triggerWorkspaceUpdate(newPath);
  }

  /**
   * Checks if a path exists.
   * @param {string} path
   * @returns {boolean}
   */
  exists(path) {
    if (path === '/') return true;
    const loc = this._traverse(path, false);
    return loc ? loc.parentNode.children.has(loc.nodeName) : false;
  }

  // Recursively decrement blob ref counts for all files in a tree node.
  _decRefTree(node) {
    if (!node) return;
    if (node.type === 'file' && node.blobId) {
      blobStore.decRef(node.blobId);
    } else if (node.type === 'dir' && node.children) {
      for (const child of node.children.values()) {
        this._decRefTree(child);
      }
    }
  }

  // Emits FS_MUTATED on the eventBus — triggers Tier 2 debounced save and reactive store update.
  _triggerWorkspaceUpdate(changedPath = null) {
    bus.emit(Events.FS_MUTATED, { workspaceId: this.workspace.id, path: changedPath });
  }
}

export const memfs = new MemfsService();
