import dotenv from 'dotenv';

dotenv.config();

const OPENROUTER_URL =
  process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';

function getHeaders() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not set.');
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  if (process.env.OPENROUTER_HTTP_REFERER) {
    headers['HTTP-Referer'] = process.env.OPENROUTER_HTTP_REFERER;
  }
  if (process.env.OPENROUTER_APP_NAME) {
    headers['X-Title'] = process.env.OPENROUTER_APP_NAME;
  }

  return headers;
}

function buildPayload(messages, options = {}) {
  const payload = {
    messages,
    model: options.model || 'openai/gpt-oss-20b:free',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens,
  };

  if (options.stream) payload.stream = true;
  if (options.jsonMode) payload.response_format = { type: 'json_object' };

  return payload;
}

export async function generateOpenRouterResponse(messages, options = {}) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(buildPayload(messages, options)),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API Error: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function streamOpenRouterResponse(messages, options = {}) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(buildPayload(messages, { ...options, stream: true })),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter API Error: ${response.status} - ${await response.text()}`);
  }

  return response.body;
}
