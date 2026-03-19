/**
 * HuggingFace Inference API Client Wrapper
 * Uses the Inference API for text generation models.
 */
import dotenv from 'dotenv';
dotenv.config();

const HF_BASE_URL = 'https://api-inference.huggingface.co/models';

const getHeaders = () => ({
  Authorization: `Bearer ${process.env.HF_API_TOKEN}`,
  'Content-Type': 'application/json',
});

/**
 * Converts chat messages to a single prompt string for HF models
 * that don't support the chat format natively.
 */
function formatMessagesAsPrompt(messages) {
  return messages
    .map((m) => {
      if (m.role === 'system') return `[INST] <<SYS>>\n${m.content}\n<</SYS>>\n`;
      if (m.role === 'user') return `[INST] ${m.content} [/INST]`;
      return m.content;
    })
    .join('\n');
}

export const generateHuggingFaceResponse = async (messages, options = {}) => {
  const model = options.model || 'mistralai/Mistral-7B-Instruct-v0.3';
  const url = `${HF_BASE_URL}/${model}`;

  const payload = {
    inputs: formatMessagesAsPrompt(messages),
    parameters: {
      max_new_tokens: options.max_tokens || 2048,
      temperature: options.temperature ?? 0.2,
      return_full_text: false,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`HuggingFace API Error: ${response.status} - ${err}`);
  }

  const data = await response.json();

  // HF returns an array of generated_text objects
  if (Array.isArray(data) && data[0]?.generated_text) {
    return data[0].generated_text;
  }

  // Some endpoints return directly
  if (data.generated_text) {
    return data.generated_text;
  }

  throw new Error('HuggingFace returned unexpected response format');
};
