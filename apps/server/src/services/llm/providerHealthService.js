import { PROVIDER_AVAILABILITY } from '@antigv/shared';

// Specific circuit breaker policies identified in ai-plan.md
export const PROVIDER_POLICIES = {
  groq: {
    failureThreshold: 5,
    errorRateThreshold: 0.5,
    windowSizeMs: 300000, // 5 min
    halfOpenAfterMs: 60000, // 1 min recovery test
  },
  nvidia: {
    failureThreshold: 5,
    errorRateThreshold: 0.5,
    windowSizeMs: 600000, // 10 min
    halfOpenAfterMs: 60000,
  },
  github: {
    failureThreshold: 3,
    errorRateThreshold: 0.4,
    windowSizeMs: 300000, // 5 min
    halfOpenAfterMs: 60000,
  },
  openrouter: {
    failureThreshold: 2,
    errorRateThreshold: 0.3,
    windowSizeMs: 300000, // 5 min
    halfOpenAfterMs: 600000, // 10 min cooldown (strict)
  },
  default: {
    failureThreshold: 5,
    errorRateThreshold: 0.5,
    windowSizeMs: 300000,
    halfOpenAfterMs: 60000,
  },
};

const providerState = new Map();

function getPolicy(provider) {
  return PROVIDER_POLICIES[provider] || PROVIDER_POLICIES.default;
}

function getDefaultState(provider) {
  return {
    provider,
    availabilityState: PROVIDER_AVAILABILITY.UNKNOWN, // Initial state
    circuitState: 'closed', // 'closed' | 'half_open' | 'open'
    latencyP50: null,
    latencyP95: null,
    errorRate: 0,
    lastError: null,
    successes: 0,
    failures: 0,
    recentRequests: [], // Form: { ts: timestamp, error: boolean }
    breakerUntil: 0,
    lastUpdatedAt: null,
  };
}

function getState(provider) {
  if (!providerState.has(provider)) {
    providerState.set(provider, getDefaultState(provider));
  }
  return providerState.get(provider);
}

function trimRecentRequests(state, windowSizeMs, now = Date.now()) {
  state.recentRequests = state.recentRequests.filter((req) => now - req.ts <= windowSizeMs);
}

function calculateErrorRate(recentRequests) {
  if (recentRequests.length === 0) return 0;
  const errors = recentRequests.filter((req) => req.error).length;
  return errors / recentRequests.length;
}

function evaluateCircuitBreaker(state, policy, now) {
  if (state.circuitState === 'open') {
    if (now > state.breakerUntil) {
      // Transition to half-open to test the waters
      state.circuitState = 'half_open';
      state.availabilityState = PROVIDER_AVAILABILITY.DEGRADED; 
    }
    return;
  }

  const recentErrors = state.recentRequests.filter((req) => req.error).length;
  const errorRate = calculateErrorRate(state.recentRequests);

  state.errorRate = errorRate;

  if (
    state.circuitState === 'closed' &&
    recentErrors >= policy.failureThreshold &&
    errorRate >= policy.errorRateThreshold
  ) {
    // Trip the breaker
    state.circuitState = 'open';
    state.availabilityState = PROVIDER_AVAILABILITY.OPEN;
    state.breakerUntil = now + policy.halfOpenAfterMs;
    console.warn(`[CircuitBreaker] Tripped OPEN for ${state.provider}. Cooldown: ${policy.halfOpenAfterMs}ms`);
  }
}

export function getProviderHealthSnapshot() {
  const snapshot = {};
  const now = Date.now();
  for (const [provider, state] of providerState.entries()) {
    const policy = getPolicy(provider);
    trimRecentRequests(state, policy.windowSizeMs, now);
    evaluateCircuitBreaker(state, policy, now);
    snapshot[provider] = { ...state };
  }
  return snapshot;
}

export function isProviderAvailable(provider) {
  const state = getState(provider);
  const now = Date.now();
  const policy = getPolicy(provider);
  
  evaluateCircuitBreaker(state, policy, now);
  
  if (state.circuitState === 'open') return false;
  return true;
}

export function recordProviderSuccess(provider, latencyMs) {
  const state = getState(provider);
  const now = Date.now();
  const policy = getPolicy(provider);

  state.successes += 1;
  state.lastUpdatedAt = new Date().toISOString();
  state.lastError = null;
  state.recentRequests.push({ ts: now, error: false });

  if (state.circuitState === 'half_open') {
    // A success while half-open closes the breaker
    state.circuitState = 'closed';
    state.availabilityState = PROVIDER_AVAILABILITY.HEALTHY;
    console.log(`[CircuitBreaker] Reset to CLOSED for ${provider}`);
  } else if (state.circuitState === 'closed') {
    state.availabilityState = PROVIDER_AVAILABILITY.HEALTHY;
  }

  if (typeof latencyMs === 'number') {
    state.latencyP95 =
      state.latencyP95 == null ? latencyMs : Math.round(state.latencyP95 * 0.9 + latencyMs * 0.1);
    state.latencyP50 = 
      state.latencyP50 == null ? latencyMs : Math.round(state.latencyP50 * 0.7 + latencyMs * 0.3);
  }

  trimRecentRequests(state, policy.windowSizeMs, now);
  evaluateCircuitBreaker(state, policy, now);
}

export function recordProviderFailure(provider, error) {
  const state = getState(provider);
  const now = Date.now();
  const policy = getPolicy(provider);

  state.failures += 1;
  state.lastUpdatedAt = new Date().toISOString();
  state.lastError = error?.message || String(error);
  state.recentRequests.push({ ts: now, error: true });

  if (state.circuitState === 'half_open') {
    // A single failure while half-open trips it wide open again immediately
    state.circuitState = 'open';
    state.availabilityState = PROVIDER_AVAILABILITY.OPEN;
    state.breakerUntil = now + policy.halfOpenAfterMs;
    console.warn(`[CircuitBreaker] Tripped OPEN again for ${provider} from half_open state`);
  } else {
    state.availabilityState = PROVIDER_AVAILABILITY.DEGRADED;
  }

  trimRecentRequests(state, policy.windowSizeMs, now);
  evaluateCircuitBreaker(state, policy, now);
}

export function updateProviderAvailability(provider, available, details = {}) {
  const state = getState(provider);
  state.lastUpdatedAt = new Date().toISOString();
  
  if (available) {
    if (state.circuitState === 'open') {
      state.circuitState = 'closed'; // Manual reset override
    }
    state.availabilityState = PROVIDER_AVAILABILITY.HEALTHY;
  } else {
    state.availabilityState = PROVIDER_AVAILABILITY.DEGRADED;
  }

  if (typeof details.latencyP95 === 'number') state.latencyP95 = details.latencyP95;
  if (details.lastError) state.lastError = details.lastError;
}
