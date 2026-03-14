import { runAgentPipeline } from '../services/agent/index.js';
import { getWorkspaceState, setWorkspaceState } from '../services/fs/workspaceState.js';
import { ensureChat, addMessage, getChat } from '../services/db/chatService.js';
import { runVerification } from '../services/verification/verificationRunner.js';
import { ensureWorkspaceForCurrentRoot } from '../services/db/workspaceService.js';
import { startBackgroundIndex } from '../services/rag/backgroundIndexer.js';

/**
 * Per-socket approval gate.
 * When the pipeline reaches the planning phase it calls `waitForApproval()`.
 * That returns a Promise that only resolves when the client emits
 * `agent:approve` or `agent:reject`.
 */
const pendingApprovals = new Map(); // socketId → { resolve }

export const setupAgentSocket = (io, socket) => {
  /**
   * Listen for user prompts coming from the AIPanel
   */
  socket.on('agent:prompt', async (payload) => {
    const { prompt, context, chatId: incomingChatId } = payload;

    console.log(`[socket] agent:prompt received from ${socket.id}`);

    if (!prompt) {
      socket.emit('agent:error', { message: 'Prompt cannot be empty' });
      return;
    }

    let { workspaceId } = getWorkspaceState();
    if (!workspaceId) {
      const ws = await ensureWorkspaceForCurrentRoot();
      if (ws?._id) {
        workspaceId = ws._id.toString();
        setWorkspaceState({ workspaceId, rootPath: ws.rootPath });
      }
    }
    if (workspaceId) {
      startBackgroundIndex(workspaceId, { onProgress: (msg) => console.log(msg) });
    }
    const chat = workspaceId ? await ensureChat(workspaceId, incomingChatId) : null;
    const chatId = chat?.chatId;

    if (workspaceId && chatId) {
      await addMessage(workspaceId, chatId, 'user', prompt);
      socket.emit('agent:chat', { chatId });
    }

    const chatState = workspaceId && chatId ? await getChat(workspaceId, chatId) : null;

    // Call the main orchestrator timeline, passing the approval gate
    await runAgentPipeline({
      prompt,
      frontendContext: context || {},
      serverContext: {
        terminalOutput: null,
        summary: chatState?.summary || '',
        chatMessages: chatState?.messages || [],
      },
      socket,
      waitForApproval: () => waitForApproval(socket),
      chatId,
      workspaceId,
    });
  });

  /**
   * Listen for user approving a generated plan
   */
  socket.on('agent:approve', () => {
    console.log(`[socket] agent:approve received from ${socket.id}`);
    const pending = pendingApprovals.get(socket.id);
    if (pending) {
      pending.resolve({ approved: true });
      pendingApprovals.delete(socket.id);
      console.log(`[socket] ✅ Pipeline resumed (approved)`);
    } else {
      console.warn(`[socket] agent:approve received but no pending approval found`);
    }
  });

  /**
   * Listen for user rejecting a generated plan
   */
  socket.on('agent:reject', () => {
    console.log(`[socket] agent:reject received from ${socket.id}`);
    const pending = pendingApprovals.get(socket.id);
    if (pending) {
      pending.resolve({ approved: false });
      pendingApprovals.delete(socket.id);
      console.log(`[socket] ❌ Pipeline aborted (rejected)`);
    }
  });

  /**
   * Listen for user cancelling an operation
   */
  socket.on('agent:cancel', () => {
    console.log(`[socket] agent:cancel received from ${socket.id}`);
    const pending = pendingApprovals.get(socket.id);
    if (pending) {
      pending.resolve({ approved: false });
      pendingApprovals.delete(socket.id);
    }
  });

  socket.on('agent:commit', async (payload) => {
    const { workspaceId } = getWorkspaceState();
    const changedFiles = payload?.files || [];
    if (!workspaceId || changedFiles.length === 0) return;
    await runVerification({ workspaceId, socket, changedFiles });
  });

  /**
   * Clean up on disconnect
   */
  socket.on('disconnect', () => {
    const pending = pendingApprovals.get(socket.id);
    if (pending) {
      pending.resolve({ approved: false });
      pendingApprovals.delete(socket.id);
      console.log(`[socket] Client disconnected — pending approval auto-rejected`);
    }
  });
};

/**
 * Returns a Promise that pauses the pipeline until the user
 * emits `agent:approve` or `agent:reject`.
 * @param {import('socket.io').Socket} socket
 * @returns {Promise<{ approved: boolean }>}
 */
function waitForApproval(socket) {
  return new Promise((resolve) => {
    console.log(
      `[socket] ⏸️  Pipeline PAUSED — waiting for agent:approve or agent:reject from ${socket.id}`
    );
    pendingApprovals.set(socket.id, { resolve });
  });
}
