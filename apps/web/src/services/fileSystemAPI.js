/* eslint-disable no-unused-vars */
/**
 * @file fileSystemAPI.js
 * @description THE only public entry-point for all external modules to interact with the File System.
 *
 * No external module should ever import memfs, blobStore, or diffService directly.
 * All calls pass through fsGuard.js for path validation + state + permission checks.
 *
 * Usage:
 *   import { fileSystemAPI } from './fileSystemAPI.js';
 *   const content = await fileSystemAPI.readFile('/src/main.js', { sourceModule: 'AI_AGENT' });
 */

import { memfs } from './memfsService.js';
import { diffService } from './diffService.js';
import { guardRead, guardWrite, guardDiff } from './fsGuard.js';
import { FsNotFoundError } from './fsErrors.js';
import { snapshotStore } from './snapshotService.js';
import { recordSnapshot } from '../components/History/HistoryDrawer.jsx';

/**
 * @typedef {{ sourceModule?: string }} CallOptions
 */

class FileSystemAPI {
  // ── READS ─────────────────────────────────────────────────────────────────

  /**
   * Read a file's text content.
   * @param {string} path
   * @param {CallOptions} [opts]
   * @returns {Promise<string>}
   */
  async readFile(path, opts = {}) {
    guardRead(path);
    if (!memfs.exists(path)) throw new FsNotFoundError(path);
    return memfs.readFile(path, 'utf8');
  }

  /**
   * Check if a path exists.
   * @param {string} path
   * @param {CallOptions} [opts]
   * @returns {boolean}
   */
  existsFile(path, opts = {}) {
    guardRead(path);
    return memfs.exists(path);
  }

  /**
   * List all files recursively.
   * @param {string} [basePath='/']
   * @param {CallOptions} [opts]
   * @returns {string[]}
   */
  listFiles(basePath = '/', opts = {}) {
    guardRead(basePath);
    return memfs.readdir(basePath, { recursive: true });
  }

  // ── WRITES ────────────────────────────────────────────────────────────────

  /**
   * Write content to a file. Guards enforce module permissions and state.
   * @param {string} path
   * @param {string | ArrayBuffer} content
   * @param {CallOptions} [opts]
   * @returns {Promise<void>}
   */
  async writeFile(path, content, opts = {}) {
    guardWrite(path, opts.sourceModule ?? 'UI');
    await memfs.writeFile(path, content, opts.sourceModule ?? 'UI', opts.silent);

    if (!opts.silent) {
      // Phase 5.1: recompute Merkle rootTreeHash after each write (O(depth))
      try {
        const newHash = await snapshotStore.computeDirHash(memfs.workspace.root);
        memfs.workspace.version = newHash;
        const fileCount = memfs.readdir('/', { recursive: true }).length;
        recordSnapshot(newHash, fileCount, opts.label || `Wrote ${path.split('/').pop()}`);
      } catch {
        // Non-fatal — hash failure doesn’t block the write
      }
    }
  }

  /**
   * Create a directory (recursive).
   * @param {string} dirPath
   * @param {CallOptions} [opts]
   */
  mkdir(dirPath, opts = {}) {
    guardWrite(dirPath, opts.sourceModule ?? 'UI');
    memfs.mkdir(dirPath, { recursive: true });
  }

  /**
   * Delete a file or directory.
   * @param {string} path
   * @param {CallOptions} [opts]
   */
  deleteFile(path, opts = {}) {
    guardWrite(path, opts.sourceModule ?? 'UI');
    if (!memfs.exists(path)) throw new FsNotFoundError(path);
    memfs.unlink(path);
  }

  /**
   * Rename or move a file/directory.
   * @param {string} oldPath
   * @param {string} newPath
   * @param {CallOptions} [opts]
   */
  renameFile(oldPath, newPath, opts = {}) {
    guardWrite(oldPath, opts.sourceModule ?? 'UI');
    guardWrite(newPath, opts.sourceModule ?? 'UI');
    memfs.rename(oldPath, newPath);
  }

  // ── AI SHADOW TREE (DIFF) ─────────────────────────────────────────────────

  /**
   * Open a Shadow Tree transaction for AI-proposed edits.
   * Only modules with 'diff' permission may call this.
   * @param {string[]} targetPaths - paths that will be patched
   * @param {CallOptions} [opts]
   * @returns {string} Transaction ID
   */
  beginAIEdit(targetPaths, opts = {}) {
    for (const p of targetPaths) guardDiff(p, opts.sourceModule ?? 'AI_AGENT');
    return diffService.beginTransaction();
  }

  /**
   * Apply a patch to the Shadow Tree (not Tier 1).
   * @param {string} txId
   * @param {import('../models/WorkspaceContracts.js').FilePatch} patch
   * @param {CallOptions} [opts]
   */
  async applyPatch(txId, patch, opts = {}) {
    guardDiff(patch.path, opts.sourceModule ?? 'AI_AGENT');
    await diffService.applyPatch(txId, patch);
  }

  /**
   * Expose the diff for UI review. The commit happens via DiffViewer UI.
   * @param {string} txId
   * @param {string} path
   * @returns {Promise<{ original: string, proposed: string }>}
   */
  getDiff(txId, path) {
    guardRead(path);
    return diffService.getDiff(txId, path);
  }

  /**
   * Roll back a shadow tree transaction (no changes committed).
   * @param {string} txId
   */
  rollbackEdit(txId) {
    diffService.rollback(txId);
  }
}

export const fileSystemAPI = new FileSystemAPI();
