import express from 'express';
import { getProviderHealthSnapshot } from '../services/llm/providerHealthService.js';
import { getTelemetryDashboard } from '../services/llm/telemetryService.js';

const router = express.Router();

router.get('/control-plane', (_req, res) => {
  res.json({
    health: getProviderHealthSnapshot(),
    telemetry: getTelemetryDashboard(),
  });
});

export default router;
