/**
 * Together AI API Client Wrapper
 * OpenAI-compatible chat completions API for Together AI inference.
 */
import dotenv from 'dotenv';
dotenv.config();

const TOGETHER_URL = 'https://api.together.xyz/v1/chat/completions';

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.TOGETHER_API_KEY}`,
  'Content-Type': 'application/json',
});

export const generateTogetherResponse = async (messages, options = {}) => {
  const payload = {
    messages,
    model: options.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens || 4096,
  };

  if (options.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const response = await fetch(TOGETHER_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Together AI Error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

export const streamTogetherResponse = async (messages, options = {}) => {
  const payload = {
    messages,
    model: options.model || 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens || 4096,
    stream: true,
  };

  if (options.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const response = await fetch(TOGETHER_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Together AI Error: ${response.status} - ${err}`);
  }

  return response.body;
};
