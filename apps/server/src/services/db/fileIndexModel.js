/**
 * @file fileIndexModel.js
 * @description Stores per-file symbol and dependency metadata for a workspace.
 */

import mongoose from 'mongoose';

const SymbolSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    startLine: { type: Number, default: 1 },
    endLine: { type: Number, default: 1 },
    hash: { type: String, default: '' },
  },
  { _id: false }
);

const FileIndexSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    filePath: { type: String, required: true, index: true },
    language: { type: String, default: '' },
    imports: { type: [String], default: [] },
    exports: { type: [String], default: [] },
    symbols: { type: [SymbolSchema], default: [] },
  },
  { timestamps: true, versionKey: false }
);

FileIndexSchema.index({ workspaceId: 1, filePath: 1 }, { unique: true });
FileIndexSchema.index({ workspaceId: 1, 'symbols.name': 1 });
FileIndexSchema.index({ workspaceId: 1, imports: 1 });

const FileIndex = mongoose.models.FileIndex || mongoose.model('FileIndex', FileIndexSchema);

export default FileIndex;
