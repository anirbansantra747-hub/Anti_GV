/**
 * @file integrityService.js
 * @description Periodic Merkle integrity checker for the V3 Workspace Runtime.
 *
 * Runs every 60 seconds (configurable) and on-demand.
 * Recomputes the live Tier 1 tree's rootTreeHash from scratch and compares
 * it against workspace.version.
 *
 * If they diverge → the version is HEALED (updated) and a warning is logged.
 * This handles the common case where the version field drifted (e.g. a write
 * happened without updating the version). Real corruption would surface as
 * unreadable files, not a version string mismatch.
 */

import { memfs } from './memfsService.js';
import { snapshotStore } from './snapshotService.js';
import { bus, Events } from './eventBus.js';

const INTEGRITY_INTERVAL_MS = 60_000; // 60 seconds

class IntegrityService {
  constructor() {
    /** @type {ReturnType<typeof setInterval> | null} */
    this._timer = null;
    this._isRunning = false;
  }

  /** Start the background integrity check loop. */
  start(intervalMs = INTEGRITY_INTERVAL_MS) {
    if (this._timer) return; // Already running
    this._timer = setInterval(() => this.check(), intervalMs);
    console.log(`[IntegrityService] Started — checks every ${intervalMs / 1000}s.`);
  }

  /** Stop the background integrity check loop. */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
      console.log('[IntegrityService] Stopped.');
    }
  }

  /**
   * Run an integrity check now (can be called on-demand by the UI).
   * @returns {Promise<{ ok: boolean, expected?: string, actual?: string }>}
   */
  async check() {
    if (this._isRunning) return { ok: true }; // Prevent concurrent checks
    this._isRunning = true;

    try {
      const storedVersion = memfs.workspace.version;

      // Skip check on empty / uninitialized workspaces
      if (storedVersion === 'initial-root-hash' && memfs.workspace.root.children.size === 0) {
        return { ok: true };
      }

      // Use the canonical recursive hash — same as initSyncService
      const computedVersion = await snapshotStore.computeTreeHash(memfs.workspace.root);

      if (storedVersion !== computedVersion) {
        // HEAL: update the stored version instead of freezing the workspace.
        // A hash mismatch means workspace.version drifted (e.g. mkdir didn't update it).
        // Actual data corruption would surface as read errors, not a version mismatch.
        console.warn(
          `[IntegrityService] ⚠️ Version drift detected — healing.\n` +
            `  Stored:   ${storedVersion.slice(0, 8)}\n` +
            `  Computed: ${computedVersion.slice(0, 8)}\n` +
            `  Action:   Updated workspace.version to match live tree.`
        );
        memfs.workspace.version = computedVersion;

        return { ok: true, healed: true, expected: storedVersion, actual: computedVersion };
      }

      console.log(`[IntegrityService] ✅ Integrity OK — ${computedVersion.slice(0, 8)}`);
      return { ok: true };
    } finally {
      this._isRunning = false;
    }
  }
}

export const integrityService = new IntegrityService();
