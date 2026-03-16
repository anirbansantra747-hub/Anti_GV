/**
 * @file languageMap.js
 * @description Maps file extensions and language names to Piston API runtime identifiers.
 *
 * This is the single source of truth for language→runtime mapping.
 * Import it in both executionSocket.js and anywhere else that needs language metadata.
 */

/**
 * Keyed by file extension (lowercase, no dot).
 * Each entry describes how to submit to Piston and how to parse its stderr.
 *
 * @type {Record<string, {
 *   pistonLang: string,   // runtime name passed to Piston API
 *   display: string,      // human-readable label
 *   fileTemplate: string, // suggested filename for Piston (e.g. "Main.java")
 *   errorStyle: string,   // one of: 'gcc', 'javac', 'python', 'go', 'rust', 'generic'
 * }>}
 */
export const EXTENSION_MAP = {
  // Web / Scripts
  js: {
    pistonLang: 'javascript',
    display: 'JavaScript',
    fileTemplate: 'code.js',
    errorStyle: 'generic',
    runner: 'docker',
  },
  ts: {
    pistonLang: 'typescript',
    display: 'TypeScript',
    fileTemplate: 'code.ts',
    errorStyle: 'generic',
    runner: 'docker',
  },
  py: {
    pistonLang: 'python',
    display: 'Python',
    fileTemplate: 'code.py',
    errorStyle: 'python',
    runner: 'docker',
  },

  // Compiled / Backend
  c: { pistonLang: 'c', display: 'C', fileTemplate: 'code.c', errorStyle: 'gcc', runner: 'docker' },
  cpp: {
    pistonLang: 'c++',
    display: 'C++',
    fileTemplate: 'code.cpp',
    errorStyle: 'gcc',
    runner: 'docker',
  },
  cc: {
    pistonLang: 'c++',
    display: 'C++',
    fileTemplate: 'code.cpp',
    errorStyle: 'gcc',
    runner: 'docker',
  },
  java: {
    pistonLang: 'java',
    display: 'Java',
    fileTemplate: 'Main.java',
    errorStyle: 'javac',
    runner: 'docker',
  },
  go: {
    pistonLang: 'go',
    display: 'Go',
    fileTemplate: 'main.go',
    errorStyle: 'go',
    runner: 'docker',
  },
  rs: {
    pistonLang: 'rust',
    display: 'Rust',
    fileTemplate: 'main.rs',
    errorStyle: 'rust',
    runner: 'docker',
  },
  rb: {
    pistonLang: 'ruby',
    display: 'Ruby',
    fileTemplate: 'code.rb',
    errorStyle: 'python',
    runner: 'docker',
  },
  php: {
    pistonLang: 'php',
    display: 'PHP',
    fileTemplate: 'code.php',
    errorStyle: 'generic',
    runner: 'docker',
  },
  cs: {
    pistonLang: 'mono',
    display: 'C#',
    fileTemplate: 'Program.cs',
    errorStyle: 'gcc',
    runner: 'docker',
  },
  kt: {
    pistonLang: 'kotlin',
    display: 'Kotlin',
    fileTemplate: 'Main.kt',
    errorStyle: 'javac',
    runner: 'docker',
  },
  sh: {
    pistonLang: 'bash',
    display: 'Bash',
    fileTemplate: 'script.sh',
    errorStyle: 'generic',
    runner: 'docker',
  },

  // Other (Piston fallbacks)
  pl: { pistonLang: 'perl', display: 'Perl', fileTemplate: 'code.pl', errorStyle: 'generic' },
  r: { pistonLang: 'r', display: 'R', fileTemplate: 'code.r', errorStyle: 'generic' },
  swift: {
    pistonLang: 'swift',
    display: 'Swift',
    fileTemplate: 'main.swift',
    errorStyle: 'generic',
  },
  lua: { pistonLang: 'lua', display: 'Lua', fileTemplate: 'code.lua', errorStyle: 'generic' },
};

/**
 * Resolve language info from a filename or raw extension.
 * @param {string} filenameOrExt — e.g. "Main.java", "cpp", "script.sh"
 * @returns {typeof EXTENSION_MAP[string] & { ext: string } | null}
 */
export function resolveLanguage(filenameOrExt) {
  if (!filenameOrExt) return null;
  const raw = filenameOrExt.trim().toLowerCase();
  const ext = raw.includes('.') ? raw.split('.').pop() : raw;
  const info = EXTENSION_MAP[ext];
  if (!info) return null;
  return { ...info, ext };
}
