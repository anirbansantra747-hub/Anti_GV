/**
 * Cerebras API Client Wrapper
 * Handles making requests to the Cerebras API (fast fallback)
 */
import dotenv from 'dotenv';
dotenv.config();

const CEREBRAS_URL = 'https://api.cerebras.ai/v1/chat/completions';

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.CEREBRAS_API_KEY}`,
  'Content-Type': 'application/json',
});

export const generateCerebrasResponse = async (messages, options = {}) => {
  const payload = {
    messages,
    model: options.model || 'llama3.3-70b',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens,
  };

  if (options.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const response = await fetch(CEREBRAS_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Cerebras API Error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

export const streamCerebrasResponse = async (messages, options = {}) => {
  const payload = {
    messages,
    model: options.model || 'llama3.3-70b',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens,
    stream: true,
  };

  if (options.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const response = await fetch(CEREBRAS_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Cerebras API Error: ${response.status} - ${err}`);
  }

  return response.body;
};
