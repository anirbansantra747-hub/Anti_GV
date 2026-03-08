/**
 * Context Assembler (v2 — RAG-Powered)
 *
 * Collects and formats context for the LLM agents.
 * Uses the RAG pipeline (ChromaDB + Pinecone embeddings) to retrieve
 * semantically relevant code chunks instead of dumping raw context strings.
 *
 * Fallback: If RAG is not indexed yet, falls back to the legacy context string.
 */

import { embedChunks } from '../rag/embedder.js';
import * as vectorStore from '../rag/vectorStore.js';

/**
 * Merges frontend context, server context, and RAG-retrieved code into a
 * single structured block for the LLM.
 *
 * @param {Object} frontendContext - Context from frontend contextService.js
 * @param {Object} serverContext - Server-side context (chat history, terminal)
 * @param {string} [userPrompt] - The user's prompt (used for RAG query)
 * @returns {Promise<string>} Assembled context block
 */
export const assembleContext = async (frontendContext, serverContext = {}, userPrompt = '') => {
  let finalContext = '--- START CODEBASE CONTEXT ---\n\n';

  // ── 1. RAG: Retrieve semantically relevant code chunks ──
  if (userPrompt) {
    try {
      const ragChunks = await retrieveRelevantChunks(userPrompt);
      if (ragChunks.length > 0) {
        finalContext += '## Relevant Code (Semantic Search)\n\n';
        for (const chunk of ragChunks) {
          finalContext += `### ${chunk.metadata.filePath} (${chunk.metadata.chunkType}: ${chunk.metadata.name}, L${chunk.metadata.startLine}–L${chunk.metadata.endLine})\n`;
          finalContext += '```\n' + chunk.content + '\n```\n\n';
        }
      }
    } catch (err) {
      console.warn('[ContextAssembler] RAG retrieval failed, falling back to legacy:', err.message);
    }
  }

  // ── 2. Frontend Context String (legacy fallback / supplemental) ──
  if (frontendContext?.contextString) {
    finalContext += `## Workspace Snapshot\n${frontendContext.contextString}\n\n`;
  }

  // ── 3. Server Context: Terminal Output ──
  if (serverContext.terminalOutput) {
    finalContext += `## Recent Terminal Output\n\`\`\`bash\n${serverContext.terminalOutput}\n\`\`\`\n\n`;
  }

  // ── 4. Server Context: Chat History Summary ──
  if (serverContext.summary) {
    finalContext += `## Conversation Summary\n${serverContext.summary}\n\n`;
  }

  finalContext += '--- END CODEBASE CONTEXT ---';
  return finalContext;
};

/**
 * Retrieve the top-K most relevant code chunks for a given prompt.
 * @param {string} prompt
 * @param {number} topK
 * @returns {Promise<Array<{ content: string, metadata: Object, distance: number }>>}
 */
async function retrieveRelevantChunks(prompt, topK = 12) {
  // Embed the query
  const [embeddedQuery] = await embedChunks([
    {
      filePath: '_query',
      chunkType: 'query',
      name: 'user_prompt',
      content: prompt,
      startLine: 0,
      endLine: 0,
      hash: '',
    },
  ]);

  // Query ChromaDB
  const results = await vectorStore.query(embeddedQuery.embedding, topK);
  return results;
}
