import express from 'express';
import { listDir } from '../services/fs/fileService.js';

const router = express.Router();

router.get('/list', async (req, res) => {
  try {
    const path = req.query.path || '.';
    const recursive = req.query.recursive === 'true';
    const items = await listDir(path, recursive);
    res.json({ success: true, items });
  } catch (error) {
    console.error(`[FS API] list failed for ${req.query.path}:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
