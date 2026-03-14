/**
 * @file executionSocket.js
 * @description Socket.IO handler for code execution and linting.
 *
 * Routing:
 *   • Docker languages (languageMap runner === 'docker') → local container via dockerRunner.js
 *   • Everything else → Piston public API
 *
 * Socket events consumed:
 *   exec:run   — { code, language, filename?, stdin? }
 *   exec:lint  — { code, language, filename? }
 *   exec:kill  — (stop the current execution, if possible)
 *
 * Socket events emitted:
 *   exec:output   — { stream: 'info'|'stdout'|'stderr', text: string }
 *   exec:done     — { exitCode, runTime, summary }
 *   exec:problems — { markers: ErrorMarker[] }
 */

import { parseErrors } from '../services/execution/errorParser.js';
import { resolveLanguage } from '../services/execution/languageMap.js';
import { runInDocker, lintInDocker } from '../services/execution/dockerRunner.js';
import dotenv from 'dotenv';
dotenv.config();

// Default to public API if no local container URL is configured
const PISTON_API = process.env.PISTON_URL
  ? `${process.env.PISTON_URL}/api/v2`
  : 'https://emkc.org/api/v2/piston';

// ── Piston helpers ────────────────────────────────────────────

let pistonRuntimes = null;
async function getPistonRuntimes() {
  if (pistonRuntimes) return pistonRuntimes;
  const res = await fetch(`${PISTON_API}/runtimes`);
  pistonRuntimes = await res.json();
  return pistonRuntimes;
}

async function getLatestVersion(language) {
  const runtimes = await getPistonRuntimes();
  const match = runtimes
    .filter((r) => r.language === language)
    .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))[0];
  return match?.version || null;
}

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

// ── Shared output emitter ─────────────────────────────────────

/**
 * Emit stdout/stderr/problems/done to the client in a consistent format.
 */
function emitResult(socket, { stdout, stderr, exitCode, runTime }, langInfo) {
  if (stdout) {
    socket.emit('exec:output', { stream: 'stdout', text: stdout.replace(/\n/g, '\r\n') });
  }
  if (stderr) {
    socket.emit('exec:output', {
      stream: 'stderr',
      text: `\x1b[31m${stderr.replace(/\n/g, '\r\n')}\x1b[0m`,
    });
  }

  // Structured error markers for the editor gutter
  if (stderr && stderr.trim()) {
    const errorStyle = langInfo?.errorStyle || 'generic';
    const markers = parseErrors(stderr, errorStyle);
    socket.emit('exec:problems', { markers });
    if (markers.length > 0) {
      console.log(`[ExecutionSocket] Emitting ${markers.length} problem marker(s)`);
    }
  } else {
    socket.emit('exec:problems', { markers: [] });
  }

  const statusColor = exitCode === 0 ? '\x1b[32m' : '\x1b[31m';
  const statusIcon = exitCode === 0 ? '✓' : '✗';
  socket.emit('exec:done', {
    exitCode,
    runTime,
    summary: `${statusColor}${statusIcon} Exited with code ${exitCode} (${runTime}ms)\x1b[0m`,
  });
}

// ── Socket handler ────────────────────────────────────────────

/**
 * Track the active Docker process AbortController per socket
 * so we can kill it on exec:kill.
 */
const activeKillers = new Map(); // socketId → kill fn

export function setupExecutionSocket(_io, socket) {
  // ── exec:run ───────────────────────────────────────────────
  socket.on('exec:run', async ({ code, language, filename, stdin }) => {
    const langInfo = filename ? resolveLanguage(filename) : resolveLanguage(language);
    const useDocker = langInfo?.runner === 'docker';

    console.log(
      `[ExecutionSocket] Running ${langInfo?.display || language} via ${useDocker ? 'Docker' : 'Piston'} for ${socket.id}`
    );

    socket.emit('exec:output', {
      stream: 'info',
      text: `▶ Running ${langInfo?.display || language} via ${useDocker ? 'Docker' : 'Piston'}...\r\n`,
    });

    try {
      let result;

      if (useDocker) {
        // Expose a kill handle so exec:kill can SIGKILL the container
        let killFn = null;
        const killPromise = new Promise((_, reject) => {
          killFn = () => reject(new Error('Execution cancelled by user.'));
        });
        activeKillers.set(socket.id, killFn);

        result = await Promise.race([runInDocker(langInfo.ext, code, stdin || ''), killPromise]);

        activeKillers.delete(socket.id);
      } else {
        const effectiveFilename = filename || langInfo?.fileTemplate || `code.${language}`;
        result = await runWithPiston(language, code, effectiveFilename, stdin || '');
      }

      emitResult(socket, result, langInfo);
    } catch (err) {
      activeKillers.delete(socket.id);
      console.error(`[ExecutionSocket] Error:`, err.message);

      const isKilled = err.message.includes('cancelled');
      socket.emit('exec:output', {
        stream: isKilled ? 'info' : 'stderr',
        text: isKilled
          ? '\x1b[33m⚠ Execution cancelled.\x1b[0m\r\n'
          : `\x1b[31m[Execution Error] ${err.message}\x1b[0m\r\n`,
      });
      socket.emit('exec:done', { exitCode: isKilled ? 130 : 1, runTime: 0 });
    }
  });

  // ── exec:lint ──────────────────────────────────────────────
  socket.on('exec:lint', async ({ code, language, filename }) => {
    const langInfo = filename ? resolveLanguage(filename) : resolveLanguage(language);

    // We only support linting via Docker currently
    if (langInfo?.runner !== 'docker') return;

    try {
      const markers = await lintInDocker(langInfo.ext, code);
      if (markers.length > 0) {
        socket.emit('exec:problems', { markers });
      }
    } catch (err) {
      console.error(`[ExecutionSocket] Lint Error:`, err.message);
    }
  });

  // ── exec:kill ──────────────────────────────────────────────
  socket.on('exec:kill', () => {
    const kill = activeKillers.get(socket.id);
    if (kill) {
      console.log(`[ExecutionSocket] Kill requested for ${socket.id}`);
      kill();
      activeKillers.delete(socket.id);
    } else {
      socket.emit('exec:output', {
        stream: 'info',
        text: '\x1b[33m⚠ No active Docker execution to kill (Piston jobs cannot be cancelled mid-run).\x1b[0m\r\n',
      });
    }
  });

  // Clean up on disconnect
  socket.on('disconnect', () => {
    activeKillers.delete(socket.id);
  });
}
