/**
 * @file chunkMetaModel.js
 * @description Tracks embedded chunks for budgeting and LRU eviction.
 */

import mongoose from 'mongoose';

const ChunkMetaSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    chunkId: { type: String, required: true, index: true },
    filePath: { type: String, required: true, index: true },
    chunkType: { type: String, default: '' },
    name: { type: String, default: '' },
    hash: { type: String, default: '' },
    size: { type: Number, default: 0 },
    lastAccessedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true, versionKey: false }
);

ChunkMetaSchema.index({ workspaceId: 1, chunkId: 1 }, { unique: true });

const ChunkMeta = mongoose.models.ChunkMeta || mongoose.model('ChunkMeta', ChunkMetaSchema);

export default ChunkMeta;
