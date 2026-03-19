const PROVIDER_QUOTAS = {
  groq: { rpm: 30, rph: 14400, rpd: 14400 }, // Based on Llama 3.3 70B tier
  nvidia: { rpm: 20, rpd: 5000 }, // Based on NIM Free Tier
  github: { rpm: 15, rpd: 150 }, // strict github limits per model
  openrouter: { rpm: 10, rpd: 500 }, // fallback generic limit
  together: { rpm: 20, rpd: 1000 }, // Together AI free tier
  cerebras: { rpm: 30, rpd: 5000 }, // Cerebras free tier (fast)
  huggingface: { rpm: 10, rpd: 300 }, // HuggingFace inference free tier
};

class RateLimitManager {
  constructor() {
    this.usageData = new Map(); // Provider -> { minute: [], hour: [], day: [] } (Arrays of timestamps)
  }

  _initProvider(provider) {
    if (!this.usageData.has(provider)) {
      this.usageData.set(provider, { minute: [], hour: [], day: [] });
    }
  }

  _cleanupStale(provider) {
    const now = Date.now();
    const data = this.usageData.get(provider);

    // Remove timestamps outside their respective windows
    data.minute = data.minute.filter((t) => now - t < 60000);
    data.hour = data.hour.filter((t) => now - t < 3600000);
    data.day = data.day.filter((t) => now - t < 86400000);
  }

  /**
   * Tracks a successful (or attempted) API request
   */
  recordUsage(provider) {
    this._initProvider(provider);
    const data = this.usageData.get(provider);
    const now = Date.now();
    data.minute.push(now);
    data.hour.push(now);
    data.day.push(now);
    this._cleanupStale(provider);
  }

  /**
   * Calculates the percentage of quota remaining (lowest bottleneck wins)
   * 1.0 = 100% capacity available, 0.0 = rate limited.
   */
  calculateHeadroom(provider) {
    this._initProvider(provider);
    this._cleanupStale(provider);

    const quota = PROVIDER_QUOTAS[provider];
    if (!quota) return 1.0; // Unknown provider, assume infinite quota

    const data = this.usageData.get(provider);

    const headrooms = [];
    if (quota.rpm) headrooms.push(Math.max(0, (quota.rpm - data.minute.length) / quota.rpm));
    if (quota.rph) headrooms.push(Math.max(0, (quota.rph - data.hour.length) / quota.rph));
    if (quota.rpd) headrooms.push(Math.max(0, (quota.rpd - data.day.length) / quota.rpd));

    // Return the tightest constraint
    return Math.min(...headrooms);
  }

  isApproachingLimit(provider, threshold = 0.2) {
    const headroom = this.calculateHeadroom(provider);
    return headroom <= threshold;
  }

  isExhausted(provider) {
    return this.calculateHeadroom(provider) <= 0;
  }
}

export const activeRateLimiter = new RateLimitManager();
