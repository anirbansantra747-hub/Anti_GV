/**
 * @file recentFiles.js
 * @description In-memory recent file tracker per workspace.
 */

const recentByWorkspace = new Map();

export function recordRecentFile(workspaceId, filePath) {
  if (!workspaceId || !filePath) return;
  const list = recentByWorkspace.get(workspaceId) || [];
  const next = [filePath, ...list.filter((f) => f !== filePath)].slice(0, 20);
  recentByWorkspace.set(workspaceId, next);
}

export function getRecentFiles(workspaceId, limit = 10) {
  if (!workspaceId) return [];
  const list = recentByWorkspace.get(workspaceId) || [];
  return list.slice(0, limit);
}

export function clearRecentFiles(workspaceId) {
  if (!workspaceId) return;
  recentByWorkspace.delete(workspaceId);
}
