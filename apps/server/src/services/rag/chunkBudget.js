/**
 * @file chunkBudget.js
 * @description Enforce per-workspace chunk budget with LRU eviction.
 */

import { countChunks, getOldestChunkIds, deleteChunkIds } from '../db/chunkMetaService.js';
import * as vectorStore from './vectorStore.js';

const DEFAULT_BUDGET = Number(process.env.CHUNK_BUDGET) || 10000;

export async function enforceChunkBudget(workspaceId, budget = DEFAULT_BUDGET) {
  if (!workspaceId) return { evicted: 0 };

  const count = await countChunks(workspaceId);
  if (count <= budget) return { evicted: 0 };

  const excess = count - budget;
  const ids = await getOldestChunkIds(workspaceId, excess);
  if (ids.length === 0) return { evicted: 0 };

  await vectorStore.deleteByIds(ids);
  await deleteChunkIds(workspaceId, ids);

  return { evicted: ids.length };
}
