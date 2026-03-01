import { LIMITS } from '@antigv/shared';
import { estimateTokens } from './tokenCounter.js';

/**
 * Allocate context budget across different sources.
 * Returns how many tokens each source gets, trimming lower-priority sources first.
 *
 * @param {object} context — { activeFile, openTabs[], fileTree, chatHistory[], userPrompt }
 * @returns {object} — budget allocation per source
 */
export function allocateContextBudget(context) {
  const max = LIMITS.MAX_TOKENS_PER_REQUEST;

  const systemPrompt = LIMITS.SYSTEM_PROMPT_BUDGET;
  const userPrompt = Math.min(estimateTokens(context.userPrompt), LIMITS.USER_PROMPT_BUDGET);

  let remaining = max - systemPrompt - userPrompt;

  // Priority order: active file > RAG chunks > file tree > chat history
  const activeFile = Math.min(
    estimateTokens(context.activeFile),
    remaining,
    LIMITS.ACTIVE_FILE_BUDGET
  );
  remaining -= activeFile;

  const ragChunks = Math.min(remaining, LIMITS.RAG_CHUNKS_BUDGET);
  remaining -= ragChunks;

  const fileTree = Math.min(estimateTokens(context.fileTree), remaining, LIMITS.FILE_TREE_BUDGET);
  remaining -= fileTree;

  const chatHistory = Math.min(remaining, LIMITS.CHAT_HISTORY_BUDGET);

  return {
    systemPrompt,
    userPrompt,
    activeFile,
    ragChunks,
    fileTree,
    chatHistory,
    total: systemPrompt + userPrompt + activeFile + ragChunks + fileTree + chatHistory,
  };
}
