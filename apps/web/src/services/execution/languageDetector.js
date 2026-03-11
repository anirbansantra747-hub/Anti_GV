/**
 * @file languageDetector.js
 * @description Maps file extensions to execution engine and language metadata.
 */

const LANGUAGE_MAP = {
  // WebContainer (Node.js WASM)
  js: { engine: 'webcontainer', language: 'javascript', display: 'JavaScript' },
  mjs: { engine: 'webcontainer', language: 'javascript', display: 'JavaScript (ESM)' },
  ts: { engine: 'webcontainer', language: 'typescript', display: 'TypeScript' },

  // Pyodide (Python WASM)
  py: { engine: 'pyodide', language: 'python', display: 'Python' },

  // Piston (server-side, free API)
  c: { engine: 'piston', language: 'c', pistonLang: 'c', display: 'C' },
  cpp: { engine: 'piston', language: 'cpp', pistonLang: 'c++', display: 'C++' },
  java: { engine: 'piston', language: 'java', pistonLang: 'java', display: 'Java' },
  go: { engine: 'piston', language: 'go', pistonLang: 'go', display: 'Go' },
  rs: { engine: 'piston', language: 'rust', pistonLang: 'rust', display: 'Rust' },
  rb: { engine: 'piston', language: 'ruby', pistonLang: 'ruby', display: 'Ruby' },
  php: { engine: 'piston', language: 'php', pistonLang: 'php', display: 'PHP' },
  cs: { engine: 'piston', language: 'csharp', pistonLang: 'mono', display: 'C#' },
  sh: { engine: 'piston', language: 'bash', pistonLang: 'bash', display: 'Bash' },
};

/**
 * Detect language and execution engine from a filename or extension.
 * @param {string} filename - e.g., "main.py" or just "py"
 * @returns {{ engine: string, language: string, display: string, pistonLang?: string } | null}
 */
export function detectLanguage(filename) {
  if (!filename) return null;
  const ext = filename.includes('.')
    ? filename.split('.').pop().toLowerCase()
    : filename.toLowerCase();
  return LANGUAGE_MAP[ext] || null;
}

export { LANGUAGE_MAP };
