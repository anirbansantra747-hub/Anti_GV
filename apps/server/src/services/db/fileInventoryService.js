/**
 * @file fileInventoryService.js
 * @description File inventory management for workspaces.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import FileInventory from './fileInventoryModel.js';
import { isConnected } from './dbService.js';
import { shouldSkip } from '../rag/chunker.js';

const MAX_HASH_BYTES = Number(process.env.INDEXER_HASH_BYTES) || 131072; // 128KB

export async function scanWorkspaceInventory(rootPath, workspaceId, options = {}) {
  if (!isConnected()) return { total: 0 };
  if (!rootPath || !workspaceId) return { total: 0 };

  const startedAt = new Date();
  const files = await walkDir(rootPath);

  const bulk = FileInventory.collection.initializeUnorderedBulkOp();
  let count = 0;

  for (const absPath of files) {
    const relPath = '/' + path.relative(rootPath, absPath).replace(/\\/g, '/');
    const stats = await fs.stat(absPath);
    const skip = shouldSkip(relPath);
    const language = detectLanguage(relPath);
    const hash = await computeQuickHash(absPath, stats.size, stats.mtimeMs);

    bulk
      .find({ workspaceId, filePath: relPath })
      .upsert()
      .updateOne({
        $set: {
          workspaceId,
          filePath: relPath,
          size: stats.size,
          mtimeMs: stats.mtimeMs,
          hash,
          language,
          skip,
          lastSeenAt: startedAt,
        },
        $setOnInsert: { lastEmbeddedHash: '' },
      });
    count++;
  }

  if (count > 0) {
    await bulk.execute();
  }

  await FileInventory.deleteMany({ workspaceId, lastSeenAt: { $lt: startedAt } });

  return { total: count };
}

export async function upsertInventoryForFile(workspaceId, rootPath, absPath) {
  if (!isConnected()) return null;
  const stats = await fs.stat(absPath);
  const relPath = '/' + path.relative(rootPath, absPath).replace(/\\/g, '/');
  const skip = shouldSkip(relPath);
  const language = detectLanguage(relPath);
  const hash = await computeQuickHash(absPath, stats.size, stats.mtimeMs);

  return FileInventory.findOneAndUpdate(
    { workspaceId, filePath: relPath },
    {
      $set: {
        workspaceId,
        filePath: relPath,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
        hash,
        language,
        skip,
        lastSeenAt: new Date(),
      },
      $setOnInsert: { lastEmbeddedHash: '' },
    },
    { upsert: true, new: true }
  ).lean();
}

export async function markEmbedded(workspaceId, filePath, hash) {
  if (!isConnected()) return null;
  return FileInventory.findOneAndUpdate(
    { workspaceId, filePath },
    { $set: { lastEmbeddedHash: hash, lastIndexedAt: new Date() } },
    { new: true }
  ).lean();
}

export async function removeInventory(workspaceId, filePath) {
  if (!isConnected()) return null;
  return FileInventory.deleteOne({ workspaceId, filePath });
}

export async function listFilesNeedingEmbedding(workspaceId, limit = 10) {
  if (!isConnected()) return [];
  return FileInventory.find({
    workspaceId,
    skip: false,
    $expr: { $ne: ['$hash', '$lastEmbeddedHash'] },
  })
    .limit(limit)
    .lean();
}

export async function searchFilesByName(workspaceId, tokens, limit = 20) {
  if (!isConnected()) return [];
  if (!tokens || tokens.length === 0) return [];
  const ors = tokens
    .slice(0, 6)
    .map((t) => ({ filePath: { $regex: escapeRegex(t), $options: 'i' } }));
  return FileInventory.find({ workspaceId, $or: ors }).limit(limit).lean();
}

export async function getInventory(workspaceId, filePath) {
  if (!isConnected()) return null;
  return FileInventory.findOne({ workspaceId, filePath }).lean();
}

async function walkDir(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (shouldSkip(fullPath)) continue;
      const nested = await walkDir(fullPath);
      files.push(...nested);
    } else if (entry.isFile()) {
      if (!shouldSkip(fullPath)) files.push(fullPath);
    }
  }

  return files;
}

function detectLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'].includes(ext)) return 'javascript';
  if (ext === '.py') return 'python';
  if (ext === '.java') return 'java';
  return '';
}

async function computeQuickHash(filePath, size, mtimeMs) {
  try {
    const fd = await fs.open(filePath, 'r');
    const toRead = Math.min(size, MAX_HASH_BYTES);
    const buffer = Buffer.alloc(toRead);
    await fd.read(buffer, 0, toRead, 0);
    await fd.close();
    const hash = crypto
      .createHash('sha1')
      .update(buffer)
      .update(String(size))
      .update(String(mtimeMs))
      .digest('hex');
    return hash;
  } catch {
    return `${size}:${mtimeMs}`;
  }
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
}
