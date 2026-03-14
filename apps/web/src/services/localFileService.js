/**
 * @file localFileService.js
 * @description Handles importing files and folders from the local OS filesystem.
 */

import { fileSystemAPI } from './fileSystemAPI.js';
import { memfs } from './memfsService.js';
import { snapshotStore } from './snapshotService.js';
import { bus, Events } from './eventBus.js';
import { recordSnapshot } from '../components/History/HistoryDrawer.jsx';
import { useEditorStore } from '../stores/editorStore.js';
import { useToastStore } from '../stores/toastStore.js';
import { workspaceAccessService } from './workspaceAccessService.js';
import { resetWorkspace } from './workspaceReset.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const BINARY_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'ico',
  'bmp',
  'woff',
  'woff2',
  'ttf',
  'eot',
  'otf',
  'mp3',
  'mp4',
  'wav',
  'ogg',
  'webm',
  'pdf',
  'zip',
  'gz',
  'tar',
  '7z',
  'rar',
  'exe',
  'dll',
  'so',
  'dylib',
  'node',
]);

function isBinaryExt(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  return BINARY_EXTS.has(ext);
}

function normalizeDirectoryInputPath(relativePath) {
  const segments = relativePath.split('/').filter(Boolean);
  if (segments.length <= 1) return `/${segments[0] ?? ''}`;
  return `/${segments.slice(1).join('/')}`;
}

function openFirstImportedFile(paths) {
  const firstFile = paths.find((path) => path && !path.endsWith('/'));
  if (firstFile) {
    useEditorStore.getState().openFile(firstFile);
  }
}

function notifyImportResult({ label, kind = 'file', writtenPaths, failed, skipped }) {
  const toast = useToastStore.getState();

  if (writtenPaths.length > 0) {
    toast.pushToast({
      title: `${label} opened`,
      description: `${writtenPaths.length} ${kind}${writtenPaths.length === 1 ? '' : 's'} loaded successfully.`,
      tone: 'success',
    });
  }

  skipped.forEach(({ path, reason }) => {
    toast.pushToast({
      title: 'Upload skipped',
      description: `${path}: ${reason}`,
      tone: 'warning',
      duration: 5200,
    });
  });

  failed.forEach(({ path, reason }) => {
    toast.pushToast({
      title: 'Upload failed',
      description: `${path}: ${reason}`,
      tone: 'error',
      duration: 5600,
    });
  });

  if (!writtenPaths.length && !failed.length && !skipped.length) {
    toast.pushToast({
      title: `${label} cancelled`,
      description: 'No files were opened.',
      tone: 'info',
    });
  }
}

// Skip noisy or reserved segments anywhere in the path
const SKIP_SEGMENTS = new Set(['node_modules', '.git', '.turbo', 'dist', '.cache', '.DS_Store']);
function shouldSkipPath(path) {
  const parts = path.split('/').filter(Boolean);
  return parts.some((p) => SKIP_SEGMENTS.has(p));
}

// ── Core writer ────────────────────────────────────────────────────────────────


/**
 * @param {Array<{ path: string, file: File }>} entries
 * @param {(progress: { done: number, total: number, current: string }) => void} [onProgress]
 * @returns {Promise<{ writtenPaths: string[], failed: Array<{ path: string, reason: string }>, skipped: Array<{ path: string, reason: string }> }>}
 */
export async function writeFilesToMemfs(entries, onProgress) {
  const writtenPaths = [];
  const failed = [];
  const skipped = [];
  let done = 0;

  for (const { path, file } of entries) {
    if (shouldSkipPath(path)) {
      done++;
      onProgress?.({ done, total: entries.length, current: path });
      continue;
    }
    if (file.size > MAX_FILE_SIZE) {
      skipped.push({
        path,
        reason: `File exceeds ${Math.round(MAX_FILE_SIZE / 1024 / 1024)} MB limit`,
      });
      done++;
      onProgress?.({ done, total: entries.length, current: path });
      continue;
    }

    try {
      const content = isBinaryExt(file.name) ? await file.arrayBuffer() : await file.text();
      await fileSystemAPI.writeFile(path, content, { sourceModule: 'UI', silent: true });
      writtenPaths.push(path);
    } catch (err) {
      failed.push({ path, reason: err?.message || 'Unknown write error' });
      console.error(`[LocalFS] Failed to write ${path}:`, err);
    }

    done++;
    onProgress?.({ done, total: entries.length, current: path });
  }

  if (writtenPaths.length > 0) {
    try {
      const newHash = await snapshotStore.computeTreeHash(memfs.workspace.root);
      memfs.workspace.version = newHash;
      const fileCount = memfs.readdir('/', { recursive: true }).length;
      recordSnapshot(newHash, fileCount, `Batch imported ${writtenPaths.length} files`);
    } catch {
      /* ignore */
    }

    bus.emit(Events.FS_MUTATED, { workspaceId: memfs.workspace.id, path: null });
  }

  return { writtenPaths, failed, skipped };
}

export const supportsFileSystemAccess =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window;

export const supportsDirectoryPicker =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

