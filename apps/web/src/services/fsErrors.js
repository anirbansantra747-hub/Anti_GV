/**
 * @file fsErrors.js
 * @description Typed error taxonomy for the V3 File System.
 * Replaces all raw `new Error()` throws with a closed set of named error classes.
 * Each error carries: code (machine-readable), path (offending path), remedy (UI hint).
 */

// ── Base FS Error ─────────────────────────────────────────────────────────────
export class FsError extends Error {
  /**
   * @param {string} message - Human-readable description
   * @param {string} code    - Machine-readable code (e.g. "FS_NOT_FOUND")
   * @param {string} [path]  - The file/dir path that caused the error
   * @param {string} [remedy] - Hint for the UI on how to recover
   */
  constructor(message, code, path, remedy) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.path = path ?? null;
    this.remedy = remedy ?? null;
    this.fsError = true; // Discriminant flag
  }
}

// ── Specific Error Types ──────────────────────────────────────────────────────

export class FsNotFoundError extends FsError {
  constructor(path) {
    super(
      `No such file or directory: '${path}'`,
      'FS_NOT_FOUND',
      path,
      'Check the path spelling or verify the file exists before accessing.'
    );
  }
}

export class FsPermissionError extends FsError {
  constructor(path, sourceModule) {
    super(
      `Module '${sourceModule ?? 'unknown'}' does not have write permission for '${path}'`,
      'FS_PERMISSION_DENIED',
      path,
      'This module is read-only. Use the DiffService to propose changes via a Shadow Tree.'
    );
  }
}

export class FsLockedError extends FsError {
  constructor(currentState) {
    super(
      `Write rejected — workspace is locked (state: ${currentState})`,
      'FS_LOCKED',
      null,
      'Wait for the current AI mutation to complete or the user to resolve the diff review.'
    );
  }
}

export class FsCorruptionError extends FsError {
  constructor(path, detail) {
    super(
      `Integrity check failed for '${path}': ${detail}`,
      'FS_CORRUPTION',
      path,
      'Reload workspace from the last known-good IndexedDB snapshot or remote backup.'
    );
  }
}

export class FsConflictError extends FsError {
  constructor(localVersion, remoteVersion) {
    super(
      `Remote conflict: local@${localVersion?.slice(0, 8)} ≠ remote@${remoteVersion?.slice(0, 8)}`,
      'FS_CONFLICT',
      null,
      'Open the Conflict Resolver to merge changes before pushing again.'
    );
  }
}

export class FsInvalidPathError extends FsError {
  constructor(path, reason) {
    super(
      `Invalid path '${path}': ${reason}`,
      'FS_INVALID_PATH',
      path,
      'Paths must be absolute, must not contain "..", null bytes, or reserved names.'
    );
  }
}

// ── Type Guard ────────────────────────────────────────────────────────────────
/** @param {unknown} err @returns {err is FsError} */
export function isFsError(err) {
  return err instanceof FsError && err.fsError === true;
}
