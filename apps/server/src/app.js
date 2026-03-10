import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import dotenv from 'dotenv';
import { setupAgentSocket } from './sockets/agentSocket.js';
import { setupFsSocket } from './sockets/fsSocket.js';
import { setupTerminalSocket } from './sockets/terminalSocket.js';

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

// Routes
import ragRoutes from './routes/rag.js';
import fsRoutes from './routes/fs.js';

app.use('/api/rag', ragRoutes);
app.use('/api/fs', fsRoutes);

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
});

// Start
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Anti_GV server running on http://localhost:${PORT}`);
});
