/* eslint-disable no-unused-vars */
/**
 * @file diffService.js
 * @description The V3 Shadow Tree DiffService.
 *
 * This is the safety layer between the LLM Agent and the authoritative FileSystemService.
 * All AI mutations are staged in an ephemeral "Shadow Tree" (a path-copied clone
 * of the real tree). The user must explicitly APPROVE before anything commits to Tier 1.
 *
 * Transaction Lifecycle (per V3 ADR):
 *   beginTransaction() → applyPatch() → validate() → commit() | rollback()
 *
 * Path-Copying Algorithm: When mutating a path, only ancestors along that path
 * are cloned (O(depth)), not the entire tree (O(n)). Siblings are shared by pointer.
 */

import { bus, Events } from './eventBus.js';
import { memfs } from './memfsService.js';
import { blobStore } from './blobStore.js';
import { snapshotStore } from './snapshotService.js';
import { guardDiff, guardRead } from './fsGuard.js';
import { snapshotGC } from './snapshotGC.js';
import { FsCorruptionError } from './fsErrors.js';

/**
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {import('../models/WorkspaceContracts.js').DirectoryNode} shadowRoot
 * @property {string} preCommitVersion   - rootTreeHash before any patch applied
 * @property {string[]} patchedPaths     - every path that was touched
 * @property {'open'|'committed'|'rolled_back'} status
 */

class DiffService {
  constructor() {
    /** @type {Map<string, Transaction>} */
    this._transactions = new Map();
  }

  // ── Path-Copying Helpers ──────────────────────────────────────────────────

  /**
   * Clone only the nodes along a specific path, sharing siblings by reference.
   * Returns the new root and the target parent node where the mutation can be applied.
   * @param {import('../models/WorkspaceContracts.js').DirectoryNode} root - original Tier 1 root
   * @param {string} filePath - e.g. "/src/app.js"
   * @returns {{ newRoot: DirectoryNode, targetParent: DirectoryNode, fileName: string }}
   */
  _pathCopy(root, filePath) {
    const segments = filePath.split('/').filter(Boolean);
    const fileName = segments.pop();

    // Clone the root exclusively (structural sharing starts here)
    const newRoot = { ...root, children: new Map(root.children) };
    let currentOriginal = root;
    let currentClone = newRoot;

    for (const seg of segments) {
      const origChild = currentOriginal.children.get(seg);
      if (!origChild || origChild.type !== 'dir') {
        // Auto-create missing intermediate directories in the shadow tree
        const newDir = { type: 'dir', id: crypto.randomUUID(), name: seg, children: new Map() };
        currentClone.children.set(seg, newDir);
        currentOriginal = newDir;
        currentClone = newDir;
      } else {
        // Clone only this ancestor node, share all its siblings by pointer
        const cloned = { ...origChild, children: new Map(origChild.children) };
        currentClone.children.set(seg, cloned);
        currentOriginal = origChild;
        currentClone = cloned;
      }
    }

    return { newRoot, targetParent: currentClone, fileName };
  }

  // ── Formal Transaction Lifecycle ──────────────────────────────────────────

  /**
   * Open a new transaction. Creates an ephemeral Shadow Tree.
   * @returns {string} Transaction ID
   */
  beginTransaction() {
    const txId = crypto.randomUUID();
    // Deep-clone the live Tier 1 root to form the Shadow Tree baseline
    const shadowRoot = snapshotStore.cloneTree(memfs.workspace.root);

    /** @type {Transaction} */
    const tx = {
      id: txId,
      shadowRoot,
      preCommitVersion: memfs.workspace.version,
      patchedPaths: [],
      status: 'open',
    };

    this._transactions.set(txId, tx);
    bus.emit(Events.AI_EDIT_INTENT);
    console.log(`[DiffService] Transaction opened: ${txId}`);
    return txId;
  }

