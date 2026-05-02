import dotenv from 'dotenv';

dotenv.config();

const NVIDIA_URL =
  process.env.NVIDIA_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions';

function getHeaders() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error('NVIDIA_API_KEY is not set.');
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function buildPayload(messages, options = {}) {
  const payload = {
    messages,
    model: options.model || 'meta/llama-3.3-70b-instruct',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens,
  };

  if (options.stream) payload.stream = true;
  if (options.jsonMode) payload.response_format = { type: 'json_object' };

  return payload;
}

export async function generateNvidiaResponse(messages, options = {}) {
  const response = await fetch(NVIDIA_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(buildPayload(messages, options)),
  });

  if (!response.ok) {
    throw new Error(`NVIDIA API Error: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function streamNvidiaResponse(messages, options = {}) {
  const response = await fetch(NVIDIA_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(buildPayload(messages, { ...options, stream: true })),
  });

  if (!response.ok) {
    throw new Error(`NVIDIA API Error: ${response.status} - ${await response.text()}`);
  }

  return response.body;
}
