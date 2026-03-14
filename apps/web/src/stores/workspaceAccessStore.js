import { create } from 'zustand';

const DEFAULT_SOURCE = {
  mode: 'memory',
  label: 'Scratch workspace',
  description: 'Changes live in memory until you save to a linked file or backend workspace.',
};

export const useWorkspaceAccessStore = create((set) => ({
  source: DEFAULT_SOURCE,
  setSource(source) {
    set({ source: { ...DEFAULT_SOURCE, ...source } });
  },
  resetSource() {
    set({ source: DEFAULT_SOURCE });
  },
}));
