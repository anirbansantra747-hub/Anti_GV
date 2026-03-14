import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useToastStore } from './toastStore.js';

const DEFAULT_PROFILE = {
  name: 'Local Operator',
  email: 'local@anti-gv.dev',
  role: 'Builder',
  bio: 'Running the local workspace without remote auth requirements.',
};

export const useSessionStore = create(
  persist(
    (set) => ({
      localMode: true,
      isAuthenticated: true,
      profile: DEFAULT_PROFILE,

      signIn(payload = {}) {
        const nextProfile = {
          ...DEFAULT_PROFILE,
          ...payload,
          name: payload.name?.trim() || DEFAULT_PROFILE.name,
          email: payload.email?.trim() || DEFAULT_PROFILE.email,
        };
        set({ isAuthenticated: true, profile: nextProfile });
        useToastStore.getState().pushToast({
          title: 'Local session ready',
          description: `Signed in as ${nextProfile.name}.`,
          tone: 'success',
        });
      },

      register(payload = {}) {
        const nextProfile = {
          ...DEFAULT_PROFILE,
          ...payload,
          name: payload.name?.trim() || 'New Local User',
          email: payload.email?.trim() || DEFAULT_PROFILE.email,
          role: payload.role?.trim() || 'Builder',
        };
        set({ isAuthenticated: true, profile: nextProfile });
        useToastStore.getState().pushToast({
          title: 'Workspace profile created',
          description: `${nextProfile.name} can start coding immediately.`,
          tone: 'success',
        });
      },

      signOut() {
        set({
          isAuthenticated: false,
          profile: {
            ...DEFAULT_PROFILE,
            name: 'Guest',
            email: 'guest@anti-gv.dev',
            role: 'Viewer',
          },
        });
        useToastStore.getState().pushToast({
          title: 'Signed out',
          description: 'Local mode remains available without credentials.',
          tone: 'info',
        });
      },

      updateProfile(patch) {
        set((state) => ({
          profile: {
            ...state.profile,
            ...patch,
          },
        }));
        useToastStore.getState().pushToast({
          title: 'Profile updated',
          description: 'Your local workspace identity has been refreshed.',
          tone: 'success',
        });
      },
    }),
    {
      name: 'anti-gv-session',
      partialize: (state) => ({
        localMode: state.localMode,
        isAuthenticated: state.isAuthenticated,
        profile: state.profile,
      }),
    }
  )
);
