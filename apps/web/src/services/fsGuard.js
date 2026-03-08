/**
 * @file fsGuard.js
 * @description The FS Authority Enforcement Layer (V3 ADR).
 *
 * Every write that reaches the filesystem MUST pass through this guard.
 * Checks (in order):
 *   1. Path sanitation (no "..", null bytes, reserved names)
 *   2. Module permission check (uses modulePermissions.js)
 *   3. Workspace state check (must be IDLE or COMMITTING)
 *   4. Workspace lock check (must not be locked unless caller is FILE_SYSTEM)
 *
 * If any check fails, throws the appropriate typed FsError.
 * Logs all violations to the console with caller info for debugging.
 */

import { memfs } from './memfsService.js';
import { hasPermission } from './modulePermissions.js';
import { FsInvalidPathError, FsPermissionError, FsLockedError } from './fsErrors.js';

// Paths/names that can never be written to
const RESERVED_NAMES = new Set(['.git', 'node_modules', '.env', '.DS_Store']);

// States in which writes are allowed
const WRITABLE_STATES = new Set(['IDLE', 'COMMITTING']);

/**
 * Assert that a path is valid and safe.
 * @param {string} path
 * @throws {FsInvalidPathError}
 */
function assertValidPath(path) {
  if (!path || typeof path !== 'string') {
    throw new FsInvalidPathError(path, 'Path must be a non-empty string');
  }
  if (!path.startsWith('/')) {
    throw new FsInvalidPathError(path, 'Path must be absolute (start with /)');
  }
  if (path.includes('\0')) {
    throw new FsInvalidPathError(path, 'Path must not contain null bytes');
  }
  if (path.includes('..')) {
    throw new FsInvalidPathError(path, 'Path traversal via ".." is forbidden');
  }
  const segments = path.split('/').filter(Boolean);
  for (const seg of segments) {
    if (RESERVED_NAMES.has(seg)) {
      throw new FsInvalidPathError(path, `Segment "${seg}" is reserved and cannot be written`);
    }
  }
}

/**
 * Assert that a module has write permission.
 * @param {string} moduleId
 * @param {string} path
 * @throws {FsPermissionError}
 */
function assertWritePermission(moduleId, path) {
  if (!hasPermission(moduleId, 'write') && !hasPermission(moduleId, 'write:sandboxed')) {
    console.warn(`[FsGuard] ⛔ Permission denied — module="${moduleId}" path="${path}"`);
    throw new FsPermissionError(path, moduleId);
  }
}

/**
 * Assert that the workspace state allows mutations.
 * @param {string} [moduleId]
 * @throws {FsLockedError}
 */
function assertWritableState(moduleId) {
  const { state, locked } = memfs.workspace;

  if (!WRITABLE_STATES.has(state)) {
    console.warn(`[FsGuard] ⛔ Write blocked — state="${state}" module="${moduleId}"`);
    throw new FsLockedError(state);
  }

  // Only FILE_SYSTEM module (internal) can write while locked (e.g., during COMMITTING)
  if (locked && moduleId !== 'FILE_SYSTEM') {
    console.warn(`[FsGuard] ⛔ Write blocked — workspace is locked. module="${moduleId}"`);
    throw new FsLockedError(state);
  }
}

/**
 * Run all guards for a write operation.
 * @param {string} path
 * @param {string} [moduleId='FILE_SYSTEM']
 */
export function guardWrite(path, moduleId = 'FILE_SYSTEM') {
  assertValidPath(path);
  assertWritePermission(moduleId, path);
  assertWritableState(moduleId);
}

/**
 * Run path validation only (for read operations).
 * @param {string} path
 */
export function guardRead(path) {
  assertValidPath(path);
}

/**
 * Assert that a module has diff (shadow tree) permission.
 * @param {string} moduleId
 * @param {string} path
 */
export function guardDiff(path, moduleId) {
  assertValidPath(path);
  if (!hasPermission(moduleId, 'diff') && !hasPermission(moduleId, 'write')) {
    console.warn(`[FsGuard] ⛔ Diff permission denied — module="${moduleId}" path="${path}"`);
    throw new FsPermissionError(path, moduleId);
  }
}