  /**
   * Apply a FilePatch to the Shadow Tree (not Tier 1).
   * @param {string} txId
   * @param {import('../models/WorkspaceContracts.js').FilePatch} patch
   * @returns {Promise<void>}
   */
  async applyPatch(txId, patch, moduleId = 'AI_AGENT') {
    guardDiff(patch.path, moduleId);
    const tx = this._getOpenTx(txId);

    const { newRoot, targetParent, fileName } = this._pathCopy(tx.shadowRoot, patch.path);
    tx.shadowRoot = newRoot;

    // Get existing file content (or start fresh)
    let lines = [];
    const existing = targetParent.children.get(fileName);
    if (existing?.type === 'file') {
      try {
        const raw = await blobStore.get(existing.blobId);
        const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
        lines = text.split('\n');
      } catch (_) {
        lines = [];
      }
    }
    // If memfs has a stub (empty blob) and the server sent the actual disk content, use it
    if (lines.join('').length === 0 && patch._baseContent) {
      lines = patch._baseContent.split('\n');
    }

    // Apply each operation in order
    for (const op of patch.operations) {
      if (op.type === 'replace') {
        if (op.search) {
          // Native explicit search/replace
          const searchLines = op.search.split('\n');
          // If Groq includes a trailing newline in the search block, pop it so we don't look for an empty last line
          if (searchLines.length > 0 && searchLines[searchLines.length - 1] === '') {
            searchLines.pop();
          }
          const contentLines = op.content.split('\n');
          if (contentLines.length > 0 && contentLines[contentLines.length - 1] === '') {
            contentLines.pop(); // Similarly pop trailing newline from content
          }

          let found = false;
          for (let i = 0; i <= lines.length - searchLines.length; i++) {
            // Pass 1: exact match
            let exact = true;
            for (let j = 0; j < searchLines.length; j++) {
              if (lines[i + j] !== searchLines[j]) {
                exact = false;
                break;
              }
            }
            if (exact) {
              lines.splice(i, searchLines.length, ...contentLines);
              found = true;
              break;
            }
            // Pass 2: trimmed match — handles LLM whitespace inconsistencies
            let trimmed = true;
            for (let j = 0; j < searchLines.length; j++) {
              if ((lines[i + j] ?? '').trim() !== searchLines[j].trim()) {
                trimmed = false;
                break;
              }
            }
            if (trimmed) {
              lines.splice(i, searchLines.length, ...contentLines);
              found = true;
              break;
            }
          }

          if (!found) {
            console.warn(
              '[DiffService] Search block not found (exact or trimmed):',
              op.search?.slice(0, 80)
            );
          }
        } else {
          // Legacy line-based replace
          const start = (op.startLine ?? 1) - 1;
          const end = (op.endLine ?? start + 1) - 1;
          lines.splice(start, end - start + 1, ...op.content.split('\n'));
        }
      } else if (op.type === 'insert') {
        const at = (op.startLine ?? lines.length + 1) - 1;
        lines.splice(at, 0, ...op.content.split('\n'));
      } else if (op.type === 'delete') {
        // Legacy line-based delete
        const start = (op.startLine ?? 1) - 1;
        const end = (op.endLine ?? start) - 1;
        lines.splice(start, end - start + 1);
      }
    }

    const newContent = lines.join('\n');
    const { blobId, hash } = await blobStore.put(newContent);

    targetParent.children.set(fileName, {
      type: 'file',
      id: existing?.id ?? crypto.randomUUID(),
      name: fileName,
      hash: `FILE|${hash}`,
      blobId,
      binary: false,
    });

    if (!tx.patchedPaths.includes(patch.path)) {
      tx.patchedPaths.push(patch.path);
    }

    if (memfs.workspace.state === 'AI_PENDING') {
      bus.emit(Events.DIFF_READY);
    }

    console.log(`[DiffService] Patch applied to shadow: ${patch.path}`);
  }

  /**
   * Validate the shadow tree — ensure all patched files still have resolvable blobIds.
   * @param {string} txId
   * @returns {boolean}
   */
  validate(txId) {
    const tx = this._getOpenTx(txId);
    for (const filePath of tx.patchedPaths) {
      const segments = filePath.split('/').filter(Boolean);
      let node = tx.shadowRoot;
      for (const seg of segments) {
        node = node.children?.get(seg);
        if (!node) {
          console.error(`[DiffService] Validation failed — missing path: ${filePath}`);
          return false;
        }
      }
      if (node.type !== 'file' || !blobStore.exists(node.blobId)) {
        console.warn(`[DiffService] Validation Warn — blob missing for: ${filePath}. Removing from patch.`);
        // Remove from patchedPaths so we don't try to sync a non-existent file
        tx.patchedPaths = tx.patchedPaths.filter(p => p !== filePath);
        // We do *not* return false here so the transaction can still commit other valid files.
        continue;
      }
    }
    console.log(`[DiffService] Transaction ${txId} validated ✅`);
    return true;
  }

