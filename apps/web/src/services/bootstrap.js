/* eslint-disable no-unused-vars */
/**
 * @file bootstrap.js
 * @description Application startup sequence for the V3 Workspace Runtime.
 * Must run BEFORE any React components mount.
 *
 * Order matters:
 *  1. Crash Recovery (IDB hydration) — restores Tier 1 from last known-good state
 *  2. Tab Sync Init — elects master/slave, sets up BroadcastChannel
 *  3. File Watcher — seeds last-known hashes from recovered state
 *  4. Integrity Service — starts background Merkle hash check loop
 *  5. EventBus listeners for global error reporting
 */

import { tabSyncService } from './tabSyncService.js';
import { integrityService } from './integrityService.js';
import { fileWatcher } from './fileWatcher.js';
import { bus, Events } from './eventBus.js';
import { isFsError } from './fsErrors.js';

// ⚠️ CRITICAL: import as a side-effect to activate the FS_MUTATED → IDB debounced auto-save subscription.
// Without this, files written to memfs are NEVER persisted to IndexedDB.
import './persistenceService.js';
// Activate the formal V3 workspace state machine (IDLE → AI_PENDING → DIFF_REVIEW → COMMITTING).
// Self-wires via eventBus — no further setup needed.
import './workspaceMachine.js';

/**
 * @returns {Promise<{
 *   recovered: boolean,
 *   role: 'master' | 'slave' | 'unknown'
 * }>}
 */
export async function bootstrap() {
  console.log('[Bootstrap] Starting V3 Workspace Runtime…');

  // ── Step 1: Start empty; user must explicitly open a folder ───────────────
  const recovered = false;
  console.log('[Bootstrap] Recovery: ⚠️ Fresh start (no auto-open)');

  // ── Step 2: Tab Sync (master/slave election via Web Locks) ───────────────
  await tabSyncService.init();
  console.log(`[Bootstrap] Tab role: ${tabSyncService.role}`);

  // ── Step 3: Seed File Watcher with recovered FS state ────────────────────
  fileWatcher.forceSync();

  // ── Step 4: Start Background Integrity Checks (master tab only) ──────────
  if (tabSyncService.role === 'master') {
    integrityService.start();
    console.log('[Bootstrap] Integrity checker started (master tab).');
  }

  // ── Step 5: Global error boundary for FS errors ──────────────────────────
  bus.on(Events.FS_INTEGRITY_FAIL, ({ storedVersion, computedVersion, error }) => {
    console.error(
      `[Bootstrap] ⚠️ FS INTEGRITY FAILURE\n` +
        `  Stored:   ${storedVersion?.slice(0, 8)}\n` +
        `  Computed: ${computedVersion?.slice(0, 8)}\n` +
        `  Action:   Workspace frozen in ERROR state. Please reload.`
    );
    // Dispatch a custom DOM event so React error boundaries can surface this
    window.dispatchEvent(
      new CustomEvent('antigv:fs:error', {
        detail: { code: 'FS_CORRUPTION', error },
      })
    );
  });

  // Surface typed FS errors from the eventBus to the global error handler
  bus.on(Events.CONFLICT_DETECTED, ({ localVersion, remoteVersion }) => {
    console.warn(
      `[Bootstrap] Conflict detected: ${localVersion?.slice(0, 8)} ↔ ${remoteVersion?.slice(0, 8)}`
    );
  });

  console.log('[Bootstrap] ✅ V3 Workspace Runtime ready.');
  return { recovered, role: tabSyncService.role };
}
