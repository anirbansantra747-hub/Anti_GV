import { create } from 'zustand';

let nextToastId = 1;

export const useToastStore = create((set, get) => ({
  toasts: [],

  pushToast({ title, description = '', tone = 'info', duration = 3200 }) {
    const id = nextToastId++;
    const toast = { id, title, description, tone };
    set((state) => ({ toasts: [...state.toasts, toast] }));

    if (duration > 0) {
      window.setTimeout(() => {
        get().removeToast(id);
      }, duration);
    }

    return id;
  },

  removeToast(id) {
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));
