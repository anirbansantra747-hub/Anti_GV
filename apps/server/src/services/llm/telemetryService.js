const runMetrics = new Map();
const aggregate = {
  totalRuns: 0,
  stageTimings: {},
  providerUsage: {},
  taskUsage: {},
  healthEvents: [],
  qualityMetrics: {
    consensusSuccesses: 0,
    consensusFailures: 0,
    repairAttempts: 0,
    preFlightPasses: 0,
  }
};

export function startRunTelemetry(runId, seed = {}) {
  const record = {
    runId,
    startedAt: new Date().toISOString(),
    prompt: seed.prompt || '',
    stages: [],
    providerSelections: [], // Used for waterfalls
    ensembleRaces: [],      // Used for parallel races / consensus
    tokens: [],
    status: 'running',
    quality: {
      consensusScore: null,
      validatorAgreement: null,
    }
  };
  runMetrics.set(runId, record);
  aggregate.totalRuns += 1;
  return record;
}

export function recordStageMetric(runId, metric) {
  const record = runMetrics.get(runId);
  if (!record) return;
  record.stages.push(metric);
  if (metric.stage) {
    const current = aggregate.stageTimings[metric.stage] || { count: 0, totalMs: 0 };
    current.count += 1;
    current.totalMs += metric.latencyMs || 0;
    aggregate.stageTimings[metric.stage] = current;
  }
}

export function recordProviderSelection(runId, payload) {
  const record = runMetrics.get(runId);
  if (!record) return;
  record.providerSelections.push(payload);
  const providerKey = `${payload.provider}:${payload.model}`;
  aggregate.providerUsage[providerKey] = (aggregate.providerUsage[providerKey] || 0) + 1;
  aggregate.taskUsage[payload.taskType] = (aggregate.taskUsage[payload.taskType] || 0) + 1;
}

export function recordEnsembleRace(runId, payload) {
  const record = runMetrics.get(runId);
  if (!record) return;
  record.ensembleRaces.push(payload);
}

export function recordTokenUsage(runId, payload) {
  const record = runMetrics.get(runId);
  if (!record) return;
  record.tokens.push(payload);
}

export function recordHealthEvent(event) {
  aggregate.healthEvents.push({ ...event, timestamp: new Date().toISOString() });
  // Keep last 50 events
  if (aggregate.healthEvents.length > 50) {
    aggregate.healthEvents.shift();
  }
}

export function recordShadowEval(payload) {
  aggregate.qualityMetrics.shadowEvals = aggregate.qualityMetrics.shadowEvals || [];
  aggregate.qualityMetrics.shadowEvals.push({ ...payload, timestamp: new Date().toISOString() });
  if (aggregate.qualityMetrics.shadowEvals.length > 50) {
    aggregate.qualityMetrics.shadowEvals.shift();
  }
}

export function finishRunTelemetry(runId, status, extra = {}) {
  const record = runMetrics.get(runId);
  if (!record) return null;
  record.status = status;
  record.finishedAt = new Date().toISOString();
  Object.assign(record, extra);
  return record;
}

export function getTelemetryDashboard() {
  return {
    aggregate,
    runs: Array.from(runMetrics.values()).slice(-20),
  };
}
