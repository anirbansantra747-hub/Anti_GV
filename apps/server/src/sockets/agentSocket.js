import { runAgentPipeline } from '../services/agent/index.js';

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
    const { prompt, context } = payload;

    console.log(`[socket] agent:prompt received from ${socket.id}`);

    if (!prompt) {
      socket.emit('agent:error', { message: 'Prompt cannot be empty' });
      return;
    }

    // Call the main orchestrator timeline, passing the approval gate
    await runAgentPipeline({
      prompt,
      frontendContext: context || {},
      serverContext: {
        terminalOutput: null,
      },
      socket,
      waitForApproval: () => waitForApproval(socket),
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
