import { getTaskRouteConfig, MODEL_REGISTRY } from './modelRegistry.js';
import { getProviderHealthSnapshot, isProviderAvailable } from './providerHealthService.js';

function scoreCandidate(model, route, healthState) {
  const weights = route.scoreWeights;
  const taskFit = model.taskFit.includes(route.taskType) ? 1 : 0.15;
  const availability = !healthState || isProviderAvailable(model.provider) ? 1 : 0;
  const latency = model.latencyP95 ? Math.max(0.1, 1 - model.latencyP95 / 5000) : 0.5;
  const cost = model.costTier === 0 ? 1 : 0.4;

  return (
    taskFit * weights.taskFit +
    availability * weights.availability +
    latency * weights.latency +
    cost * weights.cost
  );
}

export function selectRoute(taskType, overrides = {}) {
  const route = { ...getTaskRouteConfig(taskType), ...overrides, taskType };
  const health = getProviderHealthSnapshot();
  const preferred = new Set(route.preferredModels || []);

  const candidates = MODEL_REGISTRY.filter(
    (model) =>
      (model.taskFit.includes(taskType) || preferred.has(model.modelId)) &&
      isProviderAvailable(model.provider)
  )
    .map((model) => ({
      ...model,
      score: scoreCandidate(model, route, health[model.provider]),
    }))
    .sort((a, b) => {
      if (preferred.has(a.modelId) !== preferred.has(b.modelId)) {
        return preferred.has(a.modelId) ? -1 : 1;
      }
      if (b.score !== a.score) return b.score - a.score;
      return a.fallbackPriority - b.fallbackPriority;
    });

  if (candidates.length === 0) {
    throw new Error(`No available LLM routes for task "${taskType}"`);
  }

  return {
    route,
    selected: candidates[0],
    candidates,
    health,
  };
}
