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

// ── Auto-wire to EventBus ─────────────────────────────────────────────────────
// Every time the in-memory tree is mutated, schedule a 3-second debounced save.
bus.on(Events.FS_MUTATED, schedulePersist);
