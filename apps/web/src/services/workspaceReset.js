/**
 * @file workspaceReset.js
 * @description Resets the in-memory workspace to a clean, empty state.
 */

import { memfs } from './memfsService.js';
import { blobStore } from './blobStore.js';
import { snapshotGC } from './snapshotGC.js';
import { bus, Events } from './eventBus.js';
import { useEditorStore } from '../stores/editorStore.js';

/**
 * Clear the workspace (files, blobs, snapshots, and editor tabs).
 * Keeps the workspace id stable unless overrideId is provided.
 * @param {{ newId?: string | null }} [opts]
 */
export function resetWorkspace(opts = {}) {
  const { newId = null } = opts;

  // Reset memfs tree + metadata
  memfs.workspace.root = {
    type: 'dir',
    id: 'root',
    name: '/',
    children: new Map(),
  };
  if (newId) {
    memfs.workspace.id = newId;
  }
  memfs.workspace.version = 'initial-root-hash';
  memfs.workspace.state = 'IDLE';
  memfs.workspace.locked = false;

  // Clear blobs + snapshots
  blobStore.reset();
  snapshotGC.clear();

  // Clear editor state
  const editor = useEditorStore.getState();
  if (editor?.closeAllTabs) editor.closeAllTabs();

  // Notify UI + caches
  bus.emit(Events.WS_RESET, { workspaceId: memfs.workspace.id });
  bus.emit(Events.FS_MUTATED, { workspaceId: memfs.workspace.id, path: null });
}
