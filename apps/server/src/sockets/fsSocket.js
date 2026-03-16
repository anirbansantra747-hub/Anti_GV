import { exec } from 'child_process';
import util from 'util';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
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
      const { path: filePath } = payload;
      const workspaceRoot = getWorkspaceState().rootPath;
      console.log(`[FsSocket] fs:read: ${filePath} (workspace: ${workspaceRoot})`);
      const content = await readFile(filePath);
      if (callback) callback({ success: true, content });
    } catch (error) {
      console.error(`[FsSocket] fs:read failed for ${payload?.path}:`, error.message);
      if (callback) callback({ success: false, error: error.message });
    }
  });

  socket.on('fs:write', async (payload, callback) => {
    try {
      const { path: filePath, content } = payload;
      const workspaceRoot = getWorkspaceState().rootPath;
      console.log(`[FsSocket] fs:write: ${filePath} (workspace: ${workspaceRoot})`);
      await writeFile(filePath, content);

      // Broadcast to ALL clients (including sender) that a file changed
      io.emit('fs:file_changed', { path: filePath });

      // Persist to Mongo (if configured)
      const { workspaceId } = await ensureWorkspaceState();
      if (workspaceId) {
        await upsertFileInWorkspace(workspaceId, filePath, content, 'utf8');
        const absPath = resolveSafePath(filePath);
        scheduleReindex(absPath, workspaceId);
        recordRecentFile(workspaceId, filePath);
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
    const tempScript = path.join(os.tmpdir(), `agv_pick_${Date.now()}.ps1`);
    try {
      // 1. Write a PS1 script that uses IFileOpenDialog (modern Windows Explorer folder picker)
      //    instead of the old FolderBrowserDialog tree-view dialog.
      const psContent = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class AgvFolderPicker {
    [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
    private class FileOpenDialogClass {}

    [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileDialog {
        [PreserveSig] int Show(IntPtr hwnd);
        void SetFileTypes(uint n, IntPtr p);
        void SetFileTypeIndex(uint i);
        void GetFileTypeIndex(out uint i);
        void Advise(IntPtr p, out uint c);
        void Unadvise(uint c);
        [PreserveSig] int SetOptions(uint o);
        [PreserveSig] int GetOptions(out uint o);
        void SetDefaultFolder(IntPtr p);
        void SetFolder(IntPtr p);
        void GetFolder(out IntPtr p);
        void GetCurrentSelection(out IntPtr p);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string n);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string n);
        [PreserveSig] int SetTitle([MarshalAs(UnmanagedType.LPWStr)] string t);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string l);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string l);
        [PreserveSig] int GetResult(out IShellItem r);
        void AddPlace(IntPtr p, int f);
        void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string e);
        void Close(int h);
        void SetClientGuid(ref Guid g);
        void ClearClientData();
        void SetFilter(IntPtr f);
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    public interface IShellItem {
        void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
        void GetParent(out IShellItem ppsi);
        void GetDisplayName(uint sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
        void Compare(IShellItem psi, uint hint, out int piOrder);
    }

    public static string Pick() {
        try {
            var dialog = (IFileDialog)new FileOpenDialogClass();
            uint options;
            dialog.GetOptions(out options);
            options |= 0x20; // FOS_PICKFOLDERS
            dialog.SetOptions(options);
            dialog.SetTitle("Select Workspace Folder");
            int hr = dialog.Show(IntPtr.Zero);
            if (hr != 0) return "";
            IShellItem item;
            dialog.GetResult(out item);
            string folderPath;
            item.GetDisplayName(0x80058000, out folderPath); // SIGDN_FILESYSPATH
            return folderPath;
        } catch { return ""; }
    }
}
'@
$result = [AgvFolderPicker]::Pick()
if ($result) { Write-Output $result }
`;

      await fs.writeFile(tempScript, psContent, 'utf8');

      // Execute the script — powershell opens the modern Windows Explorer folder picker
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -File "${tempScript}"`
      );

      const newPath = stdout.trim();
      if (!newPath) {
        // user canceled the dialog
        if (callback) callback({ success: false, canceled: true });
        return;
      }

      console.log(`[FsSocket] User selected folder: ${newPath}`);

      // 2. Pivot the backend workspace
      const verifiedPath = await changeWorkspace(newPath);
      console.log(`[FsSocket] Workspace pivoting to: ${verifiedPath}`);

      // 2.1 IMMEDIATELY update workspace state (do NOT wait for MongoDB)
      setWorkspaceState({ rootPath: verifiedPath });
      console.log(`[FsSocket] Workspace state updated immediately to: ${verifiedPath}`);

      // 2.2 Ensure a workspace record exists in Mongo (async, non-blocking)
      let workspaceId = null;
      const ws = await ensureWorkspaceForRoot(verifiedPath);
      if (ws?._id) {
        workspaceId = ws._id.toString();
        console.log(`[FsSocket] Workspace record created/found: ${workspaceId}`);
        setWorkspaceState({ workspaceId, rootPath: verifiedPath });
        console.log(`[FsSocket] Workspace state updated with MongoDB ID`);
      } else {
        console.warn(`[FsSocket] MongoDB unavailable or workspace creation failed`);
      }

      if (workspaceId) {
        clearRecentFiles(workspaceId);
        stopAllBackgroundIndexers();
        console.log(`[FsSocket] Starting inventory scan for: ${verifiedPath}`);
        await scanInventory(verifiedPath, workspaceId, { allowDefaultRoot: true });
        console.log(`[FsSocket] Inventory scan complete`);
      }

      // 3. Notify all connected clients to drop memfs and re-hydrate
      console.log(`[FsSocket] Broadcasting workspace_changed event to all clients`);
      io.emit('fs:workspace_changed', { newRoot: verifiedPath, workspaceId });

      // 4. Kill all terminals so they respawn in the new workspace
      console.log(`[FsSocket] Killing all terminals to force respawn in new workspace`);
      io.of('/').sockets.forEach((s) => {
        s.emit('terminal:workspace_changed');
      });

      if (callback) callback({ success: true, newRoot: verifiedPath, workspaceId });
    } catch (error) {
      console.error(`[FsSocket] fs:pick_folder failed:`, error);
      if (callback) callback({ success: false, error: error.message });
    } finally {
      await fs.unlink(tempScript).catch(() => {});
    }
  });
};
