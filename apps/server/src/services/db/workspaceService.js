/**
 * @file workspaceService.js
 * @description Workspace helpers for MongoDB persistence.
 */

import path from 'path';
import Workspace from './workspaceModel.js';
import { isConnected } from './dbService.js';
import { getWorkspaceRoot } from '../fs/fileService.js';

const MAX_DB_FILE_SIZE = 1 * 1024 * 1024; // 1MB

function canStoreContent(content) {
  if (content == null) return false;
  if (typeof content !== 'string') return false;
  return Buffer.byteLength(content, 'utf8') <= MAX_DB_FILE_SIZE;
}

export async function ensureWorkspaceForRoot(rootPath) {
  if (!isConnected()) return null;
  if (!rootPath) return null;

  const existing = await Workspace.findOne({ rootPath }).lean();
  if (existing) return existing;

  const name = path.basename(rootPath) || 'workspace';
  const created = await Workspace.create({
    name,
    rootPath,
    userId: 'anonymous',
    description: '',
    // Do not set empty string; Mongo text index language override rejects ""
    language: undefined,
  });

  return created.toObject();
}

export async function ensureWorkspaceForCurrentRoot() {
  if (!isConnected()) return null;
  const rootPath = getWorkspaceRoot();
  return ensureWorkspaceForRoot(rootPath);
}

export async function upsertFileInWorkspace(workspaceId, filePath, content, encoding = 'utf8') {
  if (!isConnected() || !workspaceId || !filePath) return;

  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return;

  const safeContent = canStoreContent(content) ? content : '';
  const safeEncoding = safeContent ? encoding : 'binary';

  workspace.upsertFile(filePath, safeContent, safeEncoding);
  await workspace.save();
}

export async function deleteFileInWorkspace(workspaceId, filePath) {
  if (!isConnected() || !workspaceId || !filePath) return;
  const workspace = await Workspace.findById(workspaceId);
  if (!workspace) return;
  workspace.removeFile(filePath);
  await workspace.save();
}
