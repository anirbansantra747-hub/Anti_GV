/**
 * Context Assembler
 * Collects and formats context for the LLM agents.
 * It takes the static context from the frontend (via contextService.js)
 * and enriches it with server-side context (e.g., chat history, terminal output).
 */

/**
 * Merges frontend context and server context into a single structured block.
 * @param {Object} frontendContext - Context object from frontend contextService.js
 * @param {Object} serverContext - Additional context from the server (chat history, terminal)
 * @returns {string} Fully assembled text block ready for the LLM system prompt
 */
export const assembleContext = (frontendContext, serverContext = {}) => {
  let finalContext = '--- START CODEBASE CONTEXT ---\n\n';

  // 1. Frontend Context String (pre-assembled by contextService.js)
  if (frontendContext.contextString) {
    // The frontend's contextString includes File Tree, Active File, Open Tabs, etc.
    finalContext += `${frontendContext.contextString}\n\n`;
  } else {
    // Fallback if frontend sends raw data instead of contextString
    finalContext += '[Warning: No contextString provided by frontend]\n\n';
  }

  // 2. Server Context: Terminal Output (if provided)
  if (serverContext.terminalOutput) {
    finalContext += `## Recent Terminal Output\n\`\`\`bash\n${serverContext.terminalOutput}\n\`\`\`\n\n`;
  }

  // 3. Server Context: Chat History Summary (if provided)
  if (serverContext.summary) {
    finalContext += `## Conversation Summary\n${serverContext.summary}\n\n`;
  }

  finalContext += '--- END CODEBASE CONTEXT ---';

  return finalContext;
};
