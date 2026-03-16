/**
 * @file backgroundIndexer.js
 * @description Background indexer that runs in a SEPARATE child process.
 * If the child OOMs or crashes, only it dies — the main server stays up.
 * The child is automatically restarted after a short cooldown.
 */

import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { isEmbeddingAvailable } from './embedder.js';
import { getWorkspaceRoot } from '../fs/fileService.js';

const WORKER_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'indexerWorker.js');

// workspaceId → { timer, child, ready, running, rootPath }
const workers = new Map();

function spawnChild(workspaceId, onProgress) {
  const entry = workers.get(workspaceId);
  if (!entry) return null;

  const child = fork(WORKER_PATH, [], {
    env: process.env,
    // Cap the child at 1 GB so it cannot OOM the host machine
    execArgv: ['--max-old-space-size=1024'],
  });

  child.on('message', (msg) => {
    const e = workers.get(workspaceId);
    if (!e) return;
    if (msg.type === 'ready') {
      e.ready = true;
    } else if (msg.type === 'done') {
      e.running = false;
      if (msg.processed > 0) onProgress?.(`[Indexer] Worker embedded ${msg.processed} file(s)`);
    } else if (msg.type === 'error') {
      e.running = false;
      console.warn('[BackgroundIndexer] Worker error:', msg.error);
    }
  });

  child.on('exit', (code, signal) => {
    const e = workers.get(workspaceId);
    if (!e) return; // intentionally stopped
    e.ready = false;
    e.running = false;
    if (code !== 0) {
      console.warn(
        `[BackgroundIndexer] Worker exited (code=${code} signal=${signal}) — respawning in 8s`
      );
      setTimeout(() => {
        const e2 = workers.get(workspaceId);
        if (!e2) return;
        e2.child = spawnChild(workspaceId, onProgress);
        e2.child && (e2.child = e2.child);
      }, 8000);
    }
  });

  child.on('error', (err) => {
    console.error('[BackgroundIndexer] Failed to spawn worker:', err.message);
    const e = workers.get(workspaceId);
    if (e) {
      e.ready = false;
      e.running = false;
    }
  });

  return child;
}

export function startBackgroundIndex(workspaceId, options = {}) {
  if (!workspaceId) return;
  if (workers.has(workspaceId)) return;

  const { onProgress, intervalMs = 8000 } = options;

  const entry = { timer: null, child: null, ready: false, running: false };
  workers.set(workspaceId, entry);

  entry.child = spawnChild(workspaceId, onProgress);

  entry.timer = setInterval(async () => {
    const e = workers.get(workspaceId);
    if (!e || !e.ready || e.running) return;

    const embeddingOk = await isEmbeddingAvailable();
    if (!embeddingOk) return;

    e.running = true;
    const rootPath = getWorkspaceRoot();
    e.child?.send({ type: 'index', workspaceId, rootPath, limit: 2 });
  }, intervalMs);
}

export function stopBackgroundIndex(workspaceId) {
  const e = workers.get(workspaceId);
  if (!e) return;
  clearInterval(e.timer);
  try {
    e.child?.kill('SIGTERM');
  } catch {
    /* ignore */
  }
  workers.delete(workspaceId);
}

export function stopAllBackgroundIndexers() {
  for (const id of [...workers.keys()]) stopBackgroundIndex(id);
}
