/**
 * @file chatModel.js
 * @description Workspace-scoped chat sessions.
 */

import mongoose from 'mongoose';

const ChatMessageSchema = new mongoose.Schema(
  {
    role: { type: String, required: true, enum: ['user', 'assistant', 'system'] },
    content: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ChatSchema = new mongoose.Schema(
  {
    workspaceId: { type: String, required: true, index: true },
    chatId: { type: String, required: true, index: true },
    title: { type: String, default: 'New Chat' },
    summary: { type: String, default: '' },
    messages: { type: [ChatMessageSchema], default: [] },
  },
  { timestamps: true, versionKey: false }
);

ChatSchema.index({ workspaceId: 1, chatId: 1 }, { unique: true });

const Chat = mongoose.models.Chat || mongoose.model('Chat', ChatSchema);

export default Chat;
