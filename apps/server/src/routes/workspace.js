/**
 * @file workspace.js (routes)
 * @description REST API routes for workspace management.
 *
 * Mounted at: /api/workspace
 *
 * Endpoints:
 *   GET    /api/workspace          — List all workspaces (optionally filtered by userId)
 *   POST   /api/workspace          — Create a new workspace
 *   GET    /api/workspace/:id      — Get a single workspace (with files)
 *   PUT    /api/workspace/:id      — Update workspace metadata (name, desc, pinned, language)
 *   PUT    /api/workspace/:id/files — Upsert one or many files into a workspace
 *   DELETE /api/workspace/:id/files — Remove a file by path
 *   DELETE /api/workspace/:id      — Delete entire workspace
 */

import { Router } from 'express';
import Workspace from '../services/db/workspaceModel.js';
import { isConnected } from '../services/db/dbService.js';

const router = Router();

// ── Guard: reject all requests if DB is not connected ─────────

router.use((_req, res, next) => {
  if (!isConnected()) {
    return res.status(503).json({
      success: false,
      error:
        'Database not connected. Set MONGODB_URI in your .env to enable workspace persistence.',
    });
  }
  next();
});

// ── GET /api/workspace ────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const { userId } = req.query;
    const filter = userId ? { userId } : {};
    const workspaces = await Workspace.find(filter)
      .select('-files') // omit file contents in list view
      .sort({ pinned: -1, updatedAt: -1 })
      .lean();

    res.json({ success: true, workspaces });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── POST /api/workspace ────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const { name, rootPath, userId, description, language } = req.body;

    if (!name || !rootPath) {
      return res.status(400).json({ success: false, error: '`name` and `rootPath` are required.' });
    }

    const workspace = await Workspace.create({
      name,
      rootPath,
      userId: userId || 'anonymous',
      description: description || '',
      language: language || '',
    });

    res.status(201).json({ success: true, workspace });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── GET /api/workspace/:id ─────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id).lean();
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found.' });
    }
    res.json({ success: true, workspace });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/workspace/:id — Update metadata ───────────────────

router.put('/:id', async (req, res) => {
  try {
    const { name, description, pinned, language, rootPath } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (pinned !== undefined) updates.pinned = Boolean(pinned);
    if (language !== undefined) updates.language = language;
    if (rootPath !== undefined) updates.rootPath = rootPath;

    const workspace = await Workspace.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-files');

    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found.' });
    }
    res.json({ success: true, workspace });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── PUT /api/workspace/:id/files — Upsert file(s) ───────────

/**
 * Body: { files: [{ path, content, encoding? }] }
 * OR:   { path, content, encoding? }   (single file shorthand)
 */
router.put('/:id/files', async (req, res) => {
  try {
    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found.' });
    }

    const filesToUpsert = req.body.files
      ? req.body.files
      : [{ path: req.body.path, content: req.body.content, encoding: req.body.encoding }];

    if (!filesToUpsert.length || !filesToUpsert[0].path) {
      return res.status(400).json({ success: false, error: '`path` is required.' });
    }

    for (const f of filesToUpsert) {
      workspace.upsertFile(f.path, f.content ?? '', f.encoding);
    }

    await workspace.save();
    res.json({ success: true, fileCount: workspace.files.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/workspace/:id/files — Remove a file ─────────

router.delete('/:id/files', async (req, res) => {
  try {
    const { path: filePath } = req.body;
    if (!filePath) {
      return res.status(400).json({ success: false, error: '`path` is required in request body.' });
    }

    const workspace = await Workspace.findById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found.' });
    }

    workspace.removeFile(filePath);
    await workspace.save();

    res.json({ success: true, fileCount: workspace.files.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── DELETE /api/workspace/:id — Delete workspace ─────────────

router.delete('/:id', async (req, res) => {
  try {
    const workspace = await Workspace.findByIdAndDelete(req.params.id);
    if (!workspace) {
      return res.status(404).json({ success: false, error: 'Workspace not found.' });
    }
    res.json({ success: true, message: `Workspace "${workspace.name}" deleted.` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
