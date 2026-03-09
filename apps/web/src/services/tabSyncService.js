/* eslint-disable no-unused-vars */
/**
 * @file tabSyncService.js
 * @description Multi-tab Master/Slave coordination using Web Locks + BroadcastChannel.
 *
 * Strategy (V3 ADR):
 *  - Only ONE tab holds the "anti_gv_write_lock" (Master).
 *  - All other tabs enter "Slave Mode" and forward edit intents to Master via BroadcastChannel.
 *  - Master receives intents, mutates Tier 1, and broadcasts STATE_SYNC back to all slaves.
 *  - After IDB write, Master broadcasts CACHE_SAVED so slaves can clear dirty indicators.
 */

import { bus, Events } from './eventBus.js';
import { memfs } from './memfsService.js';
import { blobStore } from './blobStore.js';
import { useFileSystemStore } from '../stores/fileSystemStore.js';

const LOCK_NAME = 'anti_gv_write_lock';
const CHANNEL_NAME = 'anti_gv_sync';

// BroadcastChannel message types
const MSG = {
  FILE_EDIT_INTENT: 'file_edit_intent', // Slave → Master: user typed
  STATE_SYNC: 'state_sync', // Master → All: new FS state
  CACHE_SAVED: 'cache_saved', // Master → All: IDB write done
  LOCK_STATUS: 'lock_status', // Master → All: who is master
};

class TabSyncService {
  constructor() {
    /** @type {'master'|'slave'|'unknown'} */
    this.role = 'unknown';

    /** @type {BroadcastChannel | null} */
    this._channel = null;

    /** @type {AbortController | null} */
    this._lockAbort = null;
  }

  /**
   * Initialize tab sync. Call once at app startup AFTER crashRecovery.tryRecover().
   */
  async init() {
    this._channel = new BroadcastChannel(CHANNEL_NAME);
    this._channel.onmessage = (e) => this._onMessage(e.data);

    if (!navigator.locks) {
      console.warn('[TabSync] Web Locks not available — running as single tab.');
      this.role = 'master';
      return;
    }

    this._lockAbort = new AbortController();

    // Non-blocking lock request: if we get it we're master; if not we're slave.
    navigator.locks
      .request(LOCK_NAME, { mode: 'exclusive', signal: this._lockAbort.signal }, async () => {
        this.role = 'master';
        console.log('[TabSync] 👑 This tab is MASTER.');

        // Tell all tabs we are master
        this._broadcast({ type: MSG.LOCK_STATUS, role: 'master' });

        // Keep lock held for the lifetime of the tab
        await new Promise((_, reject) => {
          this._lockAbort.signal.addEventListener('abort', reject);
          window.addEventListener('beforeunload', () => reject(new Error('tab closing')));
        });
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
      });

    // Small delay to see if we got the lock
    await new Promise((r) => setTimeout(r, 80));

    if (this.role !== 'master') {
      this.role = 'slave';
      console.log('[TabSync] 🔒 This tab is SLAVE.');
      this._wireSlaveListeners();
    } else {
      this._wireMasterListeners();
    }
  }

  // ── Master wiring ──────────────────────────────────────────────────────────

  _wireMasterListeners() {
    // After any IDB save, broadcast to all tabs
    bus.on(Events.CACHE_SAVED, ({ savedPaths }) => {
      this._broadcast({ type: MSG.CACHE_SAVED, savedPaths });
    });

    // After FS mutation, broadcast the serialized FS state to slaves
    bus.on(Events.FS_MUTATED, () => {
      const snapshot = this._serializeState();
      this._broadcast({ type: MSG.STATE_SYNC, snapshot });
    });
  }

  // ── Slave wiring ──────────────────────────────────────────────────────────

  _wireSlaveListeners() {
    // Forward any local write intents to the Master
    bus.on(Events.FS_WRITE_INTENT, (payload) => {
      this._broadcast({ type: MSG.FILE_EDIT_INTENT, payload });
    });
  }

  // ── Message Handler ───────────────────────────────────────────────────────

  _onMessage(data) {
    switch (data.type) {
      case MSG.FILE_EDIT_INTENT:
        // Only Master processes this
        if (this.role === 'master') {
          bus.emit(Events.FS_WRITE_INTENT, data.payload);
        }
        break;

      case MSG.STATE_SYNC:
        // Slave receives and applies new state
        if (this.role === 'slave') {
          this._applyStateSnapshot(data.snapshot);
        }
        break;

      case MSG.CACHE_SAVED:
        // All tabs clear dirty flags
        bus.emit(Events.CACHE_SAVED, { savedPaths: data.savedPaths });
        break;

      case MSG.LOCK_STATUS:
        if (this.role === 'unknown' && data.role === 'master') {
          this.role = 'slave';
          this._wireSlaveListeners();
        }
        break;
    }
  }

  // ── Serialization ─────────────────────────────────────────────────────────

  _serializeState() {
    return {
      workspaceId: memfs.workspace.id,
      version: memfs.workspace.version,
      state: memfs.workspace.state,
    };
  }

  _applyStateSnapshot(snapshot) {
    if (!snapshot) return;
    memfs.workspace.id = snapshot.workspaceId;
    memfs.workspace.version = snapshot.version;
    memfs.workspace.state = snapshot.state;
    // Trigger reactive store update for slave UI
    useFileSystemStore.getState().syncFromMemfs();
    console.log('[TabSync] Slave state synced from master.');
  }

  _broadcast(msg) {
    this._channel?.postMessage(msg);
  }

  /** Clean up (call on component unmount or app teardown) */
  destroy() {
    this._lockAbort?.abort();
    this._channel?.close();
  }
}

export const tabSyncService = new TabSyncService();
