/**
 * Supported languages and their Judge0 language IDs.
 */
export const SUPPORTED_LANGUAGES = {
  javascript: { id: 63, name: 'JavaScript', extension: '.js', engine: 'webcontainers' },
  typescript: { id: 74, name: 'TypeScript', extension: '.ts', engine: 'webcontainers' },
  python: { id: 71, name: 'Python 3', extension: '.py', engine: 'pyodide' },
  java: { id: 62, name: 'Java', extension: '.java', engine: 'judge0' },
  c: { id: 50, name: 'C (GCC)', extension: '.c', engine: 'judge0' },
  cpp: { id: 54, name: 'C++ (GCC)', extension: '.cpp', engine: 'judge0' },
  go: { id: 60, name: 'Go', extension: '.go', engine: 'judge0' },
  rust: { id: 73, name: 'Rust', extension: '.rs', engine: 'judge0' },
};
