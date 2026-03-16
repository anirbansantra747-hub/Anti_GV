import path from 'path';

let currentWorkspaceId = null;
let currentWorkspaceRoot = path.resolve(process.cwd(), '../../');
let workspaceIsReady = false; // Track if workspace has been explicitly set by user

export function setWorkspaceState({ workspaceId, rootPath }) {
  currentWorkspaceId = workspaceId ?? currentWorkspaceId;
  currentWorkspaceRoot = rootPath ?? currentWorkspaceRoot;
  // Mark as ready once explicitly set
  if (rootPath) workspaceIsReady = true;
}

export function getWorkspaceState() {
  return {
    workspaceId: currentWorkspaceId,
    rootPath: currentWorkspaceRoot,
  };
}

export function isWorkspaceReady() {
  return workspaceIsReady;
}

export function clearWorkspaceState() {
  currentWorkspaceId = null;
  currentWorkspaceRoot = null;
  workspaceIsReady = false;
}
