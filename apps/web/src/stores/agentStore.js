import { create } from 'zustand';
import { io } from 'socket.io-client';
import { contextSnapshotAPI } from '../services/contextSnapshotAPI'; // Teammate's context gatherer

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

      // Module 11: Token Streaming support
      socket.on('agent:message:start', (payload) => {
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: payload.messageId,
              role: 'assistant',
              type: 'text',
              content: '',
              isStreaming: true,
            },
          ],
        }));
      });

      socket.on('agent:message:stream', (payload) => {
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === payload.messageId ? { ...msg, content: msg.content + payload.chunk } : msg
          ),
        }));
      });

      socket.on('agent:step:done', () => {
        set({ isThinking: false, thinkingMessage: '' });
      });

      socket.on('agent:done', (payload) => {
        set((state) => {
          // If we have a messageId, we are concluding a streamed message
          if (payload.messageId) {
            return {
              isThinking: false,
              thinkingMessage: '',
              messages: state.messages.map((msg) =>
                msg.id === payload.messageId
                  ? {
                      ...msg,
                      isStreaming: false,
                      content: payload.message ? msg.content + payload.message : msg.content,
                    }
                  : msg
              ),
            };
          }

          // Legacy / fallback: just append a new text message if there is content
          if (payload.message) {
            return {
              isThinking: false,
              thinkingMessage: '',
              messages: [
                ...state.messages,
                { id: Date.now(), role: 'assistant', type: 'text', content: payload.message },
              ],
            };
          }

          // Otherwise just clear thinking state
          return {
            isThinking: false,
            thinkingMessage: '',
          };
        });
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
        const { contextString } = await contextSnapshotAPI.getContextSnapshot();

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

        // Grab the transaction to know exactly which paths were touched before it gets deleted on commit
        const tx = diffService.getTransaction(txId);
        const patchedPaths = tx ? [...tx.patchedPaths] : [];

        await diffService.commit(txId);

        // After committing to memfs (Tier 1), sync those changes to the real backend filesystem
        if (socket && patchedPaths.length > 0) {
          const { memfs } = await import('../services/memfsService');

          for (const path of patchedPaths) {
            try {
              // Read the new source of truth directly from memfs
              const content = await memfs.readFile(path);

              // Emit write to backend sync
              socket.emit('fs:write', { path, content }, (response) => {
                if (!response.success) {
                  console.error(`Failed to sync ${path} to disk:`, response.error);
                } else {
                  console.log(`Successfully synced ${path} to real disk.`);
                }
              });
            } catch (fsErr) {
              console.error(`Error reading ${path} from memfs to sync to disk:`, fsErr);
            }
          }
        }

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
