/**
 * @file snapshotGC.js
 * @description Snapshot Garbage Collector — enforces the max-20 ephemeral snapshot
 * policy and evicts orphaned blobs from the BlobStore after commits.
 *
 * V3 Spec: Ephemeral snapshots are capped at 20 for AI undos. Volatile.
 * After eviction, blobs not referenced by any remaining snapshot are purged.
 */

import { blobStore } from './blobStore.js';

const MAX_SNAPSHOTS = 20;

class SnapshotGC {
  constructor() {
    /**
     * Ordered list of retained snapshots (newest last).
     * @type {Array<{ id: string, rootTreeHash: string, tree: import('../models/WorkspaceContracts.js').DirectoryNode, timestamp: number }>}
     */
    this.snapshots = [];
  }

  /**
   * Register a new snapshot. Evicts oldest if over cap.
   * @param {{ id: string, rootTreeHash: string, tree: import('../models/WorkspaceContracts.js').DirectoryNode }} snapshot
   */
  register(snapshot) {
    this.snapshots.push({ ...snapshot, timestamp: Date.now() });

    if (this.snapshots.length > MAX_SNAPSHOTS) {
      const evicted = this.snapshots.splice(0, this.snapshots.length - MAX_SNAPSHOTS);
      console.log(`[SnapshotGC] Evicted ${evicted.length} old snapshot(s).`);
      this._collectOrphanedBlobs();
    }
  }

  /**
   * Remove a specific snapshot by id.
   * @param {string} snapshotId
   */
  release(snapshotId) {
    const before = this.snapshots.length;
    this.snapshots = this.snapshots.filter((s) => s.id !== snapshotId);
    if (this.snapshots.length < before) {
      this._collectOrphanedBlobs();
    }
  }

  /** Clear all snapshots (call on workspace reset). */
  clear() {
    this.snapshots = [];
    console.log('[SnapshotGC] All snapshots cleared.');
  }

  /**
   * Collect all blobIds referenced by any currently retained snapshot.
   * Removes blobs from the BlobStore that are no longer referenced.
   * @private
   */
  _collectOrphanedBlobs() {
    const referencedBlobIds = new Set();

    for (const snap of this.snapshots) {
      this._walkTree(snap.tree, referencedBlobIds);
    }

    let collected = 0;
    for (const blobId of blobStore.blobs.keys()) {
      if (!referencedBlobIds.has(blobId)) {
        blobStore.blobs.delete(blobId);
        collected++;
      }
    }

    if (collected > 0) {
      console.log(`[SnapshotGC] Collected ${collected} orphaned blob(s).`);
    }
  }

  /**
   * Recursively collect all blobIds from a tree.
   * @param {import('../models/WorkspaceContracts.js').DirectoryNode | import('../models/WorkspaceContracts.js').FileNode} node
   * @param {Set<string>} out
   * @private
   */
  _walkTree(node, out) {
    if (!node) return;
    if (node.type === 'file') {
      if (node.blobId) out.add(node.blobId);
      return;
    }
    if (node.children) {
      for (const child of node.children.values()) {
        this._walkTree(child, out);
      }
    }
  }

  /** How many snapshots are currently retained. */
  get size() {
    return this.snapshots.length;
  }
}

export const snapshotGC = new SnapshotGC();
