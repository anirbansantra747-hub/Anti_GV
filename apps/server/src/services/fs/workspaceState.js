import path from 'path';

let currentWorkspaceId = null;
let currentWorkspaceRoot = null;
let workspaceIsReady = false; // Track if workspace has been explicitly set by user

export function setWorkspaceState(nextState) {
  const { workspaceId, rootPath } = nextState;
  if (Object.prototype.hasOwnProperty.call(nextState, 'workspaceId')) {
    currentWorkspaceId = workspaceId;
  }
  if (Object.prototype.hasOwnProperty.call(nextState, 'rootPath')) {
    currentWorkspaceRoot = rootPath;
  }
  // Mark as ready once explicitly set
  if (rootPath) workspaceIsReady = true;
}

export function getWorkspaceState() {
  return {
    workspaceId: currentWorkspaceId,
    rootPath: currentWorkspaceRoot,
    fallbackRoot: path.resolve(process.cwd(), '../../'),
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
