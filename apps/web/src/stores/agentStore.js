import { create } from 'zustand';
import { io } from 'socket.io-client';
import { contextService } from '../services/contextService.js'; // Teammate's context gatherer

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

      socket.on('agent:step:code', async (payload) => {
        const state = get();
        let currentTxId = state.activeTransactionId;

        // 1. Begin a transaction if we don't have one open
        if (!currentTxId) {
          // Try to import diffService dynamically or safely
          try {
            const { diffService } = await import('../services/diffService');
            currentTxId = diffService.beginTransaction();
            set({ activeTransactionId: currentTxId });
          } catch (e) {
            console.error('DiffService not ready yet', e);
          }
        }

        try {
          // 2. Parse the edits
          const parsedChunk = JSON.parse(payload.chunk);
          if (parsedChunk && parsedChunk.edits && currentTxId) {
            const { diffService } = await import('../services/diffService');

            // Format the edits into the FilePatch shape expected by DiffService
            const rawPath = payload.file || 'unknown.js';
            const absolutePath = rawPath.startsWith('/') ? rawPath : '/' + rawPath;

            const patch = {
              path: absolutePath,
              operations: parsedChunk.edits.map((edit) => ({
                type: edit.search ? 'replace' : 'insert',
                content: edit.replace,
              })),
            };

            // Apply patch to shadow tree
            await diffService.applyPatch(currentTxId, patch, 'AI_AGENT');
          }

          set((state) => ({
            messages: [
              ...state.messages,
              {
                id: Date.now(),
                role: 'assistant',
                type: 'code',
                content: `Staged edits for ${payload.file || 'file'} in Shadow Tree (TX: ${currentTxId ? currentTxId.substring(0, 6) : 'none'})`,
                criticFeedback: payload.criticFeedback,
              },
            ],
          }));
        } catch (err) {
          console.error('[AgentStore] Failed to apply edit to Shadow Tree:', err);
          set((state) => ({
            messages: [
              ...state.messages,
              {
                id: Date.now(),
                role: 'assistant',
                type: 'error',
                content: `Failed to stage edits: ${err.message}`,
              },
            ],
          }));
        }
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
        const { contextString } = await contextService.buildContext({
          activeFile: null,
          openTabs: [],
          userPrompt: prompt,
        });

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

    approveTransaction: async () => {
      const txId = get().activeTransactionId;
      if (!txId) return;

      try {
        const { diffService } = await import('../services/diffService');
        await diffService.commit(txId);
        set((state) => ({
          activeTransactionId: null,
          messages: [
            ...state.messages,
            {
              id: Date.now(),
              role: 'assistant',
              type: 'text',
              content: '✅ Code changes applied to standard workspace. Transaction committed.',
            },
          ],
        }));
      } catch (err) {
        console.error('Failed to commit transaction:', err);
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: Date.now(),
              role: 'assistant',
              type: 'error',
              content: `Commit failed: ${err.message}`,
            },
          ],
        }));
      }
    },

    rejectTransaction: async () => {
      const txId = get().activeTransactionId;
      if (!txId) return;

      try {
        const { diffService } = await import('../services/diffService');
        diffService.rollback(txId);
        set((state) => ({
          activeTransactionId: null,
          messages: [
            ...state.messages,
            {
              id: Date.now(),
              role: 'assistant',
              type: 'text',
              content: '❌ Code changes discarded. Transaction rolled back.',
            },
          ],
        }));
      } catch (err) {
        console.error('Failed to rollback transaction:', err);
      }
    },
  };
});
