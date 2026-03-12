/**
 * @file integrityService.js
 * @description Periodic Merkle integrity checker for the V3 Workspace Runtime.
 *
 * Runs every 60 seconds (configurable) and on-demand.
 * Recomputes the live Tier 1 tree's rootTreeHash from scratch and
 * compares it against workspace.version.
 * If they diverge → emits 'fs:integrity:fail' and transitions to ERROR state.
 */

import { memfs } from './memfsService.js';
import { snapshotStore } from './snapshotService.js';
import { bus, Events } from './eventBus.js';
import { FsCorruptionError } from './fsErrors.js';

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
      const computedVersion = await this._computeRootHash(memfs.workspace.root);

      if (storedVersion === 'initial-root-hash' && memfs.workspace.root.children.size === 0) {
        // Empty workspace — skip (initial state has no real hash yet)
        return { ok: true };
      }

      if (storedVersion !== computedVersion) {
        const err = new FsCorruptionError(
          '/',
          `Stored version ${storedVersion.slice(0, 8)} ≠ computed ${computedVersion.slice(0, 8)}`
        );

        console.error('[IntegrityService] ❌ Integrity check FAILED:', err.message);

        // Transition workspace to ERROR state
        const prevState = memfs.workspace.state;
        memfs.workspace.state = 'ERROR';
        bus.emit(Events.FS_INTEGRITY_FAIL, {
          storedVersion,
          computedVersion,
          error: err,
        });
        bus.emit(Events.WS_STATE_CHANGED, { from: prevState, to: 'ERROR' });

        return { ok: false, expected: storedVersion, actual: computedVersion };
      }

      console.log(`[IntegrityService] ✅ Integrity OK — ${computedVersion.slice(0, 8)}`);
      return { ok: true };
    } finally {
      this._isRunning = false;
    }
  }

  /**
   * Recursively compute the Merkle root hash of the current tree.
   * @param {import('../models/WorkspaceContracts.js').DirectoryNode} node
   * @returns {Promise<string>}
   */
  async _computeRootHash(node) {
    if (node.type === 'file') return node.hash;

    // Compute each child's hash (bottom-up)
    for (const [, child] of node.children) {
      if (child.type === 'dir') {
        child.hash = await this._computeRootHash(child);
      }
    }

    return snapshotStore.computeDirHash(node);
  }
}

export const integrityService = new IntegrityService();
