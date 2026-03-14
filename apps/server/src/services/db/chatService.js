/**
 * @file chatService.js
 * @description Chat session persistence helpers.
 */

import crypto from 'crypto';
import Chat from './chatModel.js';
import { isConnected } from './dbService.js';
import { generateResponse } from '../llm/llmRouter.js';

const MAX_MESSAGES = Number(process.env.CHAT_MAX_MESSAGES) || 12;

export async function ensureChat(workspaceId, chatId) {
  if (!isConnected() || !workspaceId) return null;

  if (chatId) {
    const existing = await Chat.findOne({ workspaceId, chatId });
    if (existing) return existing;
  }

  const newChatId = chatId || crypto.randomUUID();
  const chat = await Chat.create({
    workspaceId,
    chatId: newChatId,
    title: 'New Chat',
    summary: '',
    messages: [],
  });
  return chat;
}

export async function listChats(workspaceId) {
  if (!isConnected() || !workspaceId) return [];
  return Chat.find({ workspaceId })
    .sort({ updatedAt: -1 })
    .select({ chatId: 1, title: 1, updatedAt: 1, createdAt: 1 })
    .lean();
}

export async function getChat(workspaceId, chatId) {
  if (!isConnected() || !workspaceId || !chatId) return null;
  return Chat.findOne({ workspaceId, chatId }).lean();
}

export async function deleteChat(workspaceId, chatId) {
  if (!isConnected() || !workspaceId || !chatId) return null;
  return Chat.deleteOne({ workspaceId, chatId });
}

export async function addMessage(workspaceId, chatId, role, content) {
  if (!isConnected() || !workspaceId || !chatId) return null;

  const chat = await Chat.findOne({ workspaceId, chatId });
  if (!chat) return null;

  chat.messages.push({ role, content, createdAt: new Date() });
  if (chat.messages.length === 1 && role === 'user' && content) {
    chat.title = content.slice(0, 48);
  }

  if (chat.messages.length > MAX_MESSAGES) {
    const summary = await summarizeChat(chat.summary, chat.messages);
    chat.summary = summary;
    chat.messages = chat.messages.slice(-MAX_MESSAGES);
  }

  await chat.save();
  return chat;
}

async function summarizeChat(previousSummary, messages) {
  const formatted = messages
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n');

  const prompt = `Summarize the following conversation in <= 6 bullet points.\n\nPREVIOUS SUMMARY:\n${previousSummary}\n\nNEW MESSAGES:\n${formatted}`;

  try {
    const response = await generateResponse(
      [
        { role: 'system', content: 'You are a concise summarizer.' },
        { role: 'user', content: prompt },
      ],
      { model: 'llama-3.3-70b-versatile', temperature: 0.2 }
    );
    return response?.trim() || previousSummary || '';
  } catch {
    return previousSummary || '';
  }
}
