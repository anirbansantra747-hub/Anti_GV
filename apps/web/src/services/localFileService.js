/**
 * @file localFileService.js
 * @description Handles importing files and folders from the local OS filesystem
 * into the Anti_GV in-memory workspace (Tier 1).
 *
 * Three ingestion strategies:
 *  1. File System Access API — showOpenFilePicker / showDirectoryPicker (Chrome/Edge)
 *  2. Hidden <input type="file"> fallback (Firefox / Safari)
 *  3. Drag-and-drop DataTransferItemList (any browser)
 *
 * All strategies funnel through writeFilesToMemfs() which calls fileSystemAPI.writeFile().
 */

import { fileSystemAPI } from './fileSystemAPI.js';
import { memfs } from './memfsService.js';
import { snapshotStore } from './snapshotService.js';
import { bus, Events } from './eventBus.js';
import { recordSnapshot } from '../components/History/HistoryDrawer.jsx';

// ── Constants ──────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB — skip files larger than this

// Extensions we will treat as binary (skip text decoding)
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
  const ext = filename.split('.').pop().toLowerCase();
  return BINARY_EXTS.has(ext);
}

// ── Core writer ────────────────────────────────────────────────────────────────

/**
 * Write an array of { path, file } pairs into the workspace via fileSystemAPI.
 * @param {Array<{ path: string, file: File }>} entries
 * @param {(progress: { done: number, total: number, current: string }) => void} [onProgress]
 */
export async function writeFilesToMemfs(entries, onProgress) {
  let done = 0;
  for (const { path, file } of entries) {
    if (file.size > MAX_FILE_SIZE) {
      console.warn(
        `[LocalFS] Skipping large file (${(file.size / 1024 / 1024).toFixed(1)} MB): ${path}`
      );
      done++;
      continue;
    }

    try {
      let content;
      if (isBinaryExt(file.name)) {
        content = await file.arrayBuffer();
      } else {
        content = await file.text();
      }

      await fileSystemAPI.writeFile(path, content, { sourceModule: 'UI', silent: true });
    } catch (err) {
      console.error(`[LocalFS] Failed to write ${path}:`, err);
    }

    done++;
    onProgress?.({ done, total: entries.length, current: path });
  }

  if (entries.length > 0) {
    try {
      const newHash = await snapshotStore.computeDirHash(memfs.workspace.root);
      memfs.workspace.version = newHash;
      const fileCount = memfs.readdir('/', { recursive: true }).length;
      recordSnapshot(newHash, fileCount, `Batch imported ${entries.length} files`);
    } catch {
      /* ignore */
    }
    bus.emit(Events.FS_MUTATED, { workspaceId: memfs.workspace.id, path: null });
  }
}

// ── Strategy 1: File System Access API ────────────────────────────────────────

export const supportsFileSystemAccess =
  typeof window !== 'undefined' && 'showOpenFilePicker' in window;

export const supportsDirectoryPicker =
  typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/**
 * Open one or more files using showOpenFilePicker.
 * @param {(progress: object) => void} [onProgress]
 */
export async function openFilesViaFSA(onProgress) {
  if (!supportsFileSystemAccess) throw new Error('File System Access API not supported');

  const handles = await window.showOpenFilePicker({ multiple: true });
  const entries = await Promise.all(
    handles.map(async (h) => ({ path: `/${h.name}`, file: await h.getFile() }))
  );

  await writeFilesToMemfs(entries, onProgress);
  return entries.map((e) => e.path);
}

/**
 * Open a directory recursively using showDirectoryPicker.
 * @param {(progress: object) => void} [onProgress]
 */
export async function openDirectoryViaFSA(onProgress) {
  if (!supportsDirectoryPicker) throw new Error('Directory Picker API not supported');

  const dirHandle = await window.showDirectoryPicker({ mode: 'read' });
  const entries = await collectDirectoryEntries(dirHandle, `/${dirHandle.name}`);
  await writeFilesToMemfs(entries, onProgress);
  return dirHandle.name;
}

async function collectDirectoryEntries(dirHandle, basePath) {
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const fullPath = `${basePath}/${name}`;
    if (handle.kind === 'file') {
      entries.push({ path: fullPath, file: await handle.getFile() });
    } else if (handle.kind === 'directory') {
      // Skip noisy dirs
      if (['node_modules', '.git', '.turbo', 'dist', '.cache'].includes(name)) continue;
      const sub = await collectDirectoryEntries(handle, fullPath);
      entries.push(...sub);
    }
  }
  return entries;
}

// ── Strategy 2: Hidden <input type="file"> fallback ───────────────────────────

/**
 * Open files via a hidden <input type="file"> (Firefox/Safari fallback).
 * @param {{ multiple?: boolean, directory?: boolean }} opts
 * @param {(progress: object) => void} [onProgress]
 * @returns {Promise<string[]>} paths written
 */
export function openFilesViaInput(opts = {}, onProgress) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = opts.multiple !== false;
    if (opts.directory) {
      input.webkitdirectory = true;
      input.mozdirectory = true;
    }

    input.onchange = async () => {
      const files = Array.from(input.files ?? []);
      if (!files.length) return resolve([]);

      const entries = files.map((f) => {
        // webkitRelativePath gives us "dirName/subdir/file.txt"
        const rel = f.webkitRelativePath || f.name;
        return { path: `/${rel}`, file: f };
      });

      await writeFilesToMemfs(entries, onProgress);
      resolve(entries.map((e) => e.path));
    };

    input.onerror = reject;
    input.click();
  });
}

// ── Strategy 3: Drag-and-drop ─────────────────────────────────────────────────

/**
 * Process a DragEvent and write all dropped files into memfs.
 * Handles both plain files and directories (via DataTransferItem.webkitGetAsEntry).
 * @param {DragEvent} event
 * @param {(progress: object) => void} [onProgress]
 * @returns {Promise<string[]>} paths written
 */
export async function handleDrop(event, onProgress) {
  event.preventDefault();

  const items = Array.from(event.dataTransfer?.items ?? []);
  const entries = [];

  for (const item of items) {
    if (item.kind !== 'file') continue;

    const fsEntry = item.webkitGetAsEntry?.();
    if (fsEntry) {
      await collectFSEntry(fsEntry, '/', entries);
    } else {
      const file = item.getAsFile();
      if (file) entries.push({ path: `/${file.name}`, file });
    }
  }

  await writeFilesToMemfs(entries, onProgress);
  return entries.map((e) => e.path);
}

async function collectFSEntry(entry, basePath, out) {
  if (entry.isFile) {
    const file = await new Promise((res, rej) => entry.file(res, rej));
    out.push({ path: `${basePath}${entry.name}`, file });
  } else if (entry.isDirectory) {
    if (['node_modules', '.git', '.turbo', 'dist', '.cache'].includes(entry.name)) return;
    const reader = entry.createReader();
    const children = await new Promise((res, rej) => reader.readEntries(res, rej));
    for (const child of children) {
      await collectFSEntry(child, `${basePath}${entry.name}/`, out);
    }
  }
}
