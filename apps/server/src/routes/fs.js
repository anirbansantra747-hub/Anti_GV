import express from 'express';
import { isWorkspaceReady, listDir } from '../services/fs/fileService.js';

const router = express.Router();

router.get('/list', async (req, res) => {
  try {
    if (!isWorkspaceReady()) {
      res.json({ success: true, items: [], workspaceReady: false });
      return;
    }

    const path = req.query.path || '.';
    const recursive = req.query.recursive === '1' || req.query.recursive === 'true';
    const items = await listDir(path, { recursive });
    res.json({ success: true, items, workspaceReady: true });
  } catch (error) {
    console.error(`[FS API] list failed for ${req.query.path}:`, error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
