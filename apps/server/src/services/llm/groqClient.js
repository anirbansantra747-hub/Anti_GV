/**
 * Groq API Client Wrapper
 * Handles making requests to the Groq API (Llama 3.3 70B)
 */
import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';
dotenv.config();

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

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

  const completion = await groq.chat.completions.create(params);
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

  return await groq.chat.completions.create(params);
};
