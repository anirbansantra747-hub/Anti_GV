/**
 * @file executionService.js
 * @description Central router for code execution.
 * Detects language from filename and delegates to the correct runner:
 *   - JS/TS → WebContainers
 *   - Python → Pyodide
 *   - Others → Piston (via backend socket)
 */

import { detectLanguage } from './languageDetector.js';
import { runInWebContainer } from './webContainerRunner.js';
import { runInPyodide } from './pyodideRunner.js';

/**
 * Execute code for a given file.
 * @param {object} params
 * @param {string} params.code       - Source code to execute.
 * @param {string} params.filename   - Filename (e.g., "main.py", "index.js"). Used for language detection.
 * @param {object} params.socket     - Socket.IO client instance (used for Piston requests).
 * @param {string} [params.stdin]    - Optional stdin string to feed into the program.
 * @param {function(string): void} params.onOutput   - Stream output callback (writes to xterm).
 * @param {function(number): void} [params.onExit]   - Called with exit code when done.
 * @returns {Promise<void>}
 */
export async function executeCode({ code, filename, socket, stdin = '', onOutput, onExit }) {
  const info = detectLanguage(filename);

  if (!info) {
    onOutput(`\x1b[33m⚠ Unsupported file type: "${filename}". Cannot run.\x1b[0m\r\n`);
    if (onExit) onExit(1);
    return;
  }

  onOutput(`\x1b[34m[Execution] Running ${info.display} (${info.engine})...\x1b[0m\r\n`);

  switch (info.engine) {
    case 'webcontainer':
      await runInWebContainer(code, onOutput, onExit);
      break;

    case 'pyodide':
      await runInPyodide(code, onOutput, onExit, stdin);
      break;

    case 'piston':
      if (!socket) {
        onOutput(`\x1b[31m[Error] No socket connection for Piston execution.\x1b[0m\r\n`);
        if (onExit) onExit(1);
        return;
      }
      // Delegate to backend via socket.
      // Output will be streamed via 'exec:output', 'exec:done', and 'exec:problems' events.
      socket.emit('exec:run', {
        code,
        language: info.pistonLang,
        filename,
        stdin: stdin || '',
      });
      break;

    default:
      onOutput(`\x1b[31m[Error] No execution engine found for "${info.display}".\x1b[0m\r\n`);
      if (onExit) onExit(1);
  }
}
