import { generateTaskResponse } from '../llm/llmRouter.js';
import { recordShadowEval } from '../llm/telemetryService.js';
import { ROUTING_STRATEGY } from '../llm/modelRegistry.js';

class ShadowEvalService {

  /**
   * Fires an asynchronous, background evaluation of a prompt against a secondary model pool.
   * Does NOT block the main execution flow.
   * 
   * @param {string} taskType The task type being evaluated (e.g., PLAN_VALIDATION)
   * @param {Array} messages The exact messages sent to the primary model
   * @param {Object} primaryResult The result from the primary model for comparison
   */
  async dispatchShadowEval(taskType, messages, primaryResult) {
    if (process.env.DISABLE_SHADOW_EVAL) return;

    // Run completely in background
    setTimeout(async () => {
      try {
        const start = Date.now();
        // Force the router to evaluate the fallback/emergency pool for the shadow run
        const shadowResult = await generateTaskResponse(messages, {
          taskType,
          jsonMode: true,
          routeOverrides: {
             strategy: ROUTING_STRATEGY.WATERFALL,
             forceFallback: true // Will route to GitHub or Together AI usually
          }
        });

        const latency = Date.now() - start;

        // Perform basic similarity / divergence checks here.
        // For structured JSON (like Planning or Critic), we can compare keys.
        const primaryData = typeof primaryResult.content === 'string' ? JSON.parse(primaryResult.content) : primaryResult.content;
        const shadowData = typeof shadowResult.content === 'string' ? JSON.parse(shadowResult.content) : shadowResult.content;

        // Example divergence check: Do the critics agree?
        let divergence = 0;
        if (primaryData.isCorrect !== undefined && shadowData.isCorrect !== undefined) {
           divergence = primaryData.isCorrect === shadowData.isCorrect ? 0 : 1;
        }

        // Record finding to Telemetry Dashboard
        recordShadowEval({
          taskType,
          primaryModel: primaryResult.model,
          shadowModel: shadowResult.model,
          divergenceScore: divergence,
          shadowLatencyMs: latency
        });

        console.log(`[ShadowEval] Completed background check. Primary: ${primaryResult.model}, Shadow: ${shadowResult.model}. Divergence: ${divergence}`);

      } catch (error) {
        // Suppress shadow eval failures as they are non-critical
        console.warn(`[ShadowEval] Background evaluation failed silently:`, error.message);
      }
    }, 0);
  }
}

export const activeShadowEval = new ShadowEvalService();
