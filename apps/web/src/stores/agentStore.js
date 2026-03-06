import { create } from 'zustand';
import { io } from 'socket.io-client';
import { buildContext } from '../services/contextService'; // Teammate's context gatherer

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const useAgentStore = create((set, get) => {
  let socket = null;

  return {
    socket: null,
    isConnected: false,
    messages: [], // { id, role, content, type: 'text' | 'plan' | 'code' | 'error', data?: any }
    isThinking: false,
    thinkingMessage: '',
    currentPlan: null,

    connect: () => {
      if (socket) return;
      socket = io(SOCKET_URL);

      socket.on('connect', () => {
        set({ isConnected: true, socket });
      });

      socket.on('disconnect', () => {
        set({ isConnected: false });
      });

      socket.on('agent:thinking', (payload) => {
        set({ isThinking: true, thinkingMessage: payload.message });
      });

      socket.on('agent:plan', (payload) => {
        set((state) => ({
          isThinking: false,
          currentPlan: payload,
          messages: [
            ...state.messages,
            { id: Date.now(), role: 'assistant', type: 'plan', data: payload },
          ],
        }));
      });

      socket.on('agent:step:start', (payload) => {
        set({ isThinking: true, thinkingMessage: `Executing: ${payload.description}` });
      });

      socket.on('agent:step:code', (payload) => {
        // In a more complex app, we accumulate chunks. For now we just push the edit block msg.
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: Date.now(),
              role: 'assistant',
              type: 'code',
              content: `Generated edits for ${payload.stepId}`,
            },
          ],
        }));
      });

      socket.on('agent:step:done', () => {
        set({ isThinking: false, thinkingMessage: '' });
      });

      socket.on('agent:done', (payload) => {
        set((state) => ({
          isThinking: false,
          thinkingMessage: '',
          messages: [
            ...state.messages,
            { id: Date.now(), role: 'assistant', type: 'text', content: payload.message },
          ],
        }));
      });

      socket.on('agent:error', (payload) => {
        set((state) => ({
          isThinking: false,
          thinkingMessage: '',
          messages: [
            ...state.messages,
            { id: Date.now(), role: 'assistant', type: 'error', content: payload.message },
          ],
        }));
      });
    },

    disconnect: () => {
      if (socket) {
        socket.disconnect();
        socket = null;
        set({ socket: null, isConnected: false });
      }
    },

    sendPrompt: async (prompt) => {
      if (!prompt.trim() || !socket) return;

      // Add user message to UI
      set((state) => ({
        messages: [
          ...state.messages,
          { id: Date.now(), role: 'user', type: 'text', content: prompt },
        ],
        isThinking: true,
        thinkingMessage: 'Gathering context...',
      }));

      try {
        // Call teammate's service to get context
        const contextString = await buildContext();

        socket.emit('agent:prompt', {
          prompt,
          context: {
            contextString,
            activeFile: null, // We could hook this into editorStore
          },
        });
      } catch (err) {
        set((state) => ({
          isThinking: false,
          messages: [
            ...state.messages,
            {
              id: Date.now(),
              role: 'assistant',
              type: 'error',
              content: `Failed to build context: ${err.message}`,
            },
          ],
        }));
      }
    },

    approvePlan: () => {
      if (!socket) return;
      socket.emit('agent:approve', {});
      set({ currentPlan: null, isThinking: true, thinkingMessage: 'Plan approved. Continuing...' });
    },

    cancel: () => {
      if (!socket) return;
      socket.emit('agent:cancel', {});
      set({ isThinking: false, currentPlan: null });
    },
  };
});
