import { useWorkspaceAccessStore } from '../stores/workspaceAccessStore.js';

const fileHandleMap = new Map();
let rootDirectoryHandle = null;

function normalizePath(path) {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

async function ensureWritePermission(handle) {
  if (!handle?.queryPermission || !handle?.requestPermission) return true;

  const query = await handle.queryPermission({ mode: 'readwrite' });
  if (query === 'granted') return true;

  const request = await handle.requestPermission({ mode: 'readwrite' });
  return request === 'granted';
}

async function resolveHandleFromDirectory(path) {
  if (!rootDirectoryHandle) return null;

  const segments = normalizePath(path).split('/').filter(Boolean);
  if (!segments.length) return null;

  let directory = rootDirectoryHandle;
  for (let i = 0; i < segments.length - 1; i++) {
    directory = await directory.getDirectoryHandle(segments[i], { create: true });
  }

  return directory.getFileHandle(segments[segments.length - 1], { create: true });
}

export const workspaceAccessService = {
  clear(source) {
    fileHandleMap.clear();
    rootDirectoryHandle = null;

    if (source) {
      useWorkspaceAccessStore.getState().setSource(source);
    } else {
      useWorkspaceAccessStore.getState().resetSource();
    }
  },

  linkFiles(entries, label = 'Linked files') {
    if (rootDirectoryHandle) {
      fileHandleMap.clear();
      rootDirectoryHandle = null;
    }

    entries.forEach(({ path, handle }) => {
      if (handle) fileHandleMap.set(normalizePath(path), handle);
    });

    useWorkspaceAccessStore.getState().setSource({
      mode: 'files',
      label,
      description: 'Ctrl+S saves back to the same files you opened.',
    });
  },

  linkDirectory(rootHandle, entries = []) {
    fileHandleMap.clear();
    rootDirectoryHandle = rootHandle;

    entries.forEach(({ path, handle }) => {
      if (handle) fileHandleMap.set(normalizePath(path), handle);
    });

    useWorkspaceAccessStore.getState().setSource({
      mode: 'directory',
      label: rootHandle?.name || 'Linked folder',
      description: 'Files save directly into the opened folder, including AI edits.',
    });
  },

  markImported(label = 'Imported files') {
    fileHandleMap.clear();
    rootDirectoryHandle = null;

    useWorkspaceAccessStore.getState().setSource({
      mode: 'memory',
      label,
      description: 'Imported copies are editable, but not linked back to disk for direct save.',
    });
  },

  async saveFile(path, content, socket = null) {
    const normalizedPath = normalizePath(path);
    let handle = fileHandleMap.get(normalizedPath) ?? null;

    if (!handle && rootDirectoryHandle) {
      handle = await resolveHandleFromDirectory(normalizedPath);
      if (handle) fileHandleMap.set(normalizedPath, handle);
    }

    if (handle) {
      const granted = await ensureWritePermission(handle);
      if (!granted) {
        throw new Error(`Write permission denied for ${normalizedPath}`);
      }

      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
      return { mode: 'direct', path: normalizedPath };
    }

    if (!socket) {
      throw new Error(`No save target is linked for ${normalizedPath}`);
    }

    await new Promise((resolve, reject) => {
      socket.emit('fs:write', { path: normalizedPath, content }, (response) => {
        if (response?.success) {
          resolve();
          return;
        }
        reject(new Error(response?.error || `Failed to save ${normalizedPath}`));
      });
    });

    return { mode: 'backend', path: normalizedPath };
  },

  describeTarget(path) {
    const normalizedPath = normalizePath(path);
    const { source } = useWorkspaceAccessStore.getState();

    if (fileHandleMap.has(normalizedPath)) {
      return {
        title: normalizedPath.split('/').pop(),
        detail: 'Saving directly to the opened file.',
      };
    }

    if (rootDirectoryHandle) {
      const relativePath = normalizedPath.replace(/^\//, '');
      return {
        title: `${source.label}/${relativePath}`,
        detail: 'Saving directly into the opened folder.',
      };
    }

    if (source.mode === 'memory') {
      return {
        title: source.label,
        detail: source.description,
      };
    }

    return {
      title: normalizedPath,
      detail: 'Saving through the backend workspace.',
    };
  },
};
