import path from 'path';

let currentWorkspaceId = null;
let currentWorkspaceRoot = path.resolve(process.cwd(), '../../');

export function setWorkspaceState({ workspaceId, rootPath }) {
  currentWorkspaceId = workspaceId ?? currentWorkspaceId;
  currentWorkspaceRoot = rootPath ?? currentWorkspaceRoot;
}

export function getWorkspaceState() {
  return {
    workspaceId: currentWorkspaceId,
    rootPath: currentWorkspaceRoot,
  };
}

export function clearWorkspaceState() {
  currentWorkspaceId = null;
  currentWorkspaceRoot = null;
}
