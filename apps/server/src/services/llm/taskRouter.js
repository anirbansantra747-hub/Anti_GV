import { getTaskRouteConfig, MODEL_REGISTRY } from './modelRegistry.js';
import { getProviderHealthSnapshot, isProviderAvailable } from './providerHealthService.js';
import { activeRateLimiter } from './rateLimitManager.js';

function getAvailableModels(poolNames, healthState, forceFallback = false) {
  return poolNames
    .map((name) => MODEL_REGISTRY.find((m) => m.modelId === name))
    .filter((model) => {
      if (!model) return false;

      const isHealthy =
        isProviderAvailable(model.provider) ||
        healthState?.[model.provider]?.circuitState === 'half_open';
      const hasHeadroom = !activeRateLimiter.isExhausted(model.provider);

      // If forceFallback is true, we still restrict strictly exhausted providers
      return isHealthy && hasHeadroom;
    });
}

export function selectRoute(taskType, overrides = {}) {
  const route = { ...getTaskRouteConfig(taskType), ...overrides, taskType };
  const health = getProviderHealthSnapshot();

  // Resolve models for each pool
  let primaryPool = getAvailableModels(route.primaryPool || [], health);
  const fallbackPool = getAvailableModels(route.fallbackPool || [], health);
  const emergencyPool = getAvailableModels(route.emergencyPool || [], health);
  const experimentalPool = getAvailableModels(route.experimentalPool || [], health);

  // A/B Testing Infrastructure: Route % of traffic to experimental tier
  const isExperimentActive = route.experimentTraffic && Math.random() < route.experimentTraffic;
  if (isExperimentActive && experimentalPool.length > 0) {
    console.log(
      `[TaskRouter] A/B Test Active: Routing traffic to experimental models for ${taskType}`
    );
    primaryPool = [...experimentalPool, ...primaryPool]; // Prepend experimental so they try first
  }

  // Apply phase 4 "forceFallback" logic from Fixer / Failure pattern detector
  if (overrides.forceFallback) {
    primaryPool = [];
  }

  // Phase 5 Rate Limit Routing: If all primary pool providers are approaching limits (<20% headroom),
  // aggressively blend in the fallback pool to shed load.
  const allPrimaryPressured =
    primaryPool.length > 0 &&
    primaryPool.every((m) => activeRateLimiter.isApproachingLimit(m.provider));

  let candidates = [];
  if (allPrimaryPressured) {
    console.warn(
      `[TaskRouter] Primary pool is rate-pressured. Shifting traffic to fallback pool for ${taskType}`
    );
    candidates = [...fallbackPool, ...primaryPool, ...emergencyPool]; // Deprioritize primary
  } else {
    candidates = [...primaryPool, ...fallbackPool, ...emergencyPool];
  }

  if (candidates.length === 0) {
    throw new Error(`[TaskRouter] Circuit breaker tripped for all models in task "${taskType}"`);
  }

  return {
    route,
    strategy: route.strategy,
    pools: {
      primary: primaryPool,
      fallback: fallbackPool,
      emergency: emergencyPool,
    },
    // Keep 'selected' and 'candidates' for backward compatibility with existing waterfall loops
    // until we fully implement the parallel executor in Phase 2
    selected: candidates[0],
    candidates,
    health,
  };
}
