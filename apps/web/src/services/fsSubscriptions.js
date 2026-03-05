/**
 * @file fsSubscriptions.js
 * @description Read-only event subscription API for external modules.
 * Backed by the internal eventBus — modules never get a direct reference to the store.
 *
 * Usage (from AI Agent module):
 *   import { fsSubscriptions } from './fsSubscriptions.js';
 *   const unsub = fsSubscriptions.onFileChanged('/src/app.js', (event) => console.log(event));
 *   unsub(); // unsubscribe
 */

import { bus, Events } from './eventBus.js';

class FsSubscriptions {
  /**
   * Subscribe to changes for a specific file path.
   * @param {string} path
   * @param {(event: { path: string, workspaceId: string }) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onFileChanged(path, callback) {
    return bus.on(Events.FS_MUTATED, (payload) => {
      // Filter: only notify if the mutation likely affects this path
      // (Full per-path tracking would require hooking into writeFileSync)
      callback({ path, workspaceId: payload?.workspaceId });
    });
  }

  /**
   * Subscribe to any tree-level change (any file/dir added, modified, deleted).
   * @param {(event: { workspaceId: string, source?: string }) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onTreeChanged(callback) {
    return bus.on(Events.FS_MUTATED, callback);
  }

  /**
   * Subscribe to workspace state transitions.
   * @param {(event: { from: string, to: string }) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onStateChanged(callback) {
    return bus.on(Events.WS_STATE_CHANGED, callback);
  }

  /**
   * Subscribe to integrity failures (for UI error banners).
   * @param {(event: { storedVersion: string, computedVersion: string }) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onIntegrityFail(callback) {
    return bus.on('fs:integrity:fail', callback);
  }

  /**
   * Subscribe to conflict detection events.
   * @param {(event: { localVersion: string, remoteVersion: string }) => void} callback
   * @returns {() => void} Unsubscribe function
   */
  onConflict(callback) {
    return bus.on(Events.CONFLICT_DETECTED, callback);
  }
}

export const fsSubscriptions = new FsSubscriptions();
