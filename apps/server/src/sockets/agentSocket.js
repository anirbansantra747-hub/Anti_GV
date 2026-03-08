import { runAgentPipeline } from '../services/agent/index.js';

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

    // Call the main orchestrator timeline
    await runAgentPipeline({
      prompt,
      frontendContext: context || {},
      serverContext: {
        // Here we could grab terminal output from execution memory if needed
        terminalOutput: null,
      },
      socket,
    });
  });

  /**
   * Listen for user approving a generated plan
   */
  socket.on('agent:approve', (payload) => {
    console.log(`[socket] agent:approve received from ${socket.id}`);
    // Future: Resume the paused pipeline after planning
  });

  /**
   * Listen for user cancelling an operation
   */
  socket.on('agent:cancel', () => {
    console.log(`[socket] agent:cancel received from ${socket.id}`);
    // Future: Abort controller logic for LLM streaming
  });
};
