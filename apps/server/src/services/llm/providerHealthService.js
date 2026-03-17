import { LIMITS, PROVIDER_AVAILABILITY } from '@antigv/shared';

const providerState = new Map();

function getDefaultState(provider) {
  return {
    provider,
    availabilityState: PROVIDER_AVAILABILITY.UNKNOWN,
    latencyP95: null,
    errorRate: 0,
    lastError: null,
    successes: 0,
    failures: 0,
    recentErrors: [],
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

function trimRecentErrors(state, now = Date.now()) {
  state.recentErrors = state.recentErrors.filter(
    (ts) => now - ts <= LIMITS.OPENROUTER_BREAKER_WINDOW_MS
  );
}

export function getProviderHealthSnapshot() {
  const snapshot = {};
  for (const [provider, state] of providerState.entries()) {
    trimRecentErrors(state);
    snapshot[provider] = { ...state };
  }
  return snapshot;
}

export function isProviderAvailable(provider) {
  const state = getState(provider);
  if (state.breakerUntil > Date.now()) return false;
  return state.availabilityState !== PROVIDER_AVAILABILITY.OPEN;
}

export function recordProviderSuccess(provider, latencyMs) {
  const state = getState(provider);
  state.successes += 1;
  state.lastUpdatedAt = new Date().toISOString();
  state.availabilityState = PROVIDER_AVAILABILITY.HEALTHY;
  state.lastError = null;
  if (typeof latencyMs === 'number') {
    state.latencyP95 =
      state.latencyP95 == null ? latencyMs : Math.round(state.latencyP95 * 0.8 + latencyMs * 0.2);
  }
  const total = state.successes + state.failures;
  state.errorRate = total ? Number((state.failures / total).toFixed(4)) : 0;
}

export function recordProviderFailure(provider, error) {
  const state = getState(provider);
  const now = Date.now();
  state.failures += 1;
  state.lastUpdatedAt = new Date().toISOString();
  state.lastError = error?.message || String(error);
  state.recentErrors.push(now);
  trimRecentErrors(state, now);
  const total = state.successes + state.failures;
  state.errorRate = total ? Number((state.failures / total).toFixed(4)) : 1;
  state.availabilityState = PROVIDER_AVAILABILITY.DEGRADED;

  if (provider === 'openrouter' && state.recentErrors.length >= LIMITS.OPENROUTER_BREAKER_ERRORS) {
    state.availabilityState = PROVIDER_AVAILABILITY.OPEN;
    state.breakerUntil = now + LIMITS.OPENROUTER_BREAKER_WINDOW_MS;
  }
}

export function updateProviderAvailability(provider, available, details = {}) {
  const state = getState(provider);
  state.lastUpdatedAt = new Date().toISOString();
  state.availabilityState = available
    ? PROVIDER_AVAILABILITY.HEALTHY
    : PROVIDER_AVAILABILITY.DEGRADED;
  if (typeof details.latencyP95 === 'number') state.latencyP95 = details.latencyP95;
  if (details.lastError) state.lastError = details.lastError;
}