  /**
   * Commit the shadow tree to Tier 1. Sets new workspace version from rootTreeHash.
   * @param {string} txId
   * @returns {Promise<void>}
   */
  async commit(txId) {
    const tx = this._getOpenTx(txId);

    if (!this.validate(txId)) {
      throw new Error(`[DiffService] Cannot commit tx ${txId} — validation failed.`);
    }

    // Replace live Tier 1 root with the committed shadow root
    memfs.workspace.root = tx.shadowRoot;

    // Compute and update the new root hash (version)
    const newVersion = await snapshotStore.computeTreeHash(tx.shadowRoot);
    memfs.workspace.version = newVersion;
    memfs.workspace.state = 'IDLE';
    memfs.workspace.locked = false;

    tx.status = 'committed';
    this._transactions.delete(txId);

    // Register committed tree with snapshot GC (enforces ≤20 cap + blob eviction)
    snapshotGC.register({
      id: txId,
      rootTreeHash: newVersion,
      tree: snapshotStore.cloneTree(memfs.workspace.root),
    });

    // Notify all listeners: tree changed
    bus.emit(Events.FS_MUTATED, { workspaceId: memfs.workspace.id, source: 'commit' });
    console.log(
      `[DiffService] Transaction ${txId} committed. New version: ${newVersion.slice(0, 8)}…`
    );
  }

  /**
   * Rollback — discard the shadow tree entirely.
   * @param {string} txId
   */
  rollback(txId) {
    const tx = this._transactions.get(txId);
    if (!tx) return;
    tx.status = 'rolled_back';
    this._transactions.delete(txId);
    console.log(`[DiffService] Transaction ${txId} rolled back.`);
  }

  /**
   * Discard specific paths from the shadow tree by restoring them from Tier 1.
   * @param {string} txId
   * @param {string[]} paths
   */
  discardPaths(txId, paths = []) {
    const tx = this._getOpenTx(txId);
    for (const filePath of paths) {
      const { newRoot, targetParent, fileName } = this._pathCopy(tx.shadowRoot, filePath);
      tx.shadowRoot = newRoot;

      const originalNode = this._getNode(memfs.workspace.root, filePath);
      if (!originalNode) {
        targetParent.children.delete(fileName);
      } else {
        targetParent.children.set(fileName, snapshotStore.cloneTree(originalNode));
      }

      tx.patchedPaths = tx.patchedPaths.filter((p) => p !== filePath);
    }
  }

  /**
   * Get a diff-friendly representation between Tier 1 and the shadow tree for a given path.
   * Returns { original: string, proposed: string }.
   * @param {string} txId
   * @param {string} filePath
   * @returns {Promise<{ original: string, proposed: string }>}
   */
  async getDiff(txId, filePath) {
    guardRead(filePath);
    const tx = this._getOpenTx(txId);

    const getContent = async (root, path) => {
      const segments = path.split('/').filter(Boolean);
      let node = root;
      for (const seg of segments) {
        node = node.children?.get(seg);
        if (!node) return '';
      }
      if (node.type !== 'file') return '';
      try {
        const raw = await blobStore.get(node.blobId);
        return typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      } catch {
        return '';
      }
    };

    const [original, proposed] = await Promise.all([
      getContent(memfs.workspace.root, filePath),
      getContent(tx.shadowRoot, filePath),
    ]);

    return { original, proposed };
  }

  // ── Internal Helpers ──────────────────────────────────────────────────────

  _getOpenTx(txId) {
    const tx = this._transactions.get(txId);
    if (!tx || tx.status !== 'open') {
      throw new FsCorruptionError(
        null,
        `No open transaction found for id: ${txId} (status: ${tx?.status ?? 'not_found'})`
      );
    }
    return tx;
  }

  _getNode(root, filePath) {
    const segments = filePath.split('/').filter(Boolean);
    let node = root;
    for (const seg of segments) {
      node = node.children?.get(seg);
      if (!node) return null;
    }
    return node;
  }

  /** Expose active transactions (read-only) for DiffViewer UI */
  getTransaction(txId) {
    return this._transactions.get(txId) ?? null;
  }
}

export const diffService = new DiffService();
