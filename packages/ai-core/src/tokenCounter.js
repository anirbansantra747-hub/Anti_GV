/**
 * Token counter utility.
 * Rough estimation: ~4 characters per token for English code.
 * TODO: Replace with tiktoken WASM for exact counts in v2.
 */

const AVG_CHARS_PER_TOKEN = 4;

/**
 * Estimate token count for a string.
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}

/**
 * Count tokens for multiple strings.
 * @param {...string} texts
 * @returns {number}
 */
export function countTokens(...texts) {
  return texts.reduce((sum, t) => sum + estimateTokens(t), 0);
}
