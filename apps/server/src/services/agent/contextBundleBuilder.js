import { LIMITS } from '@antigv/shared';
import { estimateTokens } from '@antigv/ai-core';
import { embedChunks, isEmbeddingAvailable } from '../rag/embedder.js';
import * as vectorStore from '../rag/vectorStore.js';
import { getWorkspaceState } from '../fs/workspaceState.js';
import { findSymbols, getFileIndexes } from '../db/fileIndexService.js';
import { getImpactedFiles } from '../rag/dependencyGraph.js';
import { buildCandidateFiles } from '../rag/candidateBuilder.js';
import { ensureEmbeddingsForFiles } from '../rag/indexer.js';
import { touchChunkIds } from '../db/chunkMetaService.js';

export async function buildContextBundle(
  frontendContext,
  serverContext = {},
  taskBrief = {},
  userPrompt = ''
) {
  const { workspaceId } = getWorkspaceState();
  const sections = [];
  const crossReferences = {};
  const perSectionBudget = {};

  const pushSection = (key, title, content, meta = {}) => {
    if (!content) return;
    const normalizedContent =
      typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    const tokenEstimate = estimateTokens(normalizedContent);
    const budget = Math.max(
      LIMITS.CONTEXT_SECTION_MIN_BUDGET,
      Math.min(tokenEstimate, meta.maxBudget || tokenEstimate)
    );
    perSectionBudget[key] = budget;
    sections.push({
      key,
      title,
      content: normalizedContent,
      tokenEstimate,
      confidence: meta.confidence ?? 1,
      references: meta.references || [],
      stale: Boolean(meta.stale),
    });
    for (const ref of meta.references || []) {
      if (!crossReferences[ref]) crossReferences[ref] = [];
      crossReferences[ref].push(key);
    }
  };

  const activeFile = frontendContext?.activeFile || null;
  const openTabs = frontendContext?.openTabs || [];

  if (frontendContext?.contextString) {
    pushSection('workspaceFocus', 'Workspace Focus', frontendContext.contextString, {
      maxBudget: LIMITS.ACTIVE_FILE_BUDGET + LIMITS.FILE_TREE_BUDGET,
      references: [activeFile, ...openTabs].filter(Boolean),
    });
  }

  const recentConversation = Array.isArray(serverContext.chatMessages)
    ? serverContext.chatMessages.slice(-LIMITS.MAX_CHAT_HISTORY_TURNS)
    : [];
  if (recentConversation.length > 0) {
    const compressed = recentConversation
      .map((msg, idx) => {
        const ageFactor = recentConversation.length - idx;
        const content = String(msg.content || '');
        const shortened = ageFactor > 3 ? content.slice(0, 180) : content;
        return `${msg.role}: ${shortened}`;
      })
      .join('\n');
    pushSection('conversationMemory', 'Conversation Memory', compressed, {
      maxBudget: LIMITS.CHAT_HISTORY_BUDGET,
      stale: recentConversation.length > 4,
    });
  }

  if (serverContext.terminalOutput) {
    pushSection('terminalEvidence', 'Terminal Evidence', serverContext.terminalOutput, {
      maxBudget: 400,
    });
  }

  if (userPrompt) {
    let retrievalConfidence = 0;
    try {
      const embeddingOk = await isEmbeddingAvailable();
      if (embeddingOk) {
        const candidateFiles = await buildCandidateFiles({
          workspaceId,
          prompt: userPrompt,
          activeFile,
          openTabs,
        });
        if (candidateFiles.length > 0) {
          await ensureEmbeddingsForFiles(candidateFiles, { workspaceId });
        }

        const ragChunks = await retrieveRelevantChunks(userPrompt, workspaceId);
        retrievalConfidence = ragChunks.length
          ? Math.max(0.3, 1 - (ragChunks[0].distance || 0))
          : 0;
        if (ragChunks.length > 0) {
          pushSection(
            'retrievedChunks',
            'Retrieved Code Chunks',
            ragChunks
              .map(
                (chunk) =>
                  `### ${chunk.metadata.filePath} (${chunk.metadata.chunkType}:${chunk.metadata.name})\n${chunk.content}`
              )
              .join('\n\n'),
            {
              confidence: Number(retrievalConfidence.toFixed(2)),
              maxBudget: LIMITS.RAG_CHUNKS_BUDGET,
              references: ragChunks.map((chunk) => chunk.metadata?.filePath).filter(Boolean),
            }
          );

          const ids = ragChunks.map((chunk) => chunk.id).filter(Boolean);
          if (ids.length > 0) {
            await touchChunkIds(workspaceId, ids);
          }

          const filePaths = Array.from(
            new Set(ragChunks.map((chunk) => chunk.metadata?.filePath).filter(Boolean))
          );

          if (filePaths.length > 0) {
            const metas = await getFileIndexes(workspaceId, filePaths);
            pushSection(
              'symbolGraph',
              'File Relationships',
              metas
                .map((meta) => {
                  const imports = (meta.imports || []).slice(0, 8).join(', ') || '(none)';
                  const exports = (meta.exports || []).slice(0, 8).join(', ') || '(none)';
                  return `${meta.filePath}\nimports: ${imports}\nexports: ${exports}`;
                })
                .join('\n\n'),
              {
                confidence: 0.8,
                maxBudget: 800,
                references: filePaths,
              }
            );
          }
        }
      }
    } catch {
      pushSection('retrievedChunks', 'Retrieved Code Chunks', '', { confidence: 0 });
    }

    const symbolHits = await findSymbols(workspaceId, extractTokens(userPrompt), 12);
    if (symbolHits.length > 0) {
      pushSection(
        'symbolMatches',
        'Symbol Matches',
        symbolHits
          .map((hit) => `${hit.filePath}: ${(hit.symbols || []).map((s) => s.name).join(', ')}`)
          .join('\n'),
        {
          confidence: 0.7,
          maxBudget: 500,
          references: symbolHits.map((hit) => hit.filePath),
        }
      );
    }

    if (activeFile) {
      const impacted = await getImpactedFiles(workspaceId, activeFile, {
        maxDepth: 2,
        limit: 15,
      });
      if (impacted.length > 0) {
        pushSection('dependencyGraph', 'Impacted Files', impacted.join('\n'), {
          confidence: 0.75,
          maxBudget: 500,
          references: impacted,
        });
      }
    }
  }

  if (taskBrief?.riskHints?.length) {
    pushSection('verificationEvidence', 'Execution Hints', taskBrief.riskHints.join('\n'), {
      confidence: 0.8,
      maxBudget: 250,
      references: taskBrief.namedTargets || [],
    });
  }

  const totalBudget = Object.values(perSectionBudget).reduce((sum, value) => sum + value, 0);
  const staleSections = sections.filter((section) => section.stale).map((section) => section.key);

  return {
    sections,
    totalBudget,
    perSectionBudget,
    retrievalConfidence:
      sections.find((section) => section.key === 'retrievedChunks')?.confidence || 0,
    crossReferences,
    staleSections,
  };
}

export function renderContextBundle(bundle, keys = []) {
  const selectedKeys = keys.length ? new Set(keys) : null;
  return bundle.sections
    .filter((section) => (selectedKeys ? selectedKeys.has(section.key) : true))
    .map((section) => `## ${section.title}\n${section.content}`)
    .join('\n\n');
}

async function retrieveRelevantChunks(prompt, workspaceId, topK = 12) {
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

  const whereFilter = workspaceId ? { workspaceId } : undefined;
  return vectorStore.query(embeddedQuery.embedding, topK, whereFilter);
}

function extractTokens(text) {
  return String(text || '')
    .split(/[^A-Za-z0-9_]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3)
    .slice(0, 20);
}
