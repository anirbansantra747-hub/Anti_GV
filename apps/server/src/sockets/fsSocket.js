import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import {
  readFile,
  writeFile,
  listDir,
  makeDir,
  deletePath,
  exists,
  changeWorkspace,
  resolveSafePath,
} from '../services/fs/fileService.js';
import {
  ensureWorkspaceForRoot,
  ensureWorkspaceForCurrentRoot,
  upsertFileInWorkspace,
  deleteFileInWorkspace,
} from '../services/db/workspaceService.js';
import { getWorkspaceState, setWorkspaceState } from '../services/fs/workspaceState.js';
import { scanInventory, reindexFile, removeFileIndex } from '../services/rag/indexer.js';
import { stopAllBackgroundIndexers } from '../services/rag/backgroundIndexer.js';
import { recordRecentFile, clearRecentFiles } from '../services/rag/recentFiles.js';
import { upsertInventoryForFile, removeInventory } from '../services/db/fileInventoryService.js';

const reindexTimers = new Map(); // absPath -> timeout

function scheduleReindex(absPath, workspaceId) {
  const key = absPath;
  if (reindexTimers.has(key)) clearTimeout(reindexTimers.get(key));
  reindexTimers.set(
    key,
    setTimeout(() => {
      reindexTimers.delete(key);
      reindexFile(absPath, console.log, workspaceId).catch(() => {});
    }, 400)
  );
}

const execAsync = util.promisify(exec);

export const setupFsSocket = (io, socket) => {
  (async () => {
    try {
      const state = await ensureWorkspaceState();
      if (state?.rootPath) {
        socket.emit('fs:workspace_changed', {
          newRoot: state.rootPath,
          workspaceId: state.workspaceId,
        });
      }
    } catch {
      // ignore
    }
  })();
  async function ensureWorkspaceState() {
    const state = getWorkspaceState();
    if (state.workspaceId) return state;

    const ws = await ensureWorkspaceForCurrentRoot();
    if (ws?._id) {
      setWorkspaceState({ workspaceId: ws._id.toString(), rootPath: ws.rootPath });
      return { workspaceId: ws._id.toString(), rootPath: ws.rootPath };
    }
    return state;
  }

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

      // Broadcast to ALL clients (including sender) that a file changed
      io.emit('fs:file_changed', { path });

      // Persist to Mongo (if configured)
      const { workspaceId } = await ensureWorkspaceState();
      if (workspaceId) {
        await upsertFileInWorkspace(workspaceId, path, content, 'utf8');
        const absPath = resolveSafePath(path);
        scheduleReindex(absPath, workspaceId);
        recordRecentFile(workspaceId, path);
        await upsertInventoryForFile(workspaceId, getWorkspaceState().rootPath, absPath);
      }

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
      io.emit('fs:file_changed', { path });
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
      io.emit('fs:file_changed', { path });

      const { workspaceId } = await ensureWorkspaceState();
      if (workspaceId) {
        await deleteFileInWorkspace(workspaceId, path);
        const absPath = resolveSafePath(path);
        await removeFileIndex(absPath, workspaceId);
        await removeInventory(workspaceId, path);
      }

      if (callback) callback({ success: true });
    } catch (error) {
      console.error(`[FsSocket] fs:delete failed for ${payload?.path}:`, error.message);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  socket.on('fs:rename', async (payload, callback) => {
    try {
      const { oldPath, newPath } = payload;
      const resolvedOld = resolveSafePath(oldPath);
      const resolvedNew = resolveSafePath(newPath);
      await fs.rename(resolvedOld, resolvedNew);
      io.emit('fs:file_changed', { path: newPath });

      const { workspaceId } = await ensureWorkspaceState();
      if (workspaceId) {
        await deleteFileInWorkspace(workspaceId, oldPath);
        await removeFileIndex(resolvedOld, workspaceId);
        await removeInventory(workspaceId, oldPath);
        try {
          const newContent = await readFile(newPath);
          await upsertFileInWorkspace(workspaceId, newPath, newContent, 'utf8');
          scheduleReindex(resolvedNew, workspaceId);
          recordRecentFile(workspaceId, newPath);
        } catch {
          // Ignore if binary or unreadable
        }
      }

      if (callback) callback({ success: true });
    } catch (error) {
      console.error(`[FsSocket] fs:rename failed:`, error.message);
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

      // 2.1 Ensure a workspace record exists in Mongo
      let workspaceId = null;
      const ws = await ensureWorkspaceForRoot(verifiedPath);
      if (ws?._id) {
        workspaceId = ws._id.toString();
        setWorkspaceState({ workspaceId, rootPath: verifiedPath });
      }

      if (workspaceId) {
        clearRecentFiles(workspaceId);
        stopAllBackgroundIndexers();
        await scanInventory(verifiedPath, workspaceId, { allowDefaultRoot: true });
      }

      // 3. Notify all connected clients to drop memfs and re-hydrate
      io.emit('fs:workspace_changed', { newRoot: verifiedPath, workspaceId });

      if (callback) callback({ success: true, newRoot: verifiedPath, workspaceId });
    } catch (error) {
      console.error(`[FsSocket] fs:pick_folder failed:`, error);
      if (callback) callback({ success: false, error: error.message });
    }
  });
};
