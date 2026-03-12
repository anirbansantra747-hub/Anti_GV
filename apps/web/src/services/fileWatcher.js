/**
 * @file fileWatcher.js
 * @description Hash-diffed file change watcher for external module subscribers (RAG, etc.).
 *
 * Unlike time-based watchers, this emits 'file:changed' ONLY when a file's
 * blobId (content hash) actually changes. Prevents redundant re-indexing for
 * no-op saves where the file content is identical.
 *
 * Usage (from RAG Indexer):
 *   import { fileWatcher } from './fileWatcher.js';
 *   fileWatcher.watch('/src', (event) => { indexer.update(event.path); });
 */

import { bus, Events } from './eventBus.js';
import { memfs } from './memfsService.js';

class FileWatcher {
  constructor() {
    /**
     * Last known blobId per path.
     * @type {Map<string, string>} path → blobId
     */
    this._lastKnownHashes = new Map();

    /**
     * Registered watchers: path prefix → Set of callbacks
     * @type {Map<string, Set<Function>>}
     */
    this._watchers = new Map();

    // Hook into FS_MUTATED — diff hashes here, not in the service
    bus.on(Events.FS_MUTATED, () => this._scan());
  }

  /**
   * Watch a path prefix for hash-diffed changes.
   * @param {string} pathPrefix - e.g. '/src' or '/' for all files
   * @param {(event: { path: string, blobId: string, changeType: 'modified'|'added'|'deleted' }) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  watch(pathPrefix, callback) {
    if (!this._watchers.has(pathPrefix)) {
      this._watchers.set(pathPrefix, new Set());
    }
    this._watchers.get(pathPrefix).add(callback);

    return () => {
      this._watchers.get(pathPrefix)?.delete(callback);
    };
  }

  /**
   * Force an immediate scan (useful after crash recovery / workspace load).
   */
  forceSync() {
    this._scan(true);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _scan(isInitial = false) {
    const allPaths = memfs.readdir('/', { recursive: true });
    const currentPaths = new Set(allPaths);
    const events = [];

    // Detect added or modified files
    for (const path of allPaths) {
      const node = this._getFileNode(path);
      if (!node || node.type !== 'file') continue;

      const lastBlobId = this._lastKnownHashes.get(path);
      if (lastBlobId === undefined) {
        if (!isInitial) {
          events.push({ path, blobId: node.blobId, changeType: 'added' });
        }
        this._lastKnownHashes.set(path, node.blobId);
      } else if (lastBlobId !== node.blobId) {
        events.push({ path, blobId: node.blobId, changeType: 'modified' });
        this._lastKnownHashes.set(path, node.blobId);
      }
    }

    // Detect deleted files
    for (const [path] of this._lastKnownHashes) {
      if (!currentPaths.has(path)) {
        events.push({ path, blobId: null, changeType: 'deleted' });
        this._lastKnownHashes.delete(path);
      }
    }

    // Dispatch events to matching watchers
    for (const event of events) {
      for (const [prefix, callbacks] of this._watchers) {
        if (event.path.startsWith(prefix)) {
          for (const cb of callbacks) {
            try {
              cb(event);
            } catch (err) {
              console.error(`[FileWatcher] Listener error for ${event.path}:`, err);
            }
          }
        }
      }
    }
  }

  _getFileNode(path) {
    const segments = path.split('/').filter(Boolean);
    let node = memfs.workspace.root;
    for (const seg of segments) {
      node = node.children?.get(seg);
      if (!node) return null;
    }
    return node;
  }
}

export const fileWatcher = new FileWatcher();
