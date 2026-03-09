/**
 * Groq API Client Wrapper
 * Handles making requests to the Groq API (Llama 3.3 70B)
 */
import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

// Lazy-init: create client on first use so missing API key won't crash the server on startup
let _groq = null;
const getGroq = () => {
  if (!_groq) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey || apiKey === 'gsk_your_key_here') {
      throw new Error('[GroqClient] GROQ_API_KEY is not set. Please add it to apps/server/.env');
    }
    _groq = new Groq({ apiKey });
  }
  return _groq;
};

export const generateGroqResponse = async (messages, options = {}) => {
  const params = {
    messages,
    model: options.model || 'llama-3.3-70b-versatile',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens,
  };

  if (options.jsonMode) {
    params.response_format = { type: 'json_object' };
  }

  const completion = await getGroq().chat.completions.create(params);
  return completion.choices[0]?.message?.content || '';
};

export const streamGroqResponse = async (messages, options = {}) => {
  const params = {
    messages,
    model: options.model || 'llama-3.3-70b-versatile',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens,
    stream: true,
  };

  if (options.jsonMode) {
    params.response_format = { type: 'json_object' };
  }

  return await getGroq().chat.completions.create(params);
};
