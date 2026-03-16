/**
 * @file indexer.js
 * @description Hybrid indexing utilities (inventory + on-demand embedding).
 */

import fs from 'fs/promises';
import path from 'path';
import { chunkFile, shouldSkip } from './chunker.js';
import { embedChunks, isEmbeddingAvailable } from './embedder.js';
import * as vectorStore from './vectorStore.js';
import { buildChunkId } from './vectorStore.js';
import { getWorkspaceRoot, isWorkspaceExplicit } from '../fs/fileService.js';
import { extractFileMeta } from './fileMeta.js';
import { upsertFileIndex, deleteFileIndex } from '../db/fileIndexService.js';
import {
  scanWorkspaceInventory,
  upsertInventoryForFile,
  listFilesNeedingEmbedding,
  markEmbedded,
  removeInventory,
} from '../db/fileInventoryService.js';
import { upsertChunkMetas, deleteByFile as deleteChunkMetaByFile } from '../db/chunkMetaService.js';
import { enforceChunkBudget } from './chunkBudget.js';

const MAX_FILE_BYTES = Number(process.env.INDEXER_MAX_FILE_BYTES) || 1_000_000;
const MAX_CHUNKS_PER_FILE = Number(process.env.INDEXER_MAX_CHUNKS_PER_FILE) || 200;

/**
 * Scan workspace and store file inventory only (no embeddings).
 */
export async function scanInventory(projectRoot, workspaceId, options = {}) {
  const root = projectRoot || getWorkspaceRoot();
  if (!isWorkspaceExplicit() && !options.allowDefaultRoot) {
    return { total: 0, skipped: true };
  }
  return scanWorkspaceInventory(root, workspaceId);
}

/**
 * Embed a set of files on-demand (candidate set).
 */
export async function ensureEmbeddingsForFiles(filePaths, options = {}) {
  const { workspaceId = 'default', onProgress = () => {}, force = false } = options;
  const root = options.rootPath || getWorkspaceRoot();
  const embeddingOk = await isEmbeddingAvailable();
  if (!embeddingOk) {
    onProgress('[Indexer] Embedding unavailable - skipping on-demand embeddings.');
    return;
  }

  for (const relPath of filePaths) {
    if (!relPath) continue;
    const normalized = relPath.startsWith('/') ? relPath : '/' + relPath;
    await embedSingleFile(root, normalized, { workspaceId, onProgress, force });
  }
}

/**
 * Background indexing: embed a small batch from inventory.
 */
export async function backgroundIndexWorkspace(workspaceId, options = {}) {
  const { limit = 3, onProgress = () => {} } = options;
  const root = options.rootPath || getWorkspaceRoot();
  const embeddingOk = await isEmbeddingAvailable();
  if (!embeddingOk) {
    onProgress('[Indexer] Embedding unavailable - background indexing paused.');
    return { processed: 0 };
  }
  const pending = await listFilesNeedingEmbedding(workspaceId, limit);
  for (const inv of pending) {
    await embedSingleFile(root, inv.filePath, { workspaceId, onProgress, force: true });
  }
  return { processed: pending.length };
}

/**
 * Manual full reindex: scan inventory and embed all files gradually.
 */
export async function indexProject(projectRoot, options = {}) {
  const { workspaceId = 'default', onProgress = console.log } = options;
  const root = projectRoot || getWorkspaceRoot();

  if (!isWorkspaceExplicit() && !options.allowDefaultRoot) {
    onProgress('[Indexer] Workspace not explicitly selected. Skipping index.');
    return { totalFiles: 0, totalChunks: 0, newChunks: 0, skippedChunks: 0 };
  }

  const inventory = await scanWorkspaceInventory(root, workspaceId);
  onProgress(`[Indexer] Inventory updated: ${inventory.total} files`);

  let processed = 0;
  let guard = 0;
  while (guard < 10000) {
    const batch = await listFilesNeedingEmbedding(workspaceId, 5);
    if (batch.length === 0) break;
    for (const inv of batch) {
      await embedSingleFile(root, inv.filePath, { workspaceId, onProgress, force: true });
      processed++;
    }
    guard++;
  }

  return { totalFiles: inventory.total, totalChunks: 0, newChunks: processed, skippedChunks: 0 };
}

/**
 * Re-index a single file on write.
 */
export async function reindexFile(absPath, onProgress = console.log, workspaceId = 'default') {
  if (!(await isEmbeddingAvailable())) return;
  const root = getWorkspaceRoot();
  const relPath = '/' + path.relative(root, absPath).replace(/\\/g, '/');
  await embedSingleFile(root, relPath, { workspaceId, onProgress, force: true });
}

/**
 * Remove all indexed data for a file (used on delete/rename).
 */
export async function removeFileIndex(filePath, workspaceId = 'default') {
  try {
    const root = getWorkspaceRoot();
    const relPath = '/' + path.relative(root, filePath).replace(/\\/g, '/');
    await vectorStore.deleteByFile(relPath, workspaceId);
    await deleteChunkMetaByFile(workspaceId, relPath);
    await deleteFileIndex(workspaceId, relPath);
    await removeInventory(workspaceId, relPath);
  } catch {
    // best effort
  }
}

async function embedSingleFile(root, relPath, options) {
  const { workspaceId, onProgress, force } = options;
  const absPath = path.resolve(root, relPath.replace(/^\/+/, ''));

  if (shouldSkip(relPath)) return;

  const stat = await fs.stat(absPath);
  if (stat.size > MAX_FILE_BYTES) {
    onProgress(`[Indexer] Skip large file: ${relPath} (${stat.size} bytes)`);
    return;
  }

  const inventory = await upsertInventoryForFile(workspaceId, root, absPath);
  if (!inventory || inventory.skip) return;

  if (!force && inventory.lastEmbeddedHash && inventory.lastEmbeddedHash === inventory.hash) {
    return;
  }

  let source = await fs.readFile(absPath, 'utf-8');
  let chunks = chunkFile(source, relPath).map((c) => ({ ...c, workspaceId }));
  if (chunks.length > MAX_CHUNKS_PER_FILE) {
    chunks = chunks.slice(0, MAX_CHUNKS_PER_FILE);
  }

  const meta = extractFileMeta(source, relPath);
  if (meta.language) {
    await upsertFileIndex(workspaceId, relPath, meta);
  }

  if (chunks.length === 0) {
    await vectorStore.deleteByFile(relPath, workspaceId);
    await deleteChunkMetaByFile(workspaceId, relPath);
    await deleteFileIndex(workspaceId, relPath);
    await markEmbedded(workspaceId, relPath, inventory.hash);
    return;
  }

  // Replace old chunks
  await vectorStore.deleteByFile(relPath, workspaceId);
  await deleteChunkMetaByFile(workspaceId, relPath);

  const embedded = await embedChunks(chunks);
  await vectorStore.upsert(embedded);

  const metas = embedded.map((c) => ({
    chunkId: buildChunkId(c),
    filePath: c.filePath,
    chunkType: c.chunkType,
    name: c.name,
    hash: c.hash,
    size: (c.content || '').length,
  }));
  await upsertChunkMetas(workspaceId, metas);

  await markEmbedded(workspaceId, relPath, inventory.hash);
  await enforceChunkBudget(workspaceId);

  source = null;
  chunks = null;
}
