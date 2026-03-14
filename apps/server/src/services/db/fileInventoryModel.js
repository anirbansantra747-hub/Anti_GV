/**
 * @file fileInventoryModel.js
 * @description Mongoose model for workspace file inventory.
 */

import mongoose from 'mongoose';

const FileInventorySchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    filePath: { type: String, required: true, index: true },
    size: { type: Number, default: 0 },
    mtimeMs: { type: Number, default: 0 },
    hash: { type: String, default: '' },
    language: { type: String, default: '' },
    skip: { type: Boolean, default: false },
    lastEmbeddedHash: { type: String, default: '' },
    lastSeenAt: { type: Date, default: Date.now },
    lastIndexedAt: { type: Date },
  },
  { timestamps: true, versionKey: false }
);

FileInventorySchema.index({ workspaceId: 1, filePath: 1 }, { unique: true });

const FileInventory =
  mongoose.models.FileInventory || mongoose.model('FileInventory', FileInventorySchema);

export default FileInventory;
