/**
 * LLM Router
 * Task-based routing to best available model, with Groq→Cerebras→Gemini fallback chain.
 *
 * Task → Primary model:
 *   classify → OpenRouter step-3.5-flash  (fast, cheap)
 *   plan     → GitHub  DeepSeek-R1-0528   (reasoning, plans precisely)
 *   code     → GitHub  Codestral-2501     (purpose-built for code edits)
 *   critic   → GitHub  DeepSeek-R1-0528   (reasoning, catches mistakes)
 *   fixer    → GitHub  Codestral-2501     (code model for corrections)
 *
 * All tasks fall back to Groq llama-3.3-70b if the primary fails.
 * Streaming (ASK flow) always uses Groq → Cerebras → Gemini.
 */
import { generateGroqResponse, streamGroqResponse } from './groqClient.js';
import { generateCerebrasResponse, streamCerebrasResponse } from './cerebrasClient.js';
import { generateGeminiResponse, streamGeminiResponse } from './geminiClient.js';
import { generateOpenRouterResponse } from './openRouterClient.js';
import { generateGithubModelsResponse } from './githubModelsClient.js';

const TASK_ROUTES = {
  classify: {
    fn: generateOpenRouterResponse,
    model: 'stepfun/step-3.5-flash',
  },
  plan: {
    fn: generateGithubModelsResponse,
    model: 'deepseek/DeepSeek-R1-0528',
  },
  code: {
    fn: generateGithubModelsResponse,
    model: 'mistral-ai/Codestral-2501',
  },
  critic: {
    fn: generateGithubModelsResponse,
    model: 'deepseek/DeepSeek-R1-0528',
  },
  fixer: {
    fn: generateGithubModelsResponse,
    model: 'mistral-ai/Codestral-2501',
  },
};

const LEGACY_PROVIDERS = ['groq', 'cerebras', 'gemini'];

export const generateResponse = async (messages, options = {}) => {
  const { task, ...restOptions } = options;

  // ── Task-based routing ──────────────────────────────────────────────────
  if (task && TASK_ROUTES[task]) {
    const route = TASK_ROUTES[task];
    const callOptions = { ...restOptions, model: restOptions.model || route.model };
    try {
      console.log(`[llmRouter] Task "${task}" → ${route.model}`);
      return await route.fn(messages, callOptions);
    } catch (err) {
      console.warn(
        `[llmRouter] Task "${task}" primary (${route.model}) failed: ${err.message}. Falling back to Groq...`
      );
      return await generateGroqResponse(messages, {
        ...restOptions,
        model: 'llama-3.3-70b-versatile',
      });
    }
  }

  // ── Legacy fallback chain ───────────────────────────────────────────────
  let lastError;
  for (const provider of LEGACY_PROVIDERS) {
    try {
      if (provider === 'groq') return await generateGroqResponse(messages, options);
      if (provider === 'cerebras') {
        const opts = { ...options };
        delete opts.model;
        return await generateCerebrasResponse(messages, opts);
      }
      if (provider === 'gemini') {
        const opts = { ...options };
        delete opts.model;
        return await generateGeminiResponse(messages, opts);
      }
    } catch (error) {
      console.warn(`[llmRouter] ${provider} failed: ${error.message}. Attempting fallback...`);
      lastError = error;
    }
  }
  throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
};

export const streamResponse = async (messages, options = {}) => {
  let lastError;
  for (const provider of LEGACY_PROVIDERS) {
    try {
      if (provider === 'groq') {
        return { stream: await streamGroqResponse(messages, options), provider };
      } else if (provider === 'cerebras') {
        const fallbackOptions = { ...options };
        delete fallbackOptions.model;
        return { stream: await streamCerebrasResponse(messages, fallbackOptions), provider };
      } else if (provider === 'gemini') {
        const fallbackOptions = { ...options };
        delete fallbackOptions.model;
        return { stream: await streamGeminiResponse(messages, fallbackOptions), provider };
      }
    } catch (error) {
      console.warn(
        `[llmRouter] ${provider} stream failed: ${error.message}. Attempting fallback...`
      );
      lastError = error;
    }
  }
  throw new Error(`All LLM providers failed in streaming. Last error: ${lastError?.message}`);
};
