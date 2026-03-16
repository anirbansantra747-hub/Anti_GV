/**
 * @file workspaceModel.js
 * @description Mongoose schema & model for workspace persistence.
 *
 * A workspace holds metadata about a project (name, root path) and
 * an array of file blobs so that sessions can be resumed across devices.
 */

import mongoose from 'mongoose';

// ── Sub-schema: individual file entry ────────────────────────

const FileEntrySchema = new mongoose.Schema(
  {
    /** Relative path within the workspace, e.g. "src/index.js" */
    path: {
      type: String,
      required: true,
      trim: true,
    },
    /** UTF-8 file content. Large files should be stored as blobs separately. */
    content: {
      type: String,
      default: '',
    },
    /** File encoding hint — "utf8" | "binary" */
    encoding: {
      type: String,
      default: 'utf8',
      enum: ['utf8', 'binary'],
    },
  },
  { _id: false, timestamps: { createdAt: false, updatedAt: 'updatedAt' } }
);

// ── Main workspace schema ─────────────────────────────────────

const WorkspaceSchema = new mongoose.Schema(
  {
    /** Human-readable name, e.g. "my-webserver" */
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    /**
     * Root path on the server filesystem.
     * Used by the file-system service to scope file reads/writes.
     */
    rootPath: {
      type: String,
      required: true,
      trim: true,
    },
    /**
     * Optional user identifier. Not enforced until auth middleware is wired.
     * Format: any string (JWT sub, session ID, etc.)
     */
    userId: {
      type: String,
      default: 'anonymous',
      index: true,
    },
    /** Description / notes for this workspace */
    description: {
      type: String,
      default: '',
      maxlength: 500,
    },
    /** Persisted file snapshots */
    files: {
      type: [FileEntrySchema],
      default: [],
    },
    /** Language / framework tag, e.g. "node", "python", "java" */
    language: {
      type: String,
      default: undefined,
      trim: true,
    },
    /** Whether this workspace is pinned / starred */
    pinned: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
    versionKey: false,
  }
);

// ── Indexes ────────────────────────────────────────────────────
WorkspaceSchema.index({ userId: 1, createdAt: -1 });
WorkspaceSchema.index({ name: 'text', description: 'text' });

// ── Helpers ────────────────────────────────────────────────────

/**
 * Upsert a file inside this workspace.
 * Adds it if the path doesn't exist; replaces content if it does.
 */
WorkspaceSchema.methods.upsertFile = function (filePath, content, encoding = 'utf8') {
  const existing = this.files.find((f) => f.path === filePath);
  if (existing) {
    existing.content = content;
    existing.encoding = encoding;
  } else {
    this.files.push({ path: filePath, content, encoding });
  }
};

/**
 * Remove a file by path.
 */
WorkspaceSchema.methods.removeFile = function (filePath) {
  this.files = this.files.filter((f) => f.path !== filePath);
};

// ── Model export ───────────────────────────────────────────────
const Workspace = mongoose.models.Workspace || mongoose.model('Workspace', WorkspaceSchema);

export default Workspace;
