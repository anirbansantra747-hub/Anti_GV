import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { setupAgentSocket } from './sockets/agentSocket.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
  },
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// TODO: Mount routes
// import agentRoutes from './routes/agentRoutes.js';
// import executionRoutes from './routes/executionRoutes.js';
// import workspaceRoutes from './routes/workspaceRoutes.js';
// app.use('/api/agent', agentRoutes);
// app.use('/api/execute', executionRoutes);
// app.use('/api/workspaces', workspaceRoutes);

// Socket.io
io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });

  // Mount socket handlers
  setupAgentSocket(io, socket);
  // setupExecutionSocket(io, socket);
});

// Start
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Anti_GV server running on http://localhost:${PORT}`);
});
