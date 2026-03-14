import { create } from 'zustand';
import { io } from 'socket.io-client';
import { contextService } from '../services/contextService.js';
import { fileSystemAPI } from '../services/fileSystemAPI.js';
import { workspaceAccessService } from '../services/workspaceAccessService.js';
import { useEditorStore } from './editorStore.js';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const useAgentStore = create((set, get) => {
  let socket = null;

  return {
    socket: null,
    isConnected: false,
    messages: [],
    isThinking: false,
    thinkingMessage: '',
    currentPlan: null,
    activeTransactionId: null,
    activeTransactionFiles: [],

    connect: () => {
      if (socket) return;
      socket = io(SOCKET_URL);

      socket.on('connect', () => {
        set({ isConnected: true, socket });
      });

      socket.on('disconnect', () => {
        set({ isConnected: false });
      });

      socket.on('fs:workspace_changed', async (payload) => {
        console.log(`[Workspace] Changed to ${payload.newRoot}`);
        try {
          const { syncRealDiskToMemfs } = await import('../services/initSyncService.js');
          const { useEditorStore } = await import('./editorStore.js');

          workspaceAccessService.clear({
            mode: 'backend',
            label: payload.newRoot,
            description: 'Saving through the backend workspace root.',
          });
          useEditorStore.getState().closeAllTabs();
          await syncRealDiskToMemfs();
        } catch (err) {
          console.error('[Workspace] Failed to process workspace change:', err);
        }
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

        if (!currentTxId) {
          try {
            const { diffService } = await import('../services/diffService.js');
            currentTxId = diffService.beginTransaction();
            set({ activeTransactionId: currentTxId });
          } catch (error) {
            console.error('DiffService not ready yet', error);
          }
        }

        try {
          const parsedChunk = JSON.parse(payload.chunk);
          const rawPath = payload.file || 'unknown.js';
          const absolutePath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;

          if (parsedChunk && parsedChunk.edits && currentTxId) {
            const { diffService } = await import('../services/diffService.js');

            const patch = {
              path: absolutePath,
              operations: parsedChunk.edits.map((edit) => ({
                type: edit.search ? 'replace' : 'insert',
                search: edit.search || undefined,
                content: edit.replace,
              })),
            };

            await diffService.applyPatch(currentTxId, patch, 'AI_AGENT');
          }

          set((nextState) => ({
            activeTransactionFiles: nextState.activeTransactionFiles.includes(absolutePath)
              ? nextState.activeTransactionFiles
              : [...nextState.activeTransactionFiles, absolutePath],
            messages: [
              ...nextState.messages,
              {
                id: Date.now(),
                role: 'assistant',
                type: 'code',
                content: `Staged edits for ${absolutePath} in review transaction ${
                  currentTxId ? currentTxId.substring(0, 6) : 'none'
                }.`,
                criticFeedback: payload.criticFeedback,
              },
            ],
          }));
        } catch (err) {
          console.error('[AgentStore] Failed to apply edit to Shadow Tree:', err);
          set((nextState) => ({
            messages: [
              ...nextState.messages,
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

      socket.on('agent:message:start', (payload) => {
        set((state) => ({
          isThinking: false,
          thinkingMessage: '',
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

      socket.on('agent:done', (payload) => {
        set((state) => {
          const { messageId, message } = payload;

          if (messageId) {
            return {
              isThinking: false,
              thinkingMessage: '',
              messages: state.messages.map((msg) =>
                msg.id === messageId
                  ? { ...msg, isStreaming: false, content: msg.content || message }
                  : msg
              ),
            };
          }

          return {
            isThinking: false,
            thinkingMessage: '',
            messages: [
              ...state.messages,
              { id: Date.now(), role: 'assistant', type: 'text', content: message },
            ],
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

      set((state) => ({
        messages: [
          ...state.messages,
          { id: Date.now(), role: 'user', type: 'text', content: prompt },
        ],
        isThinking: true,
        thinkingMessage: 'Gathering context...',
      }));

      try {
        const editorState = useEditorStore.getState();
        const { contextString } = await contextService.buildContext({
          activeFile: editorState.activeFile,
          openTabs: editorState.openTabs,
          userPrompt: prompt,
        });

        socket.emit('agent:prompt', {
          prompt,
          context: {
            contextString,
            activeFile: editorState.activeFile,
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
      const socketRef = get().socket;
      if (!txId) return;

      try {
        const { diffService } = await import('../services/diffService.js');
        const tx = diffService.getTransaction(txId);
        const patchedPaths = tx?.patchedPaths ?? [];

        await diffService.commit(txId);

        for (const path of patchedPaths) {
          const content = await fileSystemAPI.readFile(path);
          await workspaceAccessService.saveFile(path, content, socketRef);
          useEditorStore.getState().clearDirty(path);
        }

        set((state) => ({
          activeTransactionId: null,
          activeTransactionFiles: [],
          messages: [
            ...state.messages,
            {
              id: Date.now(),
              role: 'assistant',
              type: 'text',
              content: `Applied and saved ${patchedPaths.length} AI change${
                patchedPaths.length === 1 ? '' : 's'
              }.`,
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
        const { diffService } = await import('../services/diffService.js');
        diffService.rollback(txId);
        set((state) => ({
          activeTransactionId: null,
          activeTransactionFiles: [],
          messages: [
            ...state.messages,
            {
              id: Date.now(),
              role: 'assistant',
              type: 'text',
              content: 'Discarded the staged AI edits.',
            },
          ],
        }));
      } catch (err) {
        console.error('Failed to rollback transaction:', err);
      }
    },
  };
});
