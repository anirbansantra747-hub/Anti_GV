import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { connectDB } from './services/db/dbService.js';
import { setupAgentSocket } from './sockets/agentSocket.js';
import { setupFsSocket } from './sockets/fsSocket.js';
import { setupTerminalSocket } from './sockets/terminalSocket.js';
import { setupExecutionSocket } from './sockets/executionSocket.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
  })
);
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
import ragRoutes from './routes/rag.js';
import fsRoutes from './routes/fs.js';
import workspaceRoutes from './routes/workspace.js';
import chatRoutes from './routes/chats.js';
import agentRoutes from './routes/agent.js';

app.use('/api/rag', ragRoutes);
app.use('/api/fs', fsRoutes);
app.use('/api/workspace', workspaceRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/agent', agentRoutes);

// Socket.io
io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });

  // Mount socket handlers
  setupAgentSocket(io, socket);
  setupFsSocket(io, socket);
  setupTerminalSocket(io, socket);
  setupExecutionSocket(io, socket);
});

// Start
const PORT = process.env.PORT || 3001;
connectDB().then(() => {
  httpServer.listen(PORT, () => {
    console.log(`🚀 Anti_GV server running on http://localhost:${PORT}`);
  });
});
