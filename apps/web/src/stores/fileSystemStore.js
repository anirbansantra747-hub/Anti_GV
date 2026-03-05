/**
 * @file fileSystemStore.js
 * @description React/Zustand reactive view of the Tier 1 In-Memory Map.
 * Provides the reactive hooks necessary for the `react-arborist` FileTree.
 */

import { create } from 'zustand';
import { memfs } from '../services/memfsService';

// To effectively use Zustand with an object that contains Map(),
// we extract the structural nodes into a simpler representation that React can diff.
function serializeTree(node) {
  if (node.type === 'file') {
    return {
      id: node.id,
      name: node.name,
      type: 'file',
      binary: node.binary
    };
  }

  const children = [];
  for (const childNode of node.children.values()) {
    children.push(serializeTree(childNode));
  }

  // Sort: Directories first, then alphabetically
  children.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'dir' ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });

  return {
    id: node.id,
    name: node.name,
    type: 'dir',
    children
  };
}

export const useFileSystemStore = create((set) => ({
  // Tree Data for react-arborist
  treeData: [serializeTree(memfs.workspace.root)],
  
  // Workspace Meta
  workspaceId: memfs.workspace.id,
  workspaceState: memfs.workspace.state,
  workspaceVersion: memfs.workspace.version,

  // Event dispatcher to force React to re-render when Tier 1 mutates
  syncFromMemfs: () => {
    set({
      treeData: [serializeTree(memfs.workspace.root)],
      workspaceState: memfs.workspace.state,
      workspaceVersion: memfs.workspace.version
    });
  }
}));

// Provide a mechanism to hook up the memfs _triggerWorkspaceUpdate
// so it automatically alerts the Zustand store.
memfs._triggerWorkspaceUpdate = () => {
  useFileSystemStore.getState().syncFromMemfs();
};
