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
  },
};

export function startRunTelemetry(runId, seed = {}) {
  const record = {
    runId,
    startedAt: new Date().toISOString(),
    prompt: seed.prompt || '',
    stages: [],
    providerSelections: [], // Used for waterfalls
    ensembleRaces: [], // Used for parallel races / consensus
    tokens: [],
    status: 'running',
    quality: {
      consensusScore: null,
      validatorAgreement: null,
    },
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

export function recordRepairMetric(runId, model, rotations) {
  const record = runMetrics.get(runId);
  if (record) {
    record.quality.repairAttempts = (record.quality.repairAttempts || 0) + rotations;
  }

  aggregate.qualityMetrics.repairAttempts += rotations;

  // Track per-model stats for drift detection
  if (!aggregate.qualityMetrics.modelStats) {
    aggregate.qualityMetrics.modelStats = {};
  }
  if (!aggregate.qualityMetrics.modelStats[model]) {
    aggregate.qualityMetrics.modelStats[model] = {
      totalTasks: 0,
      totalRepairs: 0,
      recentRepairs: [],
    };
  }

  const stats = aggregate.qualityMetrics.modelStats[model];
  stats.totalTasks += 1;
  stats.totalRepairs += rotations;

  // Keep a sliding window of the last 50 tasks for this model
  stats.recentRepairs.push(rotations > 0 ? 1 : 0);
  if (stats.recentRepairs.length > 50) {
    stats.recentRepairs.shift();
  }
}

export function getDriftAlerts() {
  const alerts = [];
  const modelStats = aggregate.qualityMetrics.modelStats || {};

  for (const [model, stats] of Object.entries(modelStats)) {
    if (stats.recentRepairs.length >= 10) {
      const recentRepairRate =
        stats.recentRepairs.reduce((a, b) => a + b, 0) / stats.recentRepairs.length;
      const historicalRepairRate =
        (stats.totalRepairs - stats.recentRepairs.reduce((a, b) => a + b, 0)) /
        Math.max(1, stats.totalTasks - stats.recentRepairs.length);

      // If the recent repair rate is 30% higher than historical, and absolute rate > 20%, it's drifting
      if (recentRepairRate > 0.2 && recentRepairRate > historicalRepairRate * 1.3) {
        alerts.push({
          model,
          level: 'warning',
          message: `Model ${model} is showing performance drift (repair rate: ${(recentRepairRate * 100).toFixed(1)}%).`,
          recentRepairRate,
          historicalRepairRate,
        });
      }
    }
  }
  return alerts;
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
    driftAlerts: getDriftAlerts(),
  };
}
