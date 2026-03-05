/**
 * @file WorkspaceContracts.js
 * @description Core structural contracts and explicit state formats for the V3 Workspace Architecture.
 * This defines the Hash-as-Identity mechanics and formal transaction structures.
 */

// Explicit Closed State Machine for Workspace
export const WorkspaceState = {
  IDLE: 'IDLE',
  AI_PENDING: 'AI_PENDING',
  DIFF_REVIEW: 'DIFF_REVIEW',
  COMMITTING: 'COMMITTING',
  CONFLICT: 'CONFLICT',
  ERROR: 'ERROR'
};

/**
 * @typedef {string} NodeId
 */

/**
 * @typedef {string} FileHash
 */

/**
 * Represents the entire state of a Workspace project.
 * @typedef {Object} Workspace
 * @property {string} id - Unique identifier for the workspace.
 * @property {string} version - Content-addressed rootTreeHash explicitly defining this version.
 * @property {string} state - Current lock/mutation state (from WorkspaceState).
 * @property {DirectoryNode} root - The root directory of the workspace.
 * @property {boolean} locked - Multi-tab write-lock ownership flag.
 */

/**
 * Represents a Directory in the File System.
 * @typedef {Object} DirectoryNode
 * @property {'dir'} type
 * @property {NodeId} id
 * @property {string} name
 * @property {Map<string, FileNode | DirectoryNode>} children - Map keyed by child name.
 */

/**
 * Represents a File in the File System.
 * Immutable: Content lives separately in the BlobStore.
 * @typedef {Object} FileNode
 * @property {'file'} type
 * @property {NodeId} id
 * @property {string} name
 * @property {FileHash} hash - Identity: SHA256("FILE|" + blobId)
 * @property {string} blobId - Pointer to content, strictly blobId = SHA256(content)
 * @property {boolean} binary - If >2MB: store blobId only, stream hash, display 'Large File View'
 */

/**
 * Content Storage interface for deduplication.
 * @interface BlobStore
 */
export const BlobStoreInterface = {
  /**
   * @param {string | ArrayBuffer} content
   * @returns {{ blobId: string, hash: string }}
   */
  put: (content) => { throw new Error('Not implemented'); },

  /**
   * @param {string} blobId
   * @returns {Promise<ArrayBuffer | string>}
   */
  get: (blobId) => { throw new Error('Not implemented'); },

  /**
   * @param {string} hash
   * @returns {boolean}
   */
  exists: (hash) => { throw new Error('Not implemented'); }
};

/**
 * Formal Transaction Lifecycle for modifying the filesystem cleanly via Shadow Trees.
 * @interface FileSystemTransaction
 */
export const FileSystemTransactionInterface = {
  /**
   * @returns {string} Transaction ID
   */
  beginTransaction: () => { throw new Error('Not implemented'); },

  /**
   * @param {string} txId
   * @param {FilePatch} patch
   */
  applyPatch: (txId, patch) => { throw new Error('Not implemented'); },

  /**
   * @param {string} txId
   * @returns {boolean} True if structurally valid
   */
  validate: (txId) => { throw new Error('Not implemented'); },

  /**
   * Commit the transaction, updating the version rootTreeHash.
   * @param {string} txId
   */
  commit: (txId) => { throw new Error('Not implemented'); },

  /**
   * Cancel and discard the Shadow Tree.
   * @param {string} txId
   */
  rollback: (txId) => { throw new Error('Not implemented'); }
};

/**
 * @typedef {Object} FilePatch
 * @property {string} path
 * @property {Array<{type: 'replace'|'insert'|'delete', startLine?: number, endLine?: number, content: string}>} operations
 */
