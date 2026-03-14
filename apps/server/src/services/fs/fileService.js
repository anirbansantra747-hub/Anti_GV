import fs from 'fs/promises';
import path from 'path';

// Get the workspace root from environment, default to two levels up (Anti_GV root)
let workspaceRoot = path.resolve(process.cwd(), process.env.WORKSPACE_ROOT || '../../');

export const getWorkspaceRoot = () => workspaceRoot;

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
    workspaceRoot = resolved;
    return workspaceRoot;
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

  // Resolve the full path
  const resolvedPath = path.resolve(workspaceRoot, targetPath.replace(/^\/+/, '')); // strip leading slashes if sent as absolute-like

  // Enforce chroot jail
  if (!resolvedPath.startsWith(workspaceRoot)) {
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
 * Lists directory contents
 */
export const listDir = async (targetPath, recursive = false) => {
  const safePath = resolveSafePath(targetPath);

  if (!recursive) {
    const dirents = await fs.readdir(safePath, { withFileTypes: true });
    return dirents.map((dirent) => ({
      name: dirent.name,
      type: dirent.isDirectory() ? 'dir' : 'file',
      path: path.relative(workspaceRoot, path.join(safePath, dirent.name)).replace(/\\/g, '/'),
    }));
  }

  const results = [];
  const walk = async (currentPath) => {
    const dirents = await fs.readdir(currentPath, { withFileTypes: true });
    for (const dirent of dirents) {
      if (['node_modules', '.git', '.turbo', 'dist', '.cache'].includes(dirent.name)) continue;

      const fullPath = path.join(currentPath, dirent.name);
      results.push({
        name: dirent.name,
        type: dirent.isDirectory() ? 'dir' : 'file',
        path: path.relative(workspaceRoot, fullPath).replace(/\\/g, '/'),
      });

      if (dirent.isDirectory()) {
        await walk(fullPath);
      }
    }
  };

  await walk(safePath);
  return results;
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
