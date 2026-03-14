/**
 * @file backgroundIndexer.js
 * @description Single-worker background indexer per workspace.
 */

import { backgroundIndexWorkspace } from './indexer.js';
import { isEmbeddingAvailable } from './embedder.js';

const workers = new Map();

export function startBackgroundIndex(workspaceId, options = {}) {
  if (!workspaceId) return;
  if (workers.has(workspaceId)) return;

  const state = { running: false };
  const intervalMs = options.intervalMs || 2000;

  const timer = setInterval(async () => {
    if (state.running) return;
    state.running = true;
    try {
      const embeddingOk = await isEmbeddingAvailable();
      if (!embeddingOk) {
        stopBackgroundIndex(workspaceId);
        return;
      }
      await backgroundIndexWorkspace(workspaceId, { limit: 2, onProgress: options.onProgress });
    } catch (err) {
      // swallow
    } finally {
      state.running = false;
    }
  }, intervalMs);

  workers.set(workspaceId, { timer, state });
}

export function stopBackgroundIndex(workspaceId) {
  const worker = workers.get(workspaceId);
  if (!worker) return;
  clearInterval(worker.timer);
  workers.delete(workspaceId);
}

export function stopAllBackgroundIndexers() {
  for (const [workspaceId, worker] of workers.entries()) {
    clearInterval(worker.timer);
    workers.delete(workspaceId);
  }
}
