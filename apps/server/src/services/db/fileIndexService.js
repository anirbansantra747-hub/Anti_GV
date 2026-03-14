/**
 * @file fileIndexService.js
 * @description Upsert and query file-level metadata (symbols/imports/exports).
 */

import FileIndex from './fileIndexModel.js';
import { isConnected } from './dbService.js';

export async function upsertFileIndex(workspaceId, filePath, meta) {
  if (!isConnected()) return null;
  if (!workspaceId || !filePath) return null;

  const update = {
    workspaceId,
    filePath,
    language: meta.language || '',
    imports: meta.imports || [],
    exports: meta.exports || [],
    symbols: meta.symbols || [],
  };

  return FileIndex.findOneAndUpdate(
    { workspaceId, filePath },
    { $set: update },
    { upsert: true, new: true }
  ).lean();
}

export async function deleteFileIndex(workspaceId, filePath) {
  if (!isConnected()) return null;
  if (!workspaceId || !filePath) return null;
  return FileIndex.deleteOne({ workspaceId, filePath });
}

export async function getFileIndexes(workspaceId, filePaths) {
  if (!isConnected()) return [];
  if (!workspaceId || !filePaths || filePaths.length === 0) return [];
  return FileIndex.find({ workspaceId, filePath: { $in: filePaths } }).lean();
}

export async function findSymbols(workspaceId, tokens, limit = 30) {
  if (!isConnected()) return [];
  if (!workspaceId || !tokens || tokens.length === 0) return [];

  const uniq = Array.from(new Set(tokens.map((t) => t.toLowerCase()))).slice(0, 12);
  const or = uniq.map((t) => ({ 'symbols.name': { $regex: `^${escapeRegex(t)}`, $options: 'i' } }));
  if (or.length === 0) return [];

  return FileIndex.find({ workspaceId, $or: or }).limit(limit).lean();
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}
