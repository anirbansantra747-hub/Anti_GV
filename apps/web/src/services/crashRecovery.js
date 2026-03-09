/* eslint-disable no-unused-vars */
/**
 * @file crashRecovery.js
 * @description Crash Recovery logic for the V3 Workspace Runtime.
 *
 * On page reload:
 * 1. Attempt to acquire a Web Lock ("anti_gv_write_lock")
 * 2. If acquired → read the flat IndexedDB snapshot
 * 3. Validate the snapshot integrity
 * 4. Hydrate the Tier 1 in-memory map from the IDB payload
 * 5. Emit CACHE_LOAD_SUCCESS or CACHE_LOAD_FAIL
 *
 * If the IDB snapshot is corrupt/missing, we emit CACHE_LOAD_FAIL
 * so the UI can fall back to fetching from Tier 3 (Remote DB).
 */

import localforage from 'localforage';
import { memfs } from './memfsService.js';
import { blobStore } from './blobStore.js';
import { bus, Events } from './eventBus.js';

const IDB_KEY = 'workspace_flat_snapshot';
const LOCK_NAME = 'anti_gv_write_lock';

/**
 * Rebuilds the nested DirectoryNode tree from a flat file map.
 * @param {Record<string, {hash: string, blobId: string, binary: boolean}>} files
 * @returns {import('../models/WorkspaceContracts.js').DirectoryNode}
 */
function rebuildTree(files) {
  const root = {
    type: 'dir',
    id: 'root',
    name: '/',
    children: new Map(),
  };

  for (const [fullPath, meta] of Object.entries(files)) {
    const segments = fullPath.split('/').filter(Boolean);
    let current = root;

    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (!current.children.has(seg)) {
        current.children.set(seg, {
          type: 'dir',
          id: crypto.randomUUID(),
          name: seg,
          children: new Map(),
        });
      }
      current = current.children.get(seg);
    }

    const fileName = segments[segments.length - 1];
    current.children.set(fileName, {
      type: 'file',
      id: crypto.randomUUID(),
      name: fileName,
      hash: meta.hash,
      blobId: meta.blobId,
      binary: meta.binary ?? false,
    });
  }

  return root;
}

/**
 * Attempt to hydrate Tier 1 from IndexedDB.
 * Call this once at app startup, before mounting any UI.
 * @returns {Promise<boolean>} true if recovery succeeded
 */
export async function tryRecover() {
  // Check if Web Locks API is available (modern browsers only)
  if (!navigator.locks) {
    console.warn('[CrashRecovery] Web Locks API not available. Skipping recovery.');
    bus.emit(Events.CACHE_LOAD_FAIL, { reason: 'no_web_locks' });
    return false;
  }

  return new Promise((resolve) => {
    navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) {
        // Another tab holds the lock — we are a slave tab
        console.log('[CrashRecovery] Lock held by another tab. Entering slave mode.');
        bus.emit(Events.CACHE_LOAD_FAIL, { reason: 'lock_held_by_other_tab' });
        resolve(false);
        return;
      }

      // We have the master lock, read Tier 2
      try {
        const snapshot = await localforage.getItem(IDB_KEY);

        if (!snapshot || !snapshot.files || !snapshot.blobs) {
          console.warn('[CrashRecovery] No valid IDB snapshot found.');
          bus.emit(Events.CACHE_LOAD_FAIL, { reason: 'no_snapshot' });
          resolve(false);
          return;
        }

        // Rebuild the blob store from the snapshot
        for (const [blobId, content] of Object.entries(snapshot.blobs)) {
          if (!blobStore.exists(blobId)) {
            blobStore.blobs.set(blobId, content);
          }
        }

        // Rebuild the Tier 1 in-memory tree
        memfs.workspace.root = rebuildTree(snapshot.files);
        memfs.workspace.id = snapshot.workspaceId;
        memfs.workspace.version = snapshot.version;
        memfs.workspace.state = 'IDLE';

        console.log(
          `[CrashRecovery] ✅ Hydrated ${Object.keys(snapshot.files).length} files from IDB (version: ${snapshot.version}).`
        );

        bus.emit(Events.CACHE_LOAD_SUCCESS, {
          fileCount: Object.keys(snapshot.files).length,
          version: snapshot.version,
        });

        // Trigger reactive UI update
        memfs._triggerWorkspaceUpdate();

        resolve(true);
      } catch (err) {
        console.error('[CrashRecovery] IDB read error:', err);
        bus.emit(Events.CACHE_LOAD_FAIL, { reason: 'idb_error', error: err.message });
        resolve(false);
      }
    });
  });
}
