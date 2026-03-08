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

import { tryRecover } from './crashRecovery.js';
import { tabSyncService } from './tabSyncService.js';
import { integrityService } from './integrityService.js';
import { fileWatcher } from './fileWatcher.js';
import { bus, Events } from './eventBus.js';
import { isFsError } from './fsErrors.js';

/**
 * @returns {Promise<{
 *   recovered: boolean,
 *   role: 'master' | 'slave' | 'unknown'
 * }>}
 */
export async function bootstrap() {
  console.log('[Bootstrap] Starting V3 Workspace Runtime…');

  // ── Step 1: Crash Recovery ────────────────────────────────────────────────
  let recovered = false;
  try {
    recovered = await tryRecover();
    console.log(`[Bootstrap] Recovery: ${recovered ? '✅ Hydrated from IDB' : '⚠️ Fresh start'}`);
  } catch (err) {
    console.error('[Bootstrap] Recovery error (non-fatal):', err);
  }

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
