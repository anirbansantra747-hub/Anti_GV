/**
 * @file eventBus.js
 * @description Lightweight unidirectional internal Pub/Sub event bus.
 * The Controller Layer: UI dispatches intents DOWN, Core Runtime broadcasts state UP.
 *
 * All valid workspace intent/event names are defined here.
 */

// ── Intent Events (UI → Core) ────────────────────────────────────────────────
export const Events = {
  // File System intents
  FS_WRITE_INTENT:     'fs:write:intent',       // User / AI wants to write a file
  FS_DELETE_INTENT:    'fs:delete:intent',       // User wants to delete a file/dir
  FS_MKDIR_INTENT:     'fs:mkdir:intent',        // User wants to create a directory

  // AI mutation intents
  AI_EDIT_INTENT:      'ai:edit:intent',         // AI agent proposes a set of patches
  AI_APPROVE_DIFF:     'ai:diff:approve',        // User clicks "Accept" on diff review
  AI_REJECT_DIFF:      'ai:diff:reject',         // User clicks "Reject"

  // State machine transitions (Core → UI)
  WS_STATE_CHANGED:    'ws:state:changed',       // Workspace state changed (e.g. IDLE → AI_PENDING)
  FS_MUTATED:          'fs:mutated',             // File system tree was mutated (triggers re-render)
  CACHE_SAVED:         'cache:saved',            // Tier 2 IndexedDB write succeeded
  CACHE_LOAD_SUCCESS:  'cache:load:success',     // Tier 2 hydration succeeded on recovery
  CACHE_LOAD_FAIL:     'cache:load:fail',        // Tier 2 hydration failed (corrupt/stale)
  DIFF_READY:          'diff:ready',             // Shadow tree diff is ready for review
  CONFLICT_DETECTED:   'conflict:detected',      // remote.version !== local.version
  FS_INTEGRITY_FAIL:   'fs:integrity:fail',      // Merkle root hash diverged from stored version
};

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {Function} callback
   * @returns {() => void} Unsubscribe function
   */
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event.
   * @param {string} event
   * @param {Function} callback
   */
  off(event, callback) {
    this._listeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event with optional payload.
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    if (!this._listeners.has(event)) return;
    for (const cb of this._listeners.get(event)) {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[EventBus] Error in listener for "${event}":`, err);
      }
    }
  }

  /**
   * Subscribe to an event and auto-unsubscribe after the first call.
   * @param {string} event
   * @param {Function} callback
   */
  once(event, callback) {
    const unsub = this.on(event, (payload) => {
      callback(payload);
      unsub();
    });
  }
}

// Export a singleton — everyone imports the same bus instance.
export const bus = new EventBus();
