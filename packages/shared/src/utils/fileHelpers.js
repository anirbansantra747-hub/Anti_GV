import { SUPPORTED_LANGUAGES } from '../constants/languages.js';

/**
 * Get language identifier from a file extension.
 * @param {string} filename — e.g., "server.js" or ".py"
 * @returns {string|null} — e.g., "javascript" or null if unknown
 */
export function getLanguageFromExtension(filename) {
  const ext = '.' + filename.split('.').pop();
  for (const [lang, config] of Object.entries(SUPPORTED_LANGUAGES)) {
    if (config.extension === ext) return lang;
  }
  return null;
}
