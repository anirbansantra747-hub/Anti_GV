import { create } from 'zustand';
import { io } from 'socket.io-client';
import { contextService } from '../services/contextService.js'; // Teammate's context gatherer
import { bus, Events } from '../services/eventBus.js';
import { useEditorStore } from './editorStore.js';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export const useAgentStore = create((set, get) => {
  let socket = null;
  const normalizePath = (rawPath) => {
    let path = (rawPath || '').replace(/\\/g, '/').trim();
    if (!path) return '/';
    if (!path.startsWith('/')) path = '/' + path;
    const rootName = get().workspaceRootName;
    if (rootName) {
      const prefix = `/${rootName}`;
      if (path === prefix) return '/';
      if (path.startsWith(prefix + '/')) {
        path = path.slice(prefix.length);
      }
    }
    return path;
  };

  return {
    socket: null,
    isConnected: false,
    messages: [], // { id, role, content, type: 'text' | 'plan' | 'code' | 'error', data?: any }
    isThinking: false,
    thinkingMessage: '',
    currentPlan: null,
    chats: [],
    activeChatId: null,
    isChatLoading: false,
    workspaceRootName: null,

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
          const newRoot = payload?.newRoot || '';
          const rootName = newRoot
            ? newRoot
                .split(/[/\\]+/)
                .filter(Boolean)
                .pop()
            : null;
          set({ workspaceRootName: rootName });
          useEditorStore.getState().closeAllTabs();
          const { syncRealDiskToMemfs } = await import('../services/initSyncService.js');
          await syncRealDiskToMemfs({ preferIDB: false, reset: true });
          if (socket && newRoot) {
            socket.emit('terminal:input', { input: `cd "${newRoot}"\r` });
          }
          await get().loadChats();
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
            const { diffService } = await import('../services/diffService.js');
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
            const { diffService } = await import('../services/diffService.js');

            // Format the edits into the FilePatch shape expected by DiffService
            const rawPath = payload.file || 'unknown.js';
            const rawNorm = rawPath.startsWith('/') ? rawPath : '/' + rawPath;
            let absolutePath = normalizePath(rawPath);
            try {
              const { fileSystemAPI } = await import('../services/fileSystemAPI.js');
              if (
                rawNorm !== absolutePath &&
                fileSystemAPI.existsFile(rawNorm) &&
                !fileSystemAPI.existsFile(absolutePath)
              ) {
                absolutePath = rawNorm;
              }
            } catch {
              // ignore existence checks
            }

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

      socket.on('agent:verify', (payload) => {
        const prefix = payload.stream === 'stderr' ? '[verify][err] ' : '[verify] ';
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: Date.now(),
              role: 'assistant',
              type: 'text',
              content: `${prefix}${payload.text}`,
            },
          ],
        }));
      });

      socket.on('agent:chat', (payload) => {
        if (payload?.chatId) {
          set({ activeChatId: payload.chatId });
        }
      });
    },

    disconnect: () => {
      if (socket) {
        socket.disconnect();
        socket = null;
        set({ socket: null, isConnected: false });
      }
    },

    loadChats: async () => {
      set({ isChatLoading: true });
      try {
        const res = await fetch(`${API_URL}/api/chats`);
        const data = await res.json();
        const chats = data.chats || [];
        const nextActive = get().activeChatId || chats[0]?.chatId || null;
        set((state) => ({
          chats,
          activeChatId: nextActive,
          isChatLoading: false,
        }));
        if (nextActive) {
          await get().switchChat(nextActive);
        }
      } catch (err) {
        console.error('[AgentStore] Failed to load chats:', err);
        set({ isChatLoading: false });
      }
    },

    createChat: async () => {
      set({ isChatLoading: true });
      try {
        const res = await fetch(`${API_URL}/api/chats`, { method: 'POST' });
        const data = await res.json();
        const chatId = data.chatId || null;
        set({ activeChatId: chatId, messages: [], currentPlan: null, isChatLoading: false });
        await get().loadChats();
      } catch (err) {
        console.error('[AgentStore] Failed to create chat:', err);
        set({ isChatLoading: false });
      }
    },

    switchChat: async (chatId) => {
      if (!chatId) return;
      set({ isChatLoading: true });
      try {
        const res = await fetch(`${API_URL}/api/chats/${chatId}`);
        const data = await res.json();
        const chat = data.chat;
        set({
          activeChatId: chatId,
          messages: (chat?.messages || []).map((m) => ({
            id: Date.now() + Math.random(),
            role: m.role,
            type: 'text',
            content: m.content,
          })),
          currentPlan: null,
          isChatLoading: false,
        });
      } catch (err) {
        console.error('[AgentStore] Failed to switch chat:', err);
        set({ isChatLoading: false });
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
          chatId: get().activeChatId,
          context: {
            contextString,
            activeFile,
            openTabs,
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

    finalizeDiff: async ({ acceptedPaths = [], rejectedPaths = [] } = {}) => {
      const txId = get().activeTransactionId;
      if (!txId) return;

      try {
        const { diffService } = await import('../services/diffService.js');
        const { fileSystemAPI } = await import('../services/fileSystemAPI.js');
        const patchedPaths = diffService.getTransaction(txId)?.patchedPaths || [];
        const accepted = acceptedPaths.length ? acceptedPaths : patchedPaths;
        const rejected = rejectedPaths.length
          ? rejectedPaths
          : patchedPaths.filter((p) => !accepted.includes(p));

        if (accepted.length === 0) {
          diffService.rollback(txId);
          bus.emit(Events.AI_REJECT_DIFF);
          set({ activeTransactionId: null });
          return;
        }

        if (rejected.length > 0) {
          diffService.discardPaths(txId, rejected);
        }

        await diffService.commit(txId);
        bus.emit(Events.AI_APPROVE_DIFF);

        // Persist accepted files to disk
        const activeSocket = get().socket;
        if (activeSocket) {
          for (const p of accepted) {
            const content = await fileSystemAPI.readFile(p);
            await new Promise((resolve) => {
              activeSocket.emit('fs:write', { path: normalizePath(p), content }, () => resolve());
            });
          }
          activeSocket.emit('agent:commit', { files: accepted });
        }

        if (accepted[0]) {
          useEditorStore.getState().openFile(accepted[0]);
        }

        set((state) => ({
          activeTransactionId: null,
          messages: [
            ...state.messages,
            {
              id: Date.now(),
              role: 'assistant',
              type: 'text',
              content: 'Code changes applied and saved to disk.',
            },
          ],
        }));
      } catch (err) {
        console.error('Failed to finalize diff:', err);
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

    approveTransaction: async () => {
      const txId = get().activeTransactionId;
      if (!txId) return;
      const { diffService } = await import('../services/diffService.js');
      const patchedPaths = diffService.getTransaction(txId)?.patchedPaths || [];
      await get().finalizeDiff({ acceptedPaths: patchedPaths });
    },

    rejectTransaction: async () => {
      const txId = get().activeTransactionId;
      if (!txId) return;

      try {
        const { diffService } = await import('../services/diffService.js');
        diffService.rollback(txId);
        bus.emit(Events.AI_REJECT_DIFF);
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
