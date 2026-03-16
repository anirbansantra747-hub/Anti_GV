/**
 * GitHub Models API Client
 * OpenAI-compatible endpoint via GitHub Models.
 * Used for: planning (DeepSeek-R1-0528), code gen/fix (Codestral-2501), critic (DeepSeek-R1-0528)
 *
 * DeepSeek-R1 emits <think>...</think> blocks — these are stripped automatically.
 * JSON is extracted from the response after stripping thinking tokens.
 */
import dotenv from 'dotenv';
dotenv.config();

const GITHUB_MODELS_BASE = 'https://models.github.ai/inference';

function stripThinkingTags(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function extractJsonFromText(text) {
  // Try code block first
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();
  // Try raw JSON object
  const jsonObj = text.match(/(\{[\s\S]*\})/);
  if (jsonObj) return jsonObj[1].trim();
  return text;
}

export const generateGithubModelsResponse = async (messages, options = {}) => {
  const apiKey = process.env.GITHUB_TOKEN;
  if (!apiKey) throw new Error('[GithubModelsClient] GITHUB_TOKEN not set');

  const model = options.model || 'mistral-ai/Codestral-2501';
  const isDeepSeek = model.toLowerCase().includes('deepseek');

  const body = {
    model,
    messages,
    temperature: options.temperature ?? 0.1,
  };
  if (options.max_tokens) body.max_tokens = options.max_tokens;
  // DeepSeek reasoning models don't use response_format — they output JSON naturally
  if (options.jsonMode && !isDeepSeek) {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(`${GITHUB_MODELS_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[GithubModelsClient] ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  let content = data.choices[0]?.message?.content || '';

  if (isDeepSeek) {
    content = stripThinkingTags(content);
    if (options.jsonMode) {
      content = extractJsonFromText(content);
    }
  }

  return content;
};
