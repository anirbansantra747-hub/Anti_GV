/**
 * OpenRouter API Client
 * OpenAI-compatible endpoint with access to many free models.
 * Used for: intent classification (fast/cheap)
 */
import dotenv from 'dotenv';
dotenv.config();

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

export const generateOpenRouterResponse = async (messages, options = {}) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('[OpenRouterClient] OPENROUTER_API_KEY not set');

  const body = {
    model: options.model || 'stepfun/step-3.5-flash',
    messages,
    temperature: options.temperature ?? 0.1,
  };
  if (options.max_tokens) body.max_tokens = options.max_tokens;
  if (options.jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://antigv.dev',
      'X-Title': 'Anti_GV',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[OpenRouterClient] ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content || '';
};
