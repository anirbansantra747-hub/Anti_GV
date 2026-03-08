/**
 * @file eventBus.js
 * @description Lightweight unidirectional internal Pub/Sub event bus.
 * The Controller Layer: UI dispatches intents DOWN, Core Runtime broadcasts state UP.
 *
 * All valid workspace intent/event names are defined here.
 *
 * Safety: per-event throttle prevents runaway emit loops.
 */

// ── Intent Events (UI → Core) ────────────────────────────────────────────────
export const Events = {
  // File System intents
  FS_WRITE_INTENT: 'fs:write:intent', // User / AI wants to write a file
  FS_DELETE_INTENT: 'fs:delete:intent', // User wants to delete a file/dir
  FS_MKDIR_INTENT: 'fs:mkdir:intent', // User wants to create a directory

  // AI mutation intents
  AI_EDIT_INTENT: 'ai:edit:intent', // AI agent proposes a set of patches
  AI_APPROVE_DIFF: 'ai:diff:approve', // User clicks "Accept" on diff review
  AI_REJECT_DIFF: 'ai:diff:reject', // User clicks "Reject"

  // State machine transitions (Core → UI)
  WS_STATE_CHANGED: 'ws:state:changed', // Workspace state changed (e.g. IDLE → AI_PENDING)
  FS_MUTATED: 'fs:mutated', // File system tree was mutated (triggers re-render)
  CACHE_SAVED: 'cache:saved', // Tier 2 IndexedDB write succeeded
  CACHE_LOAD_SUCCESS: 'cache:load:success', // Tier 2 hydration succeeded on recovery
  CACHE_LOAD_FAIL: 'cache:load:fail', // Tier 2 hydration failed (corrupt/stale)
  DIFF_READY: 'diff:ready', // Shadow tree diff is ready for review
  CONFLICT_DETECTED: 'conflict:detected', // remote.version !== local.version
  FS_INTEGRITY_FAIL: 'fs:integrity:fail', // Merkle root hash diverged from stored version
};

/** Default throttle interval (ms) — 0 means no throttle */
const DEFAULT_THROTTLE_MS = 0;

/**
 * Events that fire frequently and should be throttled to prevent runaway loops.
 * Value is the minimum interval in ms between consecutive emissions.
 */
const THROTTLED_EVENTS = {
  [Events.FS_MUTATED]: 16, // ~60fps cap
};

/**
 * Circuit breaker config:
 *  - WINDOW_MS:    Sliding window for counting emissions
 *  - MAX_PER_WINDOW: Max emits per window before the circuit trips
 *  - COOLDOWN_MS:  How long to suppress after tripping
 */
const CB_WINDOW_MS = 1000;
const CB_MAX_PER_WINDOW = 50;
const CB_COOLDOWN_MS = 2000;

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();

    /** @type {Map<string, number>} — last emit timestamp per throttled event */
    this._lastEmit = new Map();

    /** @type {Map<string, ReturnType<typeof setTimeout> | null>} — pending trailing emits */
    this._pendingEmit = new Map();

    // ── Circuit Breaker State ──────────────────────────────────────────────
    /** @type {Map<string, number[]>} — recent emit timestamps per event */
    this._cbTimestamps = new Map();
    /** @type {Map<string, number>} — when a tripped circuit can reset (0 = not tripped) */
    this._cbTrippedUntil = new Map();
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
   * Circuit breaker: drops events if rate exceeds 50/sec for a single event.
   * Throttled events are rate-limited with a trailing emit to ensure the last value is delivered.
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    // ── Circuit Breaker ──────────────────────────────────────────────────
    const now = performance.now();
    const trippedUntil = this._cbTrippedUntil.get(event) ?? 0;

    if (trippedUntil > now) {
      // Circuit is open — drop silently
      return;
    }

    // Track timestamps in a sliding window
    let stamps = this._cbTimestamps.get(event);
    if (!stamps) {
      stamps = [];
      this._cbTimestamps.set(event, stamps);
    }
    stamps.push(now);

    // Evict timestamps older than the window
    while (stamps.length > 0 && stamps[0] < now - CB_WINDOW_MS) {
      stamps.shift();
    }

    if (stamps.length > CB_MAX_PER_WINDOW) {
      // Trip the circuit
      this._cbTrippedUntil.set(event, now + CB_COOLDOWN_MS);
      console.error(
        `[EventBus] ⚡ CIRCUIT BREAKER — "${event}" emitted ${stamps.length}x in ${CB_WINDOW_MS}ms. ` +
          `Suppressing for ${CB_COOLDOWN_MS}ms. Likely a runaway loop.`
      );
      stamps.length = 0; // Reset window
      return;
    }

    // ── Throttle ─────────────────────────────────────────────────────────
    const throttleMs = THROTTLED_EVENTS[event] ?? DEFAULT_THROTTLE_MS;

    if (throttleMs > 0) {
      const last = this._lastEmit.get(event) ?? 0;
      const elapsed = now - last;

      if (elapsed < throttleMs) {
        // Schedule a trailing emit if not already pending
        if (!this._pendingEmit.get(event)) {
          this._pendingEmit.set(
            event,
            setTimeout(() => {
              this._pendingEmit.set(event, null);
              this._lastEmit.set(event, performance.now());
              this._dispatch(event, payload);
            }, throttleMs - elapsed)
          );
        }
        return;
      }

      this._lastEmit.set(event, now);
    }

    this._dispatch(event, payload);
  }

  /**
   * Internal dispatch — actually calls all listeners.
   * @param {string} event
   * @param {any} [payload]
   */
  _dispatch(event, payload) {
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
