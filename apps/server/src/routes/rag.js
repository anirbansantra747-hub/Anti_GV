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
import { embedChunks } from '../services/rag/embedder.js';
import * as vectorStore from '../services/rag/vectorStore.js';

const router = Router();

/**
 * POST /api/rag/index
 * Body: { projectRoot: string, incremental?: boolean }
 */
router.post('/index', async (req, res) => {
  const { projectRoot, incremental = true } = req.body;

  if (!projectRoot) {
    return res.status(400).json({ error: 'projectRoot is required' });
  }

  try {
    const logs = [];
    const result = await indexProject(projectRoot, {
      incremental,
      onProgress: (msg) => {
        logs.push(msg);
        console.log(msg);
      },
    });

    res.json({ success: true, result, logs });
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
    const count = await vectorStore.getCount();
    res.json({ chunksStored: count });
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
    const results = await vectorStore.query(embeddedQuery.embedding, topK);

    res.json({
      results: results.map((r) => ({
        file: r.metadata.filePath,
        type: r.metadata.chunkType,
        name: r.metadata.name,
        lines: `L${r.metadata.startLine}-L${r.metadata.endLine}`,
        distance: r.distance,
        content: r.content.substring(0, 300) + (r.content.length > 300 ? '...' : ''),
      })),
    });
  } catch (err) {
    console.error('[RAG] Query failed:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
