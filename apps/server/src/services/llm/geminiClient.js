/**
 * Gemini API Client Wrapper
 * Handles making requests to the Gemini API via OpenAI compatibility layer
 */
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
  'Content-Type': 'application/json',
});

export const generateGeminiResponse = async (messages, options = {}) => {
  const payload = {
    messages,
    model: options.model || 'gemini-2.5-flash',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens,
  };

  if (options.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API Error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  return data.choices[0]?.message?.content || '';
};

export const streamGeminiResponse = async (messages, options = {}) => {
  const payload = {
    messages,
    model: options.model || 'gemini-2.5-flash',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens,
    stream: true,
  };

  if (options.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API Error: ${response.status} - ${err}`);
  }

  return response.body;
};
