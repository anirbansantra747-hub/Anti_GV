import { estimateTokens } from '@antigv/ai-core';
import { AGENT_TASK_TYPES } from '@antigv/shared';
import { generateGroqResponse, streamGroqResponse } from './groqClient.js';
import { generateGeminiResponse, streamGeminiResponse } from './geminiClient.js';
import { generateNvidiaResponse, streamNvidiaResponse } from './nvidiaClient.js';
import { generateOpenRouterResponse, streamOpenRouterResponse } from './openRouterClient.js';
import { generateGithubModelsResponse } from './githubModelsClient.js';
import { generateCerebrasResponse, streamCerebrasResponse } from './cerebrasClient.js';
import { generateTogetherResponse, streamTogetherResponse } from './togetherClient.js';
import { generateHuggingFaceResponse } from './huggingfaceClient.js';
import { recordProviderFailure, recordProviderSuccess } from './providerHealthService.js';
import {
  recordProviderSelection,
  recordTokenUsage,
  recordEnsembleRace,
} from './telemetryService.js';
import { selectRoute } from './taskRouter.js';
import { ROUTING_STRATEGY } from './modelRegistry.js';
import { allocateTokenBudget } from '../agent/tokenBudgetService.js';
import { activeRateLimiter } from './rateLimitManager.js';

const PROVIDER_EXECUTORS = {
  groq: {
    generate: generateGroqResponse,
    stream: streamGroqResponse,
  },
  gemini: {
    generate: generateGeminiResponse,
    stream: streamGeminiResponse,
  },
  nvidia: {
    generate: generateNvidiaResponse,
    stream: streamNvidiaResponse,
  },
  openrouter: {
    generate: generateOpenRouterResponse,
    stream: streamOpenRouterResponse,
  },
  github: {
    generate: generateGithubModelsResponse,
  },
  cerebras: {
    generate: generateCerebrasResponse,
    stream: streamCerebrasResponse,
  },
  together: {
    generate: generateTogetherResponse,
    stream: streamTogetherResponse,
  },
  huggingface: {
    generate: generateHuggingFaceResponse,
  },
};

function enrichOptions(selected, route, options) {
  return {
    ...options,
    model: options.model || selected.modelId,
    max_tokens: options.max_tokens || route.maxOutputTokens || selected.maxOutputTokens,
    temperature: options.temperature ?? route.temperature,
    jsonMode: options.jsonMode ?? route.jsonMode,
  };
}

function getTaskType(options = {}) {
  return options.taskType || AGENT_TASK_TYPES.CHAT_ANSWER;
}

async function executeWithRoute(mode, messages, options = {}) {
  const taskType = getTaskType(options);
  const { route, candidates, strategy } = selectRoute(taskType, options.routeOverrides);

  // Phase 5: Adaptive Budgeting
  const complexity = options.complexity || 'medium';
  const budget = allocateTokenBudget(taskType, complexity);

  // Apply budget over top of route/model defaults
  const enforceBudget = {
    maxOutputTokens: budget.output_limit,
    // We don't slice input locally, but we could if we strictly parse messages here
  };

  let lastError;

  const executeCandidate = async (candidate) => {
    const executor = PROVIDER_EXECUTORS[candidate.provider];
    if (!executor?.[mode]) {
      throw new Error(`Mode ${mode} not supported for ${candidate.provider}`);
    }

    const startedAt = Date.now();

    try {
      recordProviderSelection(options.runId, {
        taskType,
        provider: candidate.provider,
        model: candidate.modelId,
      });

      const finalOptions = enrichOptions(candidate, { ...route, ...enforceBudget }, options);
      const result = await executor[mode](messages, finalOptions);
      const latencyMs = Date.now() - startedAt;

      recordProviderSuccess(candidate.provider, latencyMs);
      activeRateLimiter.recordUsage(candidate.provider); // Phase 5: Rate limit tick

      recordTokenUsage(options.runId, {
        taskType,
        provider: candidate.provider,
        model: candidate.modelId,
        inputTokens: estimateTokens(messages.map((msg) => msg.content).join('\n')),
        outputTokens:
          mode === 'generate' && typeof result === 'string' ? estimateTokens(result) : 0,
      });

      return {
        content: result,
        provider: candidate.provider,
        model: candidate.modelId,
        taskType,
        latencyMs,
      };
    } catch (error) {
      recordProviderFailure(candidate.provider, error);
      throw error;
    }
  };

  // ----------------------------------------------------
  // ROUTING STRATEGY EXECUTION
  // ----------------------------------------------------

  if (strategy === ROUTING_STRATEGY.FASTEST_FIRST || strategy === ROUTING_STRATEGY.PARALLEL_RACE) {
    const parallelCount = route.parallelCount || 2;
    const raceCandidates = candidates.slice(0, parallelCount);
    const fallbackCandidates = candidates.slice(parallelCount);

    recordEnsembleRace(options.runId, {
      taskType,
      strategy,
      participants: raceCandidates.map((c) => c.modelId),
    });

    try {
      return await Promise.any(raceCandidates.map((c) => executeCandidate(c)));
    } catch (aggregateError) {
      lastError = aggregateError;
      console.warn(`[LLMRouter] Parallel race failed completely. Falling back sequentially.`);
      // Fallback sequentially if parallel race loses all participants
      for (const candidate of fallbackCandidates) {
        try {
          return await executeCandidate(candidate);
        } catch (error) {
          lastError = error;
        }
      }
    }
  } else {
    // ----------------------------------------------------
    // WATERFALL, SPECIALIST_FIRST, and Fallback CONSENSUS
    // (Full Consensus graph merging is done at Agent level)
    // ----------------------------------------------------
    for (const candidate of candidates) {
      try {
        return await executeCandidate(candidate);
      } catch (error) {
        lastError = error;
      }
    }
  }

  throw new Error(
    `All LLM routes failed for task "${taskType}". Last error: ${lastError?.message || lastError}`
  );
}

export async function generateTaskResponse(messages, options = {}) {
  return executeWithRoute('generate', messages, options);
}

export async function streamTaskResponse(messages, options = {}) {
  return executeWithRoute('stream', messages, options);
}

export async function generateResponse(messages, options = {}) {
  const result = await generateTaskResponse(messages, options);
  return result.content;
}

export async function streamResponse(messages, options = {}) {
  const result = await streamTaskResponse(messages, options);
  return { stream: result.content, provider: result.provider, model: result.model };
}
