/**
 * @file indexerWorker.js
 * @description Runs as a child_process.fork() target.
 * Receives { type:'index', workspaceId, rootPath, limit } messages,
 * runs the background embedder, and sends { type:'done'|'error' } back.
 *
 * Isolated from the main server — if this process OOMs it crashes alone.
 */

import mongoose from 'mongoose';
import { backgroundIndexWorkspace } from './indexer.js';

// Connect to MongoDB using env inherited from parent process
const mongoUri =
  process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://localhost:27017/antigv';

try {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
} catch (err) {
  // Continue without MongoDB — indexer will degrade gracefully
  process.stderr.write(`[IndexerWorker] MongoDB unavailable: ${err.message}\n`);
}

// Signal parent that we are ready for work
process.send?.({ type: 'ready' });

process.on('message', async (msg) => {
  if (msg?.type !== 'index') return;

  try {
    const result = await backgroundIndexWorkspace(msg.workspaceId, {
      rootPath: msg.rootPath,
      limit: msg.limit ?? 2,
    });
    process.send({ type: 'done', processed: result?.processed ?? 0 });
  } catch (err) {
    process.send({ type: 'error', error: err.message });
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  mongoose.disconnect().finally(() => process.exit(0));
});
