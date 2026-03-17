import { estimateTokens } from '@antigv/ai-core';
import { AGENT_TASK_TYPES } from '@antigv/shared';
import { generateGroqResponse, streamGroqResponse } from './groqClient.js';
import { generateGeminiResponse, streamGeminiResponse } from './geminiClient.js';
import { generateNvidiaResponse, streamNvidiaResponse } from './nvidiaClient.js';
import { generateOpenRouterResponse, streamOpenRouterResponse } from './openRouterClient.js';
import { generateGithubModelsResponse } from './githubModelsClient.js';
import { recordProviderFailure, recordProviderSuccess } from './providerHealthService.js';
import { recordProviderSelection, recordTokenUsage } from './telemetryService.js';
import { selectRoute } from './taskRouter.js';

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
  const { route, candidates } = selectRoute(taskType, options.routeOverrides);

  let lastError;

  for (const candidate of candidates) {
    const executor = PROVIDER_EXECUTORS[candidate.provider];
    if (!executor?.[mode]) continue;

    const startedAt = Date.now();

    try {
      recordProviderSelection(options.runId, {
        taskType,
        provider: candidate.provider,
        model: candidate.modelId,
      });

      const result = await executor[mode](messages, enrichOptions(candidate, route, options));
      const latencyMs = Date.now() - startedAt;
      recordProviderSuccess(candidate.provider, latencyMs);
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
      lastError = error;
      recordProviderFailure(candidate.provider, error);
    }
  }

  throw new Error(
    `All LLM routes failed for task "${taskType}". Last error: ${lastError?.message}`
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
