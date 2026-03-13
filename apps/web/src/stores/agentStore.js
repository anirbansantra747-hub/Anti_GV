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

      socket.on('fs:workspace_changed', async (payload) => {
        console.log(`[Workspace] Changed to ${payload.newRoot}`);
        try {
          const { syncRealDiskToMemfs } = await import('../services/initSyncService.js');
          const { useEditorStore } = await import('./editorStore.js');

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
                search: edit.search || undefined,
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

          // Fallback if no messageId was provided but there's a final message
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
        // ── Pull real editor state from editorStore ──────────────────────
        const { useEditorStore } = await import('./editorStore.js');
        const editorState = useEditorStore.getState();
        const activeFile = editorState.activeFile;
        const openTabs = editorState.openTabs || [];
        const cursorPosition = editorState.cursorPosition || { line: 1, column: 1, selected: '' };

        console.group('[AgentStore] sendPrompt()');
        console.log('  prompt       :', prompt.slice(0, 80) + (prompt.length > 80 ? '…' : ''));
        console.log('  activeFile   :', activeFile);
        console.log('  openTabs     :', openTabs);
        console.log('  cursorPos    :', cursorPosition);

        // Build enriched context with ALL signals
        const { contextString, includedFiles } = await contextService.buildContext({
          activeFile,
          openTabs,
          userPrompt: prompt,
          cursorPosition,
        });

        console.log('  includedFiles:', includedFiles);
        console.log('  contextLen   :', contextString.length, 'chars');
        console.groupEnd();

        socket.emit('agent:prompt', {
          prompt,
          context: {
            contextString,
            activeFile,
          },
        });
      } catch (err) {
        console.error('[AgentStore] sendPrompt failed:', err);
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
      set({ currentPlan: null, isThinking: true, thinkingMessage: 'Plan approved. Coding...' });
    },

    rejectPlan: () => {
      if (!socket) return;
      socket.emit('agent:reject', {});
      set({ currentPlan: null, isThinking: false, thinkingMessage: '' });

      // Optionally add a local message showing the user rejected it
      set((state) => ({
        messages: [
          ...state.messages,
          {
            id: Date.now(),
            role: 'user',
            type: 'text',
            content: '❌ Plan rejected.',
          },
        ],
      }));
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

// ── Expose store globally so contextService can read chat history ──────────
// (avoids circular import: agentStore → contextService → agentStore)
if (typeof window !== 'undefined') {
  window.__agentStoreRef = { useAgentStore };
  console.log('[AgentStore] ✅ window.__agentStoreRef set for contextService chat history access');
}
