/**
 * @file modulePermissions.js
 * @description Static registry declaring what each module is allowed to do on the filesystem.
 * Checked by fsGuard.js on every write intent tagged with a sourceModule identifier.
 */

/**
 * Permission levels:
 *  'read'            - Can call readFile, listFiles, existsFile
 *  'write'           - Can call writeFile, mkdir, deleteFile (full authority)
 *  'diff'            - Can open a DiffService transaction (shadow writes only)
 *  'write:sandboxed' - Can write ONLY to a scoped workspace sandbox path
 */
export const MODULE_PERMISSIONS = {
  FILE_SYSTEM: ['read', 'write', 'diff'], // Internal — full authority
  AI_AGENT: ['read', 'diff'], // Can READ + propose patches via Shadow Tree only
  CODE_RUNNER: ['read'], // Read-only: reads files to execute them
  LEARNING_MODE: ['read', 'write:sandboxed'], // Can write to a sandboxed exercise path
  RAG_INDEXER: ['read'], // Read-only: indexes files for ChromaDB
  UI: ['read', 'write'], // Direct user interaction = full write
};

/**
 * Check if a module has a specific permission.
 * @param {string} moduleId - Key from MODULE_PERMISSIONS
 * @param {'read'|'write'|'diff'|'write:sandboxed'} permission
 * @returns {boolean}
 */
export function hasPermission(moduleId, permission) {
  const perms = MODULE_PERMISSIONS[moduleId] ?? [];
  if (perms.includes(permission)) return true;
  // 'write' implies 'write:sandboxed'
  if (permission === 'write:sandboxed' && perms.includes('write')) return true;
  return false;
}
