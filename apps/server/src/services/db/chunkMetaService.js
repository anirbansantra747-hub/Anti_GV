/**
 * @file chunkMetaService.js
 * @description Chunk metadata persistence and LRU eviction helpers.
 */

import ChunkMeta from './chunkMetaModel.js';
import { isConnected } from './dbService.js';

export async function upsertChunkMetas(workspaceId, chunks) {
  if (!isConnected() || !workspaceId || !chunks || chunks.length === 0) return;
  const bulk = ChunkMeta.collection.initializeUnorderedBulkOp();

  for (const chunk of chunks) {
    bulk
      .find({ workspaceId, chunkId: chunk.chunkId })
      .upsert()
      .updateOne({
        $set: {
          workspaceId,
          chunkId: chunk.chunkId,
          filePath: chunk.filePath,
          chunkType: chunk.chunkType,
          name: chunk.name,
          hash: chunk.hash,
          size: chunk.size || 0,
          lastAccessedAt: new Date(),
        },
      });
  }

  await bulk.execute();
}

export async function touchChunkIds(workspaceId, chunkIds) {
  if (!isConnected() || !workspaceId || !chunkIds || chunkIds.length === 0) return;
  await ChunkMeta.updateMany(
    { workspaceId, chunkId: { $in: chunkIds } },
    { $set: { lastAccessedAt: new Date() } }
  );
}

export async function countChunks(workspaceId) {
  if (!isConnected() || !workspaceId) return 0;
  return ChunkMeta.countDocuments({ workspaceId });
}

export async function getOldestChunkIds(workspaceId, limit) {
  if (!isConnected() || !workspaceId) return [];
  const docs = await ChunkMeta.find({ workspaceId })
    .sort({ lastAccessedAt: 1 })
    .limit(limit)
    .lean();
  return docs.map((d) => d.chunkId);
}

export async function deleteChunkIds(workspaceId, chunkIds) {
  if (!isConnected() || !workspaceId || !chunkIds || chunkIds.length === 0) return;
  await ChunkMeta.deleteMany({ workspaceId, chunkId: { $in: chunkIds } });
}

export async function deleteByFile(workspaceId, filePath) {
  if (!isConnected() || !workspaceId || !filePath) return;
  await ChunkMeta.deleteMany({ workspaceId, filePath });
}
