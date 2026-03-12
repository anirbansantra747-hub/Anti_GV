/**
 * @file executionSocket.js
 * @description Socket.IO handler for compiled language execution via Piston Public API.
 * JS/Python run entirely in browser (WebContainers/Pyodide) — this handles everything else.
 *
 * Piston is a free, open-source code execution service: https://github.com/engineer-man/piston
 * Public instance: https://emkc.org/api/v2/piston
 *
 * Events emitted:
 *   exec:output   — { stream: 'info'|'stdout'|'stderr', text: string }
 *   exec:done     — { exitCode, runTime, summary }
 *   exec:problems — { markers: ErrorMarker[] }  ← NEW: structured error markers
 */

import { parseErrors } from '../services/execution/errorParser.js';
import { resolveLanguage } from '../services/execution/languageMap.js';
import dotenv from 'dotenv';
dotenv.config();

// Default to public API if no local container URL is configured
const PISTON_API = process.env.PISTON_URL
  ? `${process.env.PISTON_URL}/api/v2`
  : 'https://emkc.org/api/v2/piston';

/**
 * Get available runtimes from Piston (cached per server start).
 */
let pistonRuntimes = null;
async function getPistonRuntimes() {
  if (pistonRuntimes) return pistonRuntimes;
  const res = await fetch(`${PISTON_API}/runtimes`);
  pistonRuntimes = await res.json();
  return pistonRuntimes;
}

/**
 * Find the latest version for a given language name in Piston.
 * @param {string} language - e.g., "python", "java", "c++"
 * @returns {string|null} version string or null
 */
async function getLatestVersion(language) {
  const runtimes = await getPistonRuntimes();
  const match = runtimes
    .filter((r) => r.language === language)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
  return match?.version || null;
}

/**
 * Execute code via the Piston API.
 * @param {string} language - Piston language name (e.g., "c++", "java")
 * @param {string} code - Source code
 * @param {string} [filename] - Filename hint (e.g., "Main.java")
 * @param {string} [stdin]    - Optional stdin string to pass to the program
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number, runTime: number}>}
 */
async function runWithPiston(language, code, filename, stdin = '') {
  const version = await getLatestVersion(language);
  if (!version) {
    throw new Error(`No Piston runtime found for language: "${language}"`);
  }

  const start = Date.now();
  const response = await fetch(`${PISTON_API}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language,
      version,
      files: [{ name: filename || `code.${language}`, content: code }],
      stdin: stdin || '',
      args: [],
      compile_timeout: 10000,
      run_timeout: 10000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Piston API error ${response.status}: ${errText}`);
  }

  const result = await response.json();
  const runTime = Date.now() - start;

  return {
    stdout: result.run?.stdout || result.compile?.stdout || '',
    stderr: result.run?.stderr || result.compile?.stderr || '',
    exitCode: result.run?.code ?? result.compile?.code ?? -1,
    runTime,
  };
}

/**
 * Register execution socket events on a connected socket.
 * @param {import('socket.io').Server} _io
 * @param {import('socket.io').Socket} socket
 */
export function setupExecutionSocket(_io, socket) {
  /**
   * exec:run — Run code via Piston.
   * Payload: { code: string, language: string, filename?: string, stdin?: string }
   */
  socket.on('exec:run', async ({ code, language, filename, stdin }) => {
    console.log(`[ExecutionSocket] Running ${language} via Piston for ${socket.id}`);

    // Resolve language metadata (error style, display name, default filename)
    const langInfo = filename ? resolveLanguage(filename) : resolveLanguage(language);

    // Let the client know we're starting
    socket.emit('exec:output', {
      stream: 'info',
      text: `▶ Running ${langInfo?.display || language} via Piston...\r\n`,
    });

    try {
      const effectiveFilename = filename || langInfo?.fileTemplate || `code.${language}`;

      const { stdout, stderr, exitCode, runTime } = await runWithPiston(
        language,
        code,
        effectiveFilename,
        stdin || ''
      );

      if (stdout) {
        socket.emit('exec:output', { stream: 'stdout', text: stdout.replace(/\n/g, '\r\n') });
      }
      if (stderr) {
        socket.emit('exec:output', {
          stream: 'stderr',
          text: `\x1b[31m${stderr.replace(/\n/g, '\r\n')}\x1b[0m`,
        });
      }

      // ── Error parsing → emit structured markers ───────────────
      if (stderr && stderr.trim()) {
        const errorStyle = langInfo?.errorStyle || 'generic';
        const markers = parseErrors(stderr, errorStyle);
        if (markers.length > 0) {
          socket.emit('exec:problems', { markers });
          console.log(`[ExecutionSocket] Emitting ${markers.length} problem marker(s)`);
        }
      } else {
        // Clear any previous problems when run is clean
        socket.emit('exec:problems', { markers: [] });
      }

      const statusColor = exitCode === 0 ? '\x1b[32m' : '\x1b[31m';
      const statusIcon = exitCode === 0 ? '✓' : '✗';
      socket.emit('exec:done', {
        exitCode,
        runTime,
        summary: `${statusColor}${statusIcon} Exited with code ${exitCode} (${runTime}ms)\x1b[0m`,
      });
    } catch (err) {
      console.error(`[ExecutionSocket] Error:`, err.message);
      socket.emit('exec:output', {
        stream: 'stderr',
        text: `\x1b[31m[Execution Error] ${err.message}\x1b[0m\r\n`,
      });
      socket.emit('exec:done', { exitCode: 1, runTime: 0 });
    }
  });

  socket.on('exec:kill', () => {
    // Piston doesn't support mid-execution kill; just notify frontend
    socket.emit('exec:output', {
      stream: 'info',
      text: '\x1b[33m⚠ Kill requested (Piston executions cannot be cancelled mid-run)\x1b[0m\r\n',
    });
  });
}
