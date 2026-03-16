import fs from 'fs/promises';
import path from 'path';
import { getWorkspaceState, isWorkspaceReady as isStateReady } from './workspaceState.js';

// Backend workspace management
let workspaceExplicit = false;

export const getWorkspaceRoot = () => getWorkspaceState().rootPath;
export const isWorkspaceExplicit = () => workspaceExplicit;
export const isWorkspaceReady = () => isStateReady();

/**
 * Changes the current backend workspace root directory dynamically.
 */
export const changeWorkspace = async (newPath) => {
  const resolved = path.resolve(newPath);
  try {
    const stats = await fs.stat(resolved);
    if (!stats.isDirectory()) {
      throw new Error('Provided path is not a directory.');
    }
    // We update the centralized state now
    workspaceExplicit = true;
    return resolved;
  } catch (err) {
    throw new Error(`Failed to change workspace: ${err.message}`);
  }
};

/**
 * Validates and resolves a requested path against the workspaceRoot.
 * Prevents Directory Traversal attacks.
 * @param {string} targetPath - The requested relative or absolute path.
 * @returns {string} The fully resolved, safe absolute path.
 */
export const resolveSafePath = (targetPath) => {
  if (!targetPath) throw new Error('Path cannot be empty');

  const root = getWorkspaceRoot();
  const absoluteRoot = path.resolve(root);

  // path.resolve(root, '/foo') on Windows might jump to the drive root.
  // We strip leading slashes to ensure it's relative to our root.
  const cleanedTarget = targetPath.replace(/^\/+/, '');
  const absoluteTarget = path.resolve(absoluteRoot, cleanedTarget);

  // path.relative returns '' if they are the same, or the steps to get from root to target.
  // If the relative path starts with '..' or is absolute, it tried to escape the root.
  const relative = path.relative(absoluteRoot, absoluteTarget);
  const isTraversal = relative.startsWith('..') || path.isAbsolute(relative);

  if (isTraversal) {
    throw new Error(`Path traversal denied: ${targetPath}`);
  }

  return absoluteTarget;
};

/**
 * Reads a file from the disk
 */
export const readFile = async (targetPath, encoding = 'utf-8') => {
  const safePath = resolveSafePath(targetPath);
  return await fs.readFile(safePath, { encoding });
};

/**
 * Writes content to a file on disk
 */
export const writeFile = async (targetPath, content) => {
  const safePath = resolveSafePath(targetPath);
  // Ensure parent directory exists
  await fs.mkdir(path.dirname(safePath), { recursive: true });
  await fs.writeFile(safePath, content);
};

/**
 * Checks if a path exists
 */
export const exists = async (targetPath) => {
  try {
    const safePath = resolveSafePath(targetPath);
    await fs.access(safePath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Lists directory contents
 */
export const listDir = async (targetPath, opts = {}) => {
  const safePath = resolveSafePath(targetPath);
  const recursive = Boolean(opts.recursive);

  if (!recursive) {
    const dirents = await fs.readdir(safePath, { withFileTypes: true });
    return dirents.map((dirent) => ({
      name: dirent.name,
      type: dirent.isDirectory() ? 'dir' : 'file',
      isDirectory: dirent.isDirectory(),
      path: path.relative(getWorkspaceRoot(), path.join(safePath, dirent.name)).replace(/\\/g, '/'),
    }));
  }

  const items = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (['node_modules', '.git', '.turbo', 'dist', '.cache'].includes(entry.name)) continue;

      const full = path.join(dir, entry.name);
      const rel = path.relative(getWorkspaceRoot(), full).replace(/\\/g, '/');
      const isDirectory = entry.isDirectory();
      items.push({
        name: entry.name,
        type: isDirectory ? 'dir' : 'file',
        isDirectory,
        path: rel,
      });
      if (isDirectory) {
        await walk(full);
      }
    }
  }

  await walk(safePath);
  return items;
};

/**
 * Creates a directory
 */
export const makeDir = async (targetPath) => {
  const safePath = resolveSafePath(targetPath);
  await fs.mkdir(safePath, { recursive: true });
};

/**
 * Deletes a file or directory
 */
export const deletePath = async (targetPath) => {
  const safePath = resolveSafePath(targetPath);
  const stats = await fs.stat(safePath);
  if (stats.isDirectory()) {
    await fs.rm(safePath, { recursive: true, force: true });
  } else {
    await fs.unlink(safePath);
  }
};
