import express from 'express';
import { getProviderHealthSnapshot } from '../services/llm/providerHealthService.js';
import { getTelemetryDashboard } from '../services/llm/telemetryService.js';
import { activeRateLimiter } from '../services/llm/rateLimitManager.js';

const router = express.Router();

router.get('/control-plane', (_req, res) => {
  res.json({
    health: getProviderHealthSnapshot(),
    telemetry: getTelemetryDashboard(),
  });
});

// Dedicated telemetry dashboard endpoint (Phase 12 of ai-plan.md§8.1)
router.get('/telemetry/dashboard', (_req, res) => {
  const dashboard = getTelemetryDashboard();
  res.json(dashboard);
});

// Provider health snapshot endpoint
router.get('/telemetry/health', (_req, res) => {
  const health = getProviderHealthSnapshot();
  const headrooms = {};
  for (const provider of Object.keys(health)) {
    headrooms[provider] = {
      headroom: activeRateLimiter.calculateHeadroom(provider),
      isApproachingLimit: activeRateLimiter.isApproachingLimit(provider),
      isExhausted: activeRateLimiter.isExhausted(provider),
    };
  }
  res.json({ providers: health, rateLimits: headrooms });
});

export default router;
