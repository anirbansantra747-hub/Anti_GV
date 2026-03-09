/**
 * @file fileSystemStore.js
 * @description React/Zustand reactive view of the Tier 1 In-Memory Map.
 * Provides reactive hooks for the `react-arborist` FileTree and workspace state.
 *
 * Subscribes to FS events via fsSubscriptions — the formal public API for
 * external modules. Never monkey-patches memfs internals.
 */

import { create } from 'zustand';
import { memfs } from '../services/memfsService.js';
import { fsSubscriptions } from '../services/fsSubscriptions.js';

// Serialize memfs tree into a plain-object structure React can diff.
function serializeTree(node) {
  if (node.type === 'file') {
    return { id: node.id, name: node.name, type: 'file', binary: node.binary ?? false };
  }
  const children = [];
  for (const childNode of node.children.values()) {
    children.push(serializeTree(childNode));
  }
  // Sort: Directories first, then alphabetically
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { id: node.id, name: node.name, type: 'dir', children };
}

export const useFileSystemStore = create((set) => ({
  // Tree Data for react-arborist
  treeData: [serializeTree(memfs.workspace.root)],

  // Workspace Meta (driven by V3 state machine via fsSubscriptions)
  workspaceId:      memfs.workspace.id,
  workspaceState:   memfs.workspace.state,   // 'IDLE' | 'AI_PENDING' | 'DIFF_REVIEW' | 'COMMITTING' | 'CONFLICT' | 'ERROR'
  workspaceVersion: memfs.workspace.version, // rootTreeHash (Merkle)

  // Error states
  integrityFailed: false,
  conflictPayload: null, // { localVersion, remoteVersion } when CONFLICT

  // Sync snapshot from memfs into store
  syncFromMemfs: () => {
    set({
      treeData:         [serializeTree(memfs.workspace.root)],
      workspaceState:   memfs.workspace.state,
      workspaceVersion: memfs.workspace.version,
    });
  },
}));

// ── Event subscriptions via fsSubscriptions (public module API) ───────────────

// File tree mutations → re-render FileTree
fsSubscriptions.onTreeChanged(() => {
  useFileSystemStore.getState().syncFromMemfs();
});

// State machine transitions → update statusbar badge
fsSubscriptions.onStateChanged((event) => {
  useFileSystemStore.setState({ workspaceState: event.to });
});

// Conflict detection → surface conflict payload
fsSubscriptions.onConflict((payload) => {
  useFileSystemStore.setState({
    conflictPayload: payload,
    workspaceState: 'CONFLICT',
  });
});

// Integrity failure → freeze UI with error banner
fsSubscriptions.onIntegrityFail((payload) => {
  useFileSystemStore.setState({ integrityFailed: true });
  console.error('[fileSystemStore] 🔴 Integrity failure:', payload);
});