export async function openFilesViaFSA(onProgress) {
  if (!supportsFileSystemAccess) throw new Error('File System Access API not supported');

  const handles = await window.showOpenFilePicker({ multiple: true });
  const entries = await Promise.all(
    handles.map(async (handle) => ({
      path: `/${handle.name}`,
      file: await handle.getFile(),
      handle,
    }))
  );

  const result = await writeFilesToMemfs(entries, onProgress);
  workspaceAccessService.linkFiles(
    entries,
    `${result.writtenPaths.length || entries.length} linked file${entries.length === 1 ? '' : 's'}`
  );
  openFirstImportedFile(result.writtenPaths);
  notifyImportResult({
    label: 'Files',
    writtenPaths: result.writtenPaths,
    failed: result.failed,
    skipped: result.skipped,
  });
  return result.writtenPaths;
}

export async function openDirectoryViaFSA(onProgress) {
  if (!supportsDirectoryPicker) throw new Error('Directory Picker API not supported');

  const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
  resetWorkspace();
  const entries = await collectDirectoryEntries(dirHandle, '/');
  const result = await writeFilesToMemfs(entries, onProgress);
  workspaceAccessService.linkDirectory(dirHandle, entries);
  openFirstImportedFile(result.writtenPaths);
  notifyImportResult({
    label: dirHandle.name || 'Folder',
    writtenPaths: result.writtenPaths,
    failed: result.failed,
    skipped: result.skipped,
  });
  return dirHandle.name;
}

async function collectDirectoryEntries(dirHandle, basePath) {
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const fullPath = `${basePath === '/' ? '' : basePath}/${name}`.replace(/\/{2,}/g, '/');

    if (handle.kind === 'file') {
      entries.push({
        path: fullPath.startsWith('/') ? fullPath : `/${fullPath}`,
        file: await handle.getFile(),
        handle,
      });
      continue;
    } else if (handle.kind === 'directory') {
      if (SKIP_SEGMENTS.has(name)) continue;
      const subEntries = await collectDirectoryEntries(handle, fullPath);
      entries.push(...subEntries);

    }

    if (['node_modules', '.git', '.turbo', 'dist', '.cache'].includes(name)) continue;
    const subEntries = await collectDirectoryEntries(handle, fullPath);
    entries.push(...subEntries);
  }
  return entries;
}

export function openFilesViaInput(opts = {}, onProgress) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = opts.multiple !== false;

    if (opts.directory) {
      // Open Folder replaces the current workspace
      resetWorkspace();
      input.webkitdirectory = true;
      input.mozdirectory = true;
    }

    input.onchange = async () => {
      try {
        const files = Array.from(input.files ?? []);
        if (!files.length) {
          notifyImportResult({
            label: opts.directory ? 'Folder' : 'Files',
            writtenPaths: [],
            failed: [],
            skipped: [],
          });
          resolve([]);
          return;
        }

        const entries = files.map((file) => {
          const rel =
            opts.directory && file.webkitRelativePath
              ? normalizeDirectoryInputPath(file.webkitRelativePath)
              : `/${file.webkitRelativePath || file.name}`.replace(/\/{2,}/g, '/');
          return { path: rel.startsWith('/') ? rel : `/${rel}`, file };
        });

        if (opts.directory) {
          resetWorkspace();
          workspaceAccessService.markImported('Imported folder');
        } else {
          workspaceAccessService.markImported('Imported files');
        }

        const result = await writeFilesToMemfs(entries, onProgress);
        openFirstImportedFile(result.writtenPaths);
        notifyImportResult({
          label: opts.directory ? 'Folder' : 'Files',
          writtenPaths: result.writtenPaths,
          failed: result.failed,
          skipped: result.skipped,
        });
        resolve(result.writtenPaths);
      } catch (err) {
        useToastStore.getState().pushToast({
          title: 'Open failed',
          description: err?.message || 'File selection could not be processed.',
          tone: 'error',
          duration: 5600,
        });
        reject(err);
      }
    };

    input.onerror = reject;
    input.click();
  });
}

export async function handleDrop(event, onProgress) {
  event.preventDefault();

  const items = Array.from(event.dataTransfer?.items ?? []);
  const entries = [];
  let containsDirectory = false;

  for (const item of items) {
    if (item.kind !== 'file') continue;

    const fsEntry = item.webkitGetAsEntry?.();
    if (fsEntry) {
      if (fsEntry.isDirectory) containsDirectory = true;
      await collectFSEntry(fsEntry, '/', entries);
    } else {
      const file = item.getAsFile();
      if (file) entries.push({ path: `/${file.name}`, file });
    }
  }

  if (containsDirectory) {
    resetWorkspace();
    workspaceAccessService.markImported('Dropped folder');
  } else {
    workspaceAccessService.markImported('Dropped files');
  }

  const result = await writeFilesToMemfs(entries, onProgress);
  openFirstImportedFile(result.writtenPaths);
  notifyImportResult({
    label: containsDirectory ? 'Dropped folder' : 'Dropped files',
    writtenPaths: result.writtenPaths,
    failed: result.failed,
    skipped: result.skipped,
  });

  return result.writtenPaths;
}

async function collectFSEntry(entry, basePath, out) {
  if (entry.isFile) {
    const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
    const fullPath = `${basePath}${entry.name}`;
    if (!shouldSkipPath(fullPath)) {
      out.push({ path: fullPath, file });
    }
  } else if (entry.isDirectory) {
    if (SKIP_SEGMENTS.has(entry.name)) return;
    const reader = entry.createReader();
    const children = await new Promise((res, rej) => reader.readEntries(res, rej));
    for (const child of children) {
      await collectFSEntry(child, nextBase, out);
    }
  }
}
