import fs from 'fs/promises';
import path from 'path';

// Get the workspace root from environment, default to two levels up (Anti_GV root)
const WORKSPACE_ROOT = path.resolve(process.cwd(), process.env.WORKSPACE_ROOT || '../../');

/**
 * Validates and resolves a requested path against the WORKSPACE_ROOT.
 * Prevents Directory Traversal attacks.
 * @param {string} targetPath - The requested relative or absolute path.
 * @returns {string} The fully resolved, safe absolute path.
 */
export const resolveSafePath = (targetPath) => {
  if (!targetPath) throw new Error('Path cannot be empty');

  // Resolve the full path
  const resolvedPath = path.resolve(WORKSPACE_ROOT, targetPath.replace(/^\/+/, '')); // strip leading slashes if sent as absolute-like

  // Enforce chroot jail
  if (!resolvedPath.startsWith(WORKSPACE_ROOT)) {
    throw new Error(`Path traversal denied: ${targetPath}`);
  }

  return resolvedPath;
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
 * Lists directory contents (non-recursive by default for standard fs:list)
 */
export const listDir = async (targetPath) => {
  const safePath = resolveSafePath(targetPath);
  const dirents = await fs.readdir(safePath, { withFileTypes: true });

  return dirents.map((dirent) => ({
    name: dirent.name,
    type: dirent.isDirectory() ? 'dir' : 'file',
    path: path.relative(WORKSPACE_ROOT, path.join(safePath, dirent.name)).replace(/\\/g, '/'),
  }));
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
