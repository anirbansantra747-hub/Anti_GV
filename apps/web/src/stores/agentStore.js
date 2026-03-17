import { create } from 'zustand';
import { io } from 'socket.io-client';
import { contextService } from '../services/contextService.js';

import { workspaceAccessService } from '../services/workspaceAccessService.js';
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
    messages: [],
    isThinking: false,
    thinkingMessage: '',
    currentPlan: null,
    activeTransactionId: null,
    activeTransactionFiles: [],
    activeTransactionMeta: {},
    chats: [],
    activeChatId: null,
    isChatLoading: false,
    workspaceRootName: null,
    workspaceRootPath: null,
    latestRunState: null,
    controlPlane: null,
    pipelinePhases: [],
    activeStep: null,

    connect: () => {
      if (socket) return;
      socket = io(SOCKET_URL);

      socket.on('connect', () => {
        set({ isConnected: true, socket });

        // Restore the last workspace path if available
        const lastWorkspacePath = localStorage.getItem('last-workspace-path');
        if (lastWorkspacePath) {
          socket.emit('fs:set_workspace', { path: lastWorkspacePath }, (res) => {
            if (res?.success) {
              console.log('[AgentStore] Successfully restored cached workspace:', res.newRoot);
            } else {
              console.error('[AgentStore] Failed to restore cached workspace:', res?.error);
              localStorage.removeItem('last-workspace-path');
            }
          });
        }
      });

      socket.on('disconnect', () => {
        set({ isConnected: false });
      });

      socket.on('agent:run_state', (payload) => {
        set((state) => {
          const phases = [...state.pipelinePhases];
          const existing = phases.findIndex(p => p.phase === payload.phase && p.taskType === payload.taskType);
          const entry = {
            phase: payload.phase,
            taskType: payload.taskType,
            status: payload.status,
            provider: payload.provider || null,
            model: payload.model || null,
            message: payload.message || '',
            timestamp: Date.now(),
          };
          if (existing >= 0) {
            phases[existing] = { ...phases[existing], ...entry };
          } else {
            phases.push(entry);
          }
          return { latestRunState: payload || null, pipelinePhases: phases };
        });
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
          if (newRoot) {
            localStorage.setItem('last-workspace-path', newRoot);
          } else {
            localStorage.removeItem('last-workspace-path');
          }
          set({ workspaceRootName: rootName, workspaceRootPath: newRoot || null });

          const { syncRealDiskToMemfs } = await import('../services/initSyncService.js');
          const { useEditorStore } = await import('./editorStore.js');

          workspaceAccessService.clear({
            mode: 'backend',
            label: payload.newRoot,
            description: 'Saving through the backend workspace root.',
          });
          useEditorStore.getState().closeAllTabs();
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
        set({ isThinking: true, thinkingMessage: `Executing: ${payload.description}`, activeStep: payload });
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
              // Pass actual disk content so diffService can use it when memfs has a stub (empty blob)
              _baseContent: payload.baseContent || null,
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
            activeTransactionMeta: {
              ...nextState.activeTransactionMeta,
              [absolutePath]: {
                fileGroupId: payload.fileGroupId || parsedChunk.fileGroupId || null,
                files: payload.files || parsedChunk.files || [absolutePath],
                verificationHints: payload.verificationHints || parsedChunk.verificationHints || [],
                provider: payload.provider || null,
                model: payload.model || null,
              },
            },
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
            latestRunState: state.latestRunState
              ? { ...state.latestRunState, status: 'done' }
              : state.latestRunState,
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

    syncWorkspaceFromPayload: async (payload) => {
      const newRoot = payload?.newRoot || '';
      const rootName = newRoot
        ? newRoot
            .split(/[/\\]+/)
            .filter(Boolean)
            .pop()
        : null;
      set({ workspaceRootName: rootName, workspaceRootPath: newRoot || null });
    },

    loadChats: async () => {
      set({ isChatLoading: true });
      try {
        const res = await fetch(`${API_URL}/api/chats`);
        const data = await res.json();
        const chats = data.chats || [];
        const nextActive = get().activeChatId || chats[0]?.chatId || null;
        set(() => ({
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

    loadControlPlane: async () => {
      try {
        const res = await fetch(`${API_URL}/api/agent/control-plane`);
        const data = await res.json();
        set({ controlPlane: data });
      } catch (err) {
        console.error('[AgentStore] Failed to load control-plane status:', err);
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

      set((state) => ({
        messages: [
          ...state.messages,
          { id: Date.now(), role: 'user', type: 'text', content: prompt },
        ],
        isThinking: true,
        thinkingMessage: 'Gathering context...',
        pipelinePhases: [],
        activeStep: null,
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

    terminate: () => {
      if (!socket) return;
      socket.emit('agent:terminate', {});
      set({ isThinking: false, thinkingMessage: '', currentPlan: null });
    },

    finalizeDiff: async ({ acceptedPaths = [], rejectedPaths = [] } = {}) => {
      const txId = get().activeTransactionId;
      const socketRef = get().socket;
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

        for (const p of accepted) {
          const content = await fileSystemAPI.readFile(p);
          await workspaceAccessService.saveFile(p, content, socketRef);
          useEditorStore.getState().clearDirty(p);
        }

        if (socketRef) {
          socketRef.emit('agent:commit', { files: accepted });
        }

        if (accepted[0]) {
          useEditorStore.getState().openFile(accepted[0]);
        }

        set((state) => ({
          activeTransactionId: null,
          activeTransactionFiles: [],
          activeTransactionMeta: {},
          messages: [
            ...state.messages,
            {
              id: Date.now(),
              role: 'assistant',
              type: 'text',
              content: `Applied and saved ${accepted.length} AI change${
                accepted.length === 1 ? '' : 's'
              }.`,
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
          activeTransactionFiles: [],
          activeTransactionMeta: {},
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

// ── Expose store globally so contextService can read chat history ──────────
// (avoids circular import: agentStore → contextService → agentStore)
if (typeof window !== 'undefined') {
  window.__agentStoreRef = { useAgentStore };
  console.log('[AgentStore] ✅ window.__agentStoreRef set for contextService chat history access');
}
