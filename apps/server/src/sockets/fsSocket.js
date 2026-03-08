import {
  readFile,
  writeFile,
  listDir,
  makeDir,
  deletePath,
  exists,
} from '../services/fs/fileService.js';

export const setupFsSocket = (io, socket) => {
  socket.on('fs:read', async (payload, callback) => {
    try {
      const { path } = payload;
      const content = await readFile(path);
      if (callback) callback({ success: true, content });
    } catch (error) {
      console.error(`[FsSocket] fs:read failed for ${payload?.path}:`, error.message);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  socket.on('fs:write', async (payload, callback) => {
    try {
      const { path, content } = payload;
      await writeFile(path, content);

      // Broadcast to other clients that a file changed
      socket.broadcast.emit('fs:file_changed', { path });

      if (callback) callback({ success: true });
    } catch (error) {
      console.error(`[FsSocket] fs:write failed for ${payload?.path}:`, error.message);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  socket.on('fs:list', async (payload, callback) => {
    try {
      const { path = '.' } = payload || {};
      const items = await listDir(path);
      if (callback) callback({ success: true, items });
    } catch (error) {
      console.error(`[FsSocket] fs:list failed for ${payload?.path}:`, error.message);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  socket.on('fs:exists', async (payload, callback) => {
    try {
      const { path } = payload;
      const fileExists = await exists(path);
      if (callback) callback({ success: true, exists: fileExists });
    } catch (error) {
      if (callback) callback({ success: false, error: error.message });
    }
  });

  socket.on('fs:mkdir', async (payload, callback) => {
    try {
      const { path } = payload;
      await makeDir(path);
      socket.broadcast.emit('fs:file_changed', { path });
      if (callback) callback({ success: true });
    } catch (error) {
      console.error(`[FsSocket] fs:mkdir failed for ${payload?.path}:`, error.message);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  socket.on('fs:delete', async (payload, callback) => {
    try {
      const { path } = payload;
      await deletePath(path);
      socket.broadcast.emit('fs:file_changed', { path });
      if (callback) callback({ success: true });
    } catch (error) {
      console.error(`[FsSocket] fs:delete failed for ${payload?.path}:`, error.message);
      if (callback) callback({ success: false, error: error.message });
    }
  });
};
