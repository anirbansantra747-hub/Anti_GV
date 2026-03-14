/* eslint-disable no-unused-vars */
/**
 * @file editorStore.js
 * @description Zustand store for Monaco Editor state.
 * Tracks active file, open tabs, and dirty (unsaved) file state.
 * This is a pure VIEW store — it never mutates the filesystem directly.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { bus, Events } from '../services/eventBus.js';

export const useEditorStore = create(
  persist(
    (set, get) => ({
      /** @type {string | null} Currently focused file path */
      activeFile: null,

      /** @type {string[]} All currently open tab paths */
      openTabs: [],

      /** @type {Set<string>} Files with unsaved / dirty changes */
      dirtyFiles: new Set(),

      /** @type {string[]} Paths edited in the last 5 minutes */
      recentlyEdited: [],

      /**
       * @type {{ line: number, column: number, selected: string }}
       * Current cursor position in Monaco Editor — updated on every cursor move.
       */
      cursorPosition: { line: 1, column: 1, selected: '' },

      // ── Actions ─────────────────────────────────────────────────────────────

      /**
       * Update cursor position. Called by Monaco's onDidChangeCursorPosition.
       * @param {{ line: number, column: number, selected?: string }} pos
       */
      setCursor({ line, column, selected = '' }) {
        set({ cursorPosition: { line, column, selected } });
      },

      /** Open a file tab. Sets it as active. */
      openFile(path) {
        set((state) => {
          const openTabs = state.openTabs.includes(path)
            ? state.openTabs
            : [...state.openTabs, path];
          return { activeFile: path, openTabs };
        });
      },

      /** Close a tab. If it was active, switch to the nearest open tab. */
      closeTab(path) {
        set((state) => {
          const openTabs = state.openTabs.filter((t) => t !== path);
          const activeFile =
            state.activeFile === path ? (openTabs[openTabs.length - 1] ?? null) : state.activeFile;

          const dirtyFiles = new Set(state.dirtyFiles);
          dirtyFiles.delete(path);

          return { openTabs, activeFile, dirtyFiles };
        });
      },

      /** Reset the editor when the workspace root changes. */
      closeAllTabs() {
        set({ activeFile: null, openTabs: [], dirtyFiles: new Set() });
      },

      /** Mark a file as dirty (unsaved local changes). */
      markDirty(path) {
        set((state) => {
          const dirtyFiles = new Set(state.dirtyFiles);
          dirtyFiles.add(path);
          const recentlyEdited = [path, ...state.recentlyEdited.filter((p) => p !== path)].slice(
            0,
            20
          ); // Keep last 20 entries
          return { dirtyFiles, recentlyEdited };
        });
      },

      /** Clear dirty flag after a successful Tier 2 save. */
      clearDirty(path) {
        set((state) => {
          const dirtyFiles = new Set(state.dirtyFiles);
          dirtyFiles.delete(path);
          return { dirtyFiles };
        });
      },

      /** Prune recentlyEdited to paths edited within the last 5 minutes. */
      pruneRecent() {
        // This is called periodically — in a real impl, store timestamps.
        // For now, just trim to a max of 10 paths.
        set((state) => ({
          recentlyEdited: state.recentlyEdited.slice(0, 10),
        }));
      },
    }),
    {
      name: 'anti_gv-editor-store',
      partialize: (state) => ({
        activeFile: state.activeFile,
        openTabs: state.openTabs,
        recentlyEdited: state.recentlyEdited,
      }), // Persist everything except dirtyFiles
    }
  )
);

// ── Wire to EventBus ──────────────────────────────────────────────────────────
// When Tier 2 saves successfully, clear dirty state for all known files.
bus.on(Events.CACHE_SAVED, ({ savedPaths }) => {
  const store = useEditorStore.getState();
  savedPaths?.forEach((p) => store.clearDirty(p));
});
