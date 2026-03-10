/**
 * LLM Router
 * Manages the fallback chain: Groq -> Cerebras -> Gemini
 */
import { generateGroqResponse, streamGroqResponse } from './groqClient.js';
import { generateCerebrasResponse, streamCerebrasResponse } from './cerebrasClient.js';
import { generateGeminiResponse, streamGeminiResponse } from './geminiClient.js';

const PROVIDERS = ['groq', 'cerebras', 'gemini'];

export const generateResponse = async (messages, options = {}) => {
  let lastError;
  for (const provider of PROVIDERS) {
    try {
      if (provider === 'groq') {
        return await generateGroqResponse(messages, options);
      } else if (provider === 'cerebras') {
        const fallbackOptions = { ...options };
        delete fallbackOptions.model;
        return await generateCerebrasResponse(messages, fallbackOptions);
      } else if (provider === 'gemini') {
        const fallbackOptions = { ...options };
        delete fallbackOptions.model;
        return await generateGeminiResponse(messages, fallbackOptions);
      }
    } catch (error) {
      console.warn(`[llmRouter] ${provider} failed: ${error.message}. Attempting fallback...`);
      lastError = error;
    }
  }
  throw new Error(`All LLM providers failed. Last error: ${lastError.message}`);
};

export const streamResponse = async (messages, options = {}) => {
  let lastError;
  for (const provider of PROVIDERS) {
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
  throw new Error(`All LLM providers failed in streaming. Last error: ${lastError.message}`);
};
