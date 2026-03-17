import dotenv from 'dotenv';

dotenv.config();

const GITHUB_MODELS_URL =
  process.env.GITHUB_MODELS_URL || 'https://models.inference.ai.azure.com/chat/completions';

function getHeaders() {
  const apiKey = process.env.GITHUB_MODELS_API_KEY;
  if (!apiKey) {
    throw new Error('GITHUB_MODELS_API_KEY is not set.');
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

export async function generateGithubModelsResponse(messages, options = {}) {
  const payload = {
    messages,
    model: options.model || 'gpt-4.1-mini',
    temperature: options.temperature ?? 0.2,
    max_tokens: options.max_tokens,
  };

  if (options.jsonMode) payload.response_format = { type: 'json_object' };

  const response = await fetch(GITHUB_MODELS_URL, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`GitHub Models API Error: ${response.status} - ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
