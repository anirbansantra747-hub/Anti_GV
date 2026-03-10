import { exec } from 'child_process';
import util from 'util';
import {
  readFile,
  writeFile,
  listDir,
  makeDir,
  deletePath,
  exists,
  changeWorkspace,
} from '../services/fs/fileService.js';

const execAsync = util.promisify(exec);

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

  socket.on('fs:pick_folder', async (payload, callback) => {
    try {
      // 1. Run PowerShell to pop a native select folder dialog on the Windows host.
      const psScript = `
        Add-Type -AssemblyName System.Windows.Forms
        $f = New-Object System.Windows.Forms.FolderBrowserDialog
        $f.Description = "Select workspace folder for Anti_GV IDE"
        $f.ShowNewFolderButton = $true
        if ($f.ShowDialog() -eq 'OK') {
          Write-Output $f.SelectedPath
        }
      `;
      // execute powershell and wait for the user to pick
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -Command "${psScript.replace(/\n/g, ';')}"`
      );

      const newPath = stdout.trim();
      if (!newPath) {
        // user canceled the dialog
        if (callback) callback({ success: false, canceled: true });
        return;
      }

      // 2. Pivot the backend workspace
      const verifiedPath = await changeWorkspace(newPath);
      console.log(`[FsSocket] Workspace pivoting to: ${verifiedPath}`);

      // 3. Notify all connected clients to drop memfs and re-hydrate
      io.emit('fs:workspace_changed', { newRoot: verifiedPath });

      if (callback) callback({ success: true, newRoot: verifiedPath });
    } catch (error) {
      console.error(`[FsSocket] fs:pick_folder failed:`, error);
      if (callback) callback({ success: false, error: error.message });
    }
  });
};
