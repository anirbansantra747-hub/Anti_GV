/**
 * @file chats.js
 * @description Chat session REST API.
 */

import { Router } from 'express';
import { getWorkspaceState, setWorkspaceState } from '../services/fs/workspaceState.js';
import { ensureChat, listChats, getChat, deleteChat } from '../services/db/chatService.js';
import { ensureWorkspaceForCurrentRoot } from '../services/db/workspaceService.js';

const router = Router();

router.get('/', async (_req, res) => {
  let { workspaceId } = getWorkspaceState();
  if (!workspaceId) {
    const ws = await ensureWorkspaceForCurrentRoot();
    if (ws?._id) {
      workspaceId = ws._id.toString();
      setWorkspaceState({ workspaceId, rootPath: ws.rootPath });
    }
  }
  if (!workspaceId) return res.json({ chats: [] });
  const chats = await listChats(workspaceId);
  res.json({ chats });
});

router.post('/', async (_req, res) => {
  let { workspaceId } = getWorkspaceState();
  if (!workspaceId) {
    const ws = await ensureWorkspaceForCurrentRoot();
    if (ws?._id) {
      workspaceId = ws._id.toString();
      setWorkspaceState({ workspaceId, rootPath: ws.rootPath });
    }
  }
  if (!workspaceId) return res.status(400).json({ error: 'Workspace not set' });
  const chat = await ensureChat(workspaceId, null);
  res.json({ chatId: chat.chatId, title: chat.title });
});

router.get('/:chatId', async (req, res) => {
  let { workspaceId } = getWorkspaceState();
  if (!workspaceId) {
    const ws = await ensureWorkspaceForCurrentRoot();
    if (ws?._id) {
      workspaceId = ws._id.toString();
      setWorkspaceState({ workspaceId, rootPath: ws.rootPath });
    }
  }
  if (!workspaceId) return res.status(400).json({ error: 'Workspace not set' });
  const chat = await getChat(workspaceId, req.params.chatId);
  if (!chat) return res.status(404).json({ error: 'Chat not found' });
  res.json({ chat });
});

router.delete('/:chatId', async (req, res) => {
  let { workspaceId } = getWorkspaceState();
  if (!workspaceId) {
    const ws = await ensureWorkspaceForCurrentRoot();
    if (ws?._id) {
      workspaceId = ws._id.toString();
      setWorkspaceState({ workspaceId, rootPath: ws.rootPath });
    }
  }
  if (!workspaceId) return res.status(400).json({ error: 'Workspace not set' });
  await deleteChat(workspaceId, req.params.chatId);
  res.json({ success: true });
});

export default router;
