/* eslint-disable no-unused-vars */
/**
 * @file persistenceService.js
 * @description Tier 2 persistence layer: debounced flat serialization of the
 * in-memory filesystem to IndexedDB via localForage.
 *
 * Strategy:
 *  - On every FS_MUTATED event, schedule a debounced write (3-second delay).
 *  - Serialize as a FLAT structure: { files: Record<path, {hash, blobId}>, blobs: Record<blobId, content> }
 *  - After a successful write, emit CACHE_SAVED with the list of saved paths.
 */

import localforage from 'localforage';
import { LIMITS } from '@antigv/shared';
import { memfs } from './memfsService.js';
import { blobStore } from './blobStore.js';
import { bus, Events } from './eventBus.js';

// Configure localForage for this workspace
localforage.config({
  name: 'anti_gv',
  storeName: 'workspace_cache',
  description: 'Anti_GV — V3 Workspace Tier 2 IDB Cache',
});

const IDB_KEY = 'workspace_flat_snapshot';

let _debounceTimer = null;

/**
 * Recursively walk the in-memory tree and produce a flat file map.
 * @param {import('../models/WorkspaceContracts.js').DirectoryNode} node
 * @param {string} currentPath
 * @param {Record<string, {hash: string, blobId: string}>} out
 */
function flattenTree(node, currentPath = '', out = {}) {
  for (const [name, child] of node.children) {
    const fullPath = `${currentPath}/${name}`;
    if (child.type === 'file') {
      out[fullPath] = { hash: child.hash, blobId: child.blobId, binary: child.binary };
    } else {
      flattenTree(child, fullPath, out);
    }
  }
  return out;
}

/**
 * Immediately serialize and persist the current Tier 1 state to IndexedDB.
 * @returns {Promise<void>}
 */
export async function persistNow() {
  const files = flattenTree(memfs.workspace.root);

  // Build a flat blob map using only the blobIds referenced by current files
  const blobs = {};
  for (const { blobId } of Object.values(files)) {
    if (!blobs[blobId] && blobStore.exists(blobId)) {
      blobs[blobId] = await blobStore.get(blobId);
    }
  }

  const payload = {
    workspaceId: memfs.workspace.id,
    version: memfs.workspace.version,
    savedAt: Date.now(),
    files,
    blobs,
  };

  await localforage.setItem(IDB_KEY, payload);

  bus.emit(Events.CACHE_SAVED, { savedPaths: Object.keys(files) });
  console.log(`[Tier 2] Persisted ${Object.keys(files).length} files to IndexedDB.`);
}

/**
 * Schedule a debounced persist — cancels any pending write and restarts the timer.
 */
export function schedulePersist() {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => {
    persistNow().catch((err) => console.error('[PersistenceService] Failed to write to IDB:', err));
  }, LIMITS.AUTOSAVE_DEBOUNCE_MS);
}

/**
 * Attempt to hydrate the workspace from IndexedDB.
 * @returns {Promise<boolean>} True if successfully loaded, false otherwise.
 */
export async function loadFromIDB() {
  try {
    const payload = await localforage.getItem(IDB_KEY);
    if (!payload || !payload.files || !payload.blobs) return false;

    // Reset tree
    memfs.workspace.root = {
      type: 'dir',
      id: 'root',
      name: '/',
      children: new Map(),
    };

    // Restore blobs first.
    // IndexedDB/localForage may serialize ArrayBuffers as something else depending on the driver.
    // Ensure we store them exactly as string or ArrayBuffer.
    for (const [blobId, rawContent] of Object.entries(payload.blobs)) {
      let buffer = rawContent;
      if (rawContent && typeof rawContent === 'object' && !(rawContent instanceof ArrayBuffer)) {
        // Fallback for some localforage drivers returning Uint8Array or Buffer-like objects
        if (rawContent.buffer instanceof ArrayBuffer) {
          buffer = rawContent.buffer;
        } else if (rawContent instanceof Uint8Array) {
          buffer = rawContent.buffer;
        } else if (rawContent.type === 'Buffer' && Array.isArray(rawContent.data)) {
          buffer = new Uint8Array(rawContent.data).buffer;
        }
      }
      blobStore.blobs.set(blobId, buffer);
      // We should arguably also invoke blobStore.put() to update its internal size & refcounts,
      // but manually setting it and letting the file tree walk do it, or just trusting the cache, is fine for a raw hydrate.
      // Easiest is to manually increment refCounts based on the files payload below.
    }

    // Reconstruct files and directories
    for (const [fullPath, meta] of Object.entries(payload.files)) {
      const parts = fullPath.split('/').filter(Boolean);
      const fileName = parts.pop();
      let currentDir = memfs.workspace.root;

      // Ensure intermediate directories exist
      let currentPath = '';
      for (const part of parts) {
        currentPath += `/${part}`;
        if (!currentDir.children.has(part)) {
          currentDir.children.set(part, {
            type: 'dir',
            id: crypto.randomUUID(),
            name: part,
            children: new Map(),
          });
        }
        currentDir = currentDir.children.get(part);
      }

      // Add file
      currentDir.children.set(fileName, {
        type: 'file',
        id: crypto.randomUUID(),
        name: fileName,
        hash: meta.hash,
        blobId: meta.blobId,
        binary: meta.binary,
      });

      // Increment the reference count in blobStore to correctly track memory usage
      blobStore.incRef(meta.blobId);
    }

    memfs.workspace.id = payload.workspaceId || crypto.randomUUID();
    memfs.workspace.version = payload.version || 'initial-root-hash';

    bus.emit(Events.FS_MUTATED, { workspaceId: memfs.workspace.id, path: null });
    console.log(`[Tier 2] Restored ${Object.keys(payload.files).length} files from IDB.`);
    return true;
  } catch (err) {
    console.warn('[PersistenceService] Failed to parse IDB payload:', err);
    return false;
  }
}

// ── Auto-wire to EventBus ─────────────────────────────────────────────────────
// Every time the in-memory tree is mutated, schedule a 3-second debounced save.
bus.on(Events.FS_MUTATED, schedulePersist);
