/**
 * @file rag.js
 * @description REST routes for RAG operations.
 *
 * POST /api/rag/index   — Trigger full or incremental project indexing
 * GET  /api/rag/status  — Get indexing status (chunk count)
 * POST /api/rag/query   — Direct query endpoint for testing
 */

import { Router } from 'express';
import { indexProject } from '../services/rag/indexer.js';
import { embedChunks, getEmbeddingHealth } from '../services/rag/embedder.js';
import * as vectorStore from '../services/rag/vectorStore.js';
import { getWorkspaceRoot } from '../services/fs/fileService.js';
import { getWorkspaceState } from '../services/fs/workspaceState.js';
import FileInventory from '../services/db/fileInventoryModel.js';
import { touchChunkIds } from '../services/db/chunkMetaService.js';

const router = Router();

/**
 * POST /api/rag/index
 * Body: { projectRoot: string, incremental?: boolean }
 */
router.post('/index', async (req, res) => {
  const { projectRoot, incremental = true } = req.body;
  const { workspaceId } = getWorkspaceState();

  const root = projectRoot || getWorkspaceRoot();

  try {
    const logs = [];
    const result = await indexProject(root, {
      incremental,
      workspaceId: workspaceId || 'default',
      allowDefaultRoot: Boolean(projectRoot),
      onProgress: (msg) => {
        logs.push(msg);
        console.log(msg);
      },
    });

    res.json({ success: true, result, logs, workspaceId: workspaceId || 'default' });
  } catch (err) {
    console.error('[RAG] Indexing failed:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/rag/status
 */
router.get('/status', async (_req, res) => {
  try {
    const { workspaceId } = getWorkspaceState();
    const embeddingHealth = await getEmbeddingHealth();
    let chromaOk = true;
    let count = 0;
    try {
      count = await vectorStore.getCount();
    } catch {
      chromaOk = false;
    }
    const inventoryCount = workspaceId ? await FileInventory.countDocuments({ workspaceId }) : 0;
    res.json({
      chunksStored: count,
      workspaceId: workspaceId || 'default',
      inventoryCount,
      embeddingOk: embeddingHealth.ok,
      embeddingInfo: embeddingHealth.info || null,
      chromaOk,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/rag/query
 * Body: { query: string, topK?: number }
 */
router.post('/query', async (req, res) => {
  const { query: queryText, topK = 10 } = req.body;
  const { workspaceId } = getWorkspaceState();

  if (!queryText) {
    return res.status(400).json({ error: 'query is required' });
  }

  try {
    // Embed the query
    const [embeddedQuery] = await embedChunks([
      {
        filePath: 'query',
        chunkType: 'query',
        name: 'user_query',
        content: queryText,
        startLine: 0,
        endLine: 0,
        hash: '',
      },
    ]);

    // Search ChromaDB
    const where = workspaceId ? { workspaceId } : undefined;
    const results = await vectorStore.query(embeddedQuery.embedding, topK, where);
    const ids = results.map((r) => r.id).filter(Boolean);
    if (ids.length > 0 && workspaceId) {
      await touchChunkIds(workspaceId, ids);
    }

    res.json({
      results: results.map((r) => ({
        file: r.metadata.filePath,
        type: r.metadata.chunkType,
        name: r.metadata.name,
        lines: `L${r.metadata.startLine}-L${r.metadata.endLine}`,
        distance: r.distance,
        content: r.content.substring(0, 300) + (r.content.length > 300 ? '...' : ''),
      })),
      workspaceId: workspaceId || 'default',
    });
  } catch (err) {
    console.error('[RAG] Query failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
