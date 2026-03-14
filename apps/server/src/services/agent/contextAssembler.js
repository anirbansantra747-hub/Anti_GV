/**
 * Context Assembler (v2 â€” RAG-Powered)
 *
 * Collects and formats context for the LLM agents.
 * Uses the RAG pipeline (ChromaDB + Pinecone embeddings) to retrieve
 * semantically relevant code chunks instead of dumping raw context strings.
 *
 * Fallback: If RAG is not indexed yet, falls back to the legacy context string.
 */

import { embedChunks, isEmbeddingAvailable } from '../rag/embedder.js';
import * as vectorStore from '../rag/vectorStore.js';
import { getWorkspaceState } from '../fs/workspaceState.js';
import { findSymbols, getFileIndexes } from '../db/fileIndexService.js';
import { getImpactedFiles } from '../rag/dependencyGraph.js';
import { buildCandidateFiles } from '../rag/candidateBuilder.js';
import { ensureEmbeddingsForFiles } from '../rag/indexer.js';
import { touchChunkIds } from '../db/chunkMetaService.js';

let lastRagWarnAt = 0;

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
  const { workspaceId } = getWorkspaceState();

  // â”€â”€ 1. RAG: Retrieve semantically relevant code chunks â”€â”€
  if (userPrompt) {
    try {
      const embeddingOk = await isEmbeddingAvailable();
      if (!embeddingOk) {
        throw new Error('Embedding server unavailable');
      }
      const candidateFiles = await buildCandidateFiles({
        workspaceId,
        prompt: userPrompt,
        activeFile: frontendContext?.activeFile,
        openTabs: frontendContext?.openTabs || [],
      });
      if (candidateFiles.length > 0) {
        await ensureEmbeddingsForFiles(candidateFiles, { workspaceId });
      }

      const ragChunks = await retrieveRelevantChunks(userPrompt, workspaceId);
      if (ragChunks.length > 0) {
        finalContext += '## Relevant Code (Semantic Search)\n\n';
        for (const chunk of ragChunks) {
          finalContext += `### ${chunk.metadata.filePath} (${chunk.metadata.chunkType}: ${chunk.metadata.name}, L${chunk.metadata.startLine}â€“L${chunk.metadata.endLine})\n`;
          finalContext += '```\n' + chunk.content + '\n```\n\n';
        }

        const ids = ragChunks.map((c) => c.id).filter(Boolean);
        if (ids.length > 0) {
          await touchChunkIds(workspaceId, ids);
        }

        const filePaths = Array.from(
          new Set(ragChunks.map((c) => c.metadata?.filePath).filter(Boolean))
        );
        if (filePaths.length > 0) {
          const metas = await getFileIndexes(workspaceId, filePaths);
          if (metas.length > 0) {
            finalContext += '## File Relationships (Imports/Exports)\n\n';
            for (const meta of metas) {
              const imports = (meta.imports || []).slice(0, 8).join(', ');
              const exports = (meta.exports || []).slice(0, 8).join(', ');
              finalContext += `- ${meta.filePath}\n`;
              if (imports) finalContext += `  imports: ${imports}\n`;
              if (exports) finalContext += `  exports: ${exports}\n`;
              if (!imports && !exports) finalContext += '  imports: (none detected)\n';
            }
            finalContext += '\n';
          }
        }
      }

      const tokens = extractTokens(userPrompt);
      const symbolHits = await findSymbols(workspaceId, tokens, 12);
      if (symbolHits.length > 0) {
        finalContext += '## Symbol Matches\n\n';
        for (const hit of symbolHits) {
          const names = (hit.symbols || [])
            .map((s) => s.name)
            .filter(Boolean)
            .slice(0, 6)
            .join(', ');
          finalContext += `- ${hit.filePath}${names ? `: ${names}` : ''}\n`;
        }
        finalContext += '\n';
      }

      const activeFile = frontendContext?.activeFile;
      if (activeFile) {
        const impacted = await getImpactedFiles(workspaceId, activeFile, {
          maxDepth: 2,
          limit: 15,
        });
        if (impacted.length > 0) {
          finalContext += '## Impacted Files (Dependents)\n\n';
          for (const file of impacted) {
            finalContext += `- ${file}\n`;
          }
          finalContext += '\n';
        }
      }
    } catch (err) {
      const now = Date.now();
      if (now - lastRagWarnAt > 30000) {
        console.warn(
          '[ContextAssembler] RAG retrieval failed, falling back to legacy:',
          err.message
        );
        lastRagWarnAt = now;
      }
    }
  }

  // â”€â”€ 2. Frontend Context String (legacy fallback / supplemental) â”€â”€
  if (frontendContext?.contextString) {
    finalContext += `## Workspace Snapshot\n${frontendContext.contextString}\n\n`;
  }

  // â”€â”€ 3. Server Context: Terminal Output â”€â”€
  if (serverContext.terminalOutput) {
    finalContext += `## Recent Terminal Output\n\`\`\`bash\n${serverContext.terminalOutput}\n\`\`\`\n\n`;
  }

  // â”€â”€ 4. Server Context: Chat History Summary â”€â”€
  if (serverContext.summary) {
    finalContext += `## Conversation Summary\n${serverContext.summary}\n\n`;
  }

  if (serverContext.chatMessages && serverContext.chatMessages.length > 0) {
    const formatted = serverContext.chatMessages
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n');
    finalContext += `## Recent Conversation\n${formatted}\n\n`;
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
async function retrieveRelevantChunks(prompt, workspaceId, topK = 12) {
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
  const whereFilter = workspaceId ? { workspaceId } : undefined;
  const results = await vectorStore.query(embeddedQuery.embedding, topK, whereFilter);
  return results;
}

function extractTokens(text) {
  return text
    .split(/[^A-Za-z0-9_]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 20);
}
