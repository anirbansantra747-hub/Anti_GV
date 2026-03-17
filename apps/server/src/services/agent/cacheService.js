import crypto from 'crypto';

class CacheService {
  constructor() {
    this.memory = new Map(); // hash -> { data, expiresAt }
  }

  /**
   * Generates a deterministic key based on the prompt, task type, and optionally context.
   */
  _generateKey(taskType, prompt, contextHash = '') {
    const raw = `${taskType}::${prompt.trim().toLowerCase()}::${contextHash}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  set(taskType, prompt, data, ttlMs = 3600000, contextHash = '') {
    const key = this._generateKey(taskType, prompt, contextHash);
    this.memory.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get(taskType, prompt, contextHash = '') {
    const key = this._generateKey(taskType, prompt, contextHash);
    const entry = this.memory.get(key);

    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.memory.delete(key);
      return null;
    }

    // Deep clone to prevent memory mutation by consumers
    return JSON.parse(JSON.stringify(entry.data));
  }

  invalidate(taskType) {
    for (const [key, value] of this.memory.entries()) {
      if (key.startsWith(`${taskType}::`)) {
        this.memory.delete(key);
      }
    }
  }

  clearAll() {
    this.memory.clear();
  }
}

export const activeCache = new CacheService();
