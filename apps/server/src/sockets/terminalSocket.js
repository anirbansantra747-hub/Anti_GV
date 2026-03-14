import os from 'os';
import * as pty from 'node-pty';
import { getWorkspaceRoot } from '../services/fs/fileService.js';

const terminals = new Map();

export const setupTerminalSocket = (io, socket) => {
  socket.on('terminal:spawn', (payload, callback) => {
    try {
      // Determine shell based on OS
      const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: payload.cols || 80,
        rows: payload.rows || 24,
        cwd: getWorkspaceRoot(),
        useConpty: (process.env.PTY_USE_CONPTY || '').toLowerCase() === 'true',
        env: process.env,
      });

      terminals.set(socket.id, ptyProcess);

      ptyProcess.onData((data) => {
        socket.emit('terminal:output', { data });
      });

      ptyProcess.onExit(() => {
        terminals.delete(socket.id);
      });

      if (callback) callback({ success: true });
    } catch (error) {
      console.error(`[TerminalSocket] Failed to spawn terminal:`, error);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  socket.on('terminal:input', (payload) => {
    const ptyProcess = terminals.get(socket.id);
    if (ptyProcess && payload.input) {
      ptyProcess.write(payload.input);
    }
  });

  socket.on('terminal:resize', (payload) => {
    const ptyProcess = terminals.get(socket.id);
    if (ptyProcess && payload.cols && payload.rows) {
      try {
        ptyProcess.resize(payload.cols, payload.rows);
      } catch (e) {
        console.warn('Terminal resize failed:', e.message);
      }
    }
  });

  socket.on('disconnect', () => {
    const ptyProcess = terminals.get(socket.id);
    if (ptyProcess) {
      terminals.delete(socket.id);
      try {
        ptyProcess.kill();
      } catch (err) {
        console.warn('[TerminalSocket] PTY kill failed:', err?.message || err);
      }
    }
  });
};
