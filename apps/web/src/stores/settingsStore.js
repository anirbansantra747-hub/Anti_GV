import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useToastStore } from './toastStore.js';

export const useSettingsStore = create(
  persist(
    (set) => ({
      editorFontSize: 14,
      wordWrap: 'on',
      reducedMotion: false,
      compactDensity: false,
      showTerminalByDefault: true,
      showLineNumbers: true,

      updateSettings(patch) {
        set((state) => ({ ...state, ...patch }));
        useToastStore.getState().pushToast({
          title: 'Settings saved',
          description: 'Your local brutalist workspace preferences were applied.',
          tone: 'success',
        });
      },
    }),
    {
      name: 'anti-gv-settings',
      partialize: (state) => ({
        editorFontSize: state.editorFontSize,
        wordWrap: state.wordWrap,
        reducedMotion: state.reducedMotion,
        compactDensity: state.compactDensity,
        showTerminalByDefault: state.showTerminalByDefault,
        showLineNumbers: state.showLineNumbers,
      }),
    }
  )
);
