import crypto from 'crypto';

class CacheService {
  constructor() {
    this.memory = new Map(); // hash -> { taskType, prompt, contextHash, data, expiresAt }
    this.SIMILARITY_THRESHOLD = 0.92; // 92% word overlap required for fuzzy match
  }

  _generateKey(taskType, prompt, contextHash = '') {
    const raw = `${taskType}::${prompt.trim().toLowerCase()}::${contextHash}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  _getTokens(text) {
    return new Set(text.toLowerCase().split(/\W+/).filter(Boolean));
  }

  _calculateJaccardSimilarity(setA, setB) {
    if (setA.size === 0 && setB.size === 0) return 1.0;
    const intersection = new Set([...setA].filter((x) => setB.has(x)));
    const union = new Set([...setA, ...setB]);
    return intersection.size / union.size;
  }

  set(taskType, prompt, data, ttlMs = 3600000, contextHash = '') {
    const key = this._generateKey(taskType, prompt, contextHash);
    this.memory.set(key, {
      taskType,
      prompt,
      contextHash,
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get(taskType, prompt, contextHash = '') {
    const exactKey = this._generateKey(taskType, prompt, contextHash);
    const now = Date.now();

    // 1. Exact Match Fast Path
    const entry = this.memory.get(exactKey);
    if (entry && now <= entry.expiresAt) {
      return JSON.parse(JSON.stringify(entry.data));
    }
    if (entry && now > entry.expiresAt) {
      this.memory.delete(exactKey);
    }

    // 2. Fuzzy Match Slow Path
    const targetTokens = this._getTokens(prompt);
    let bestMatchKey = null;
    let highestSim = 0;

    for (const [key, cached] of this.memory.entries()) {
      // TTL Check
      if (now > cached.expiresAt) {
        this.memory.delete(key);
        continue;
      }
      // Strict constraints: must match taskType and exact contextHash
      if (cached.taskType !== taskType || cached.contextHash !== contextHash) {
        continue;
      }

      const cachedTokens = this._getTokens(cached.prompt);
      const sim = this._calculateJaccardSimilarity(targetTokens, cachedTokens);

      if (sim > highestSim && sim >= this.SIMILARITY_THRESHOLD) {
        highestSim = sim;
        bestMatchKey = key;
      }
    }

    if (bestMatchKey) {
      const fuzzyEntry = this.memory.get(bestMatchKey);
      // Optional telemetry log here
      console.log(`[CacheService] Fuzzy cache hit! Similarity: ${(highestSim * 100).toFixed(1)}%`);
      return JSON.parse(JSON.stringify(fuzzyEntry.data));
    }

    return null;
  }

  invalidate(taskType) {
    for (const [key, value] of this.memory.entries()) {
      if (value.taskType === taskType) {
        this.memory.delete(key);
      }
    }
  }

  clearAll() {
    this.memory.clear();
  }
}

export const activeCache = new CacheService();
