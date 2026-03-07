/**
 * @file snapshotService.js
 * @description Generates Merkle-hashes for immutable workspace versions.
 * Supports O(Depth) bottom-up hashing required by the V3 Specification.
 */

class SnapshotService {
  /**
   * Generates a structural Merkle hash for a DirectoryNode.
   * Format: SHA256("DIR|" + sorted(childName + "|" + childHash).join("|"))
   * @param {import('../models/WorkspaceContracts.js').DirectoryNode} dirNode
   * @returns {Promise<string>}
   */
  async computeDirHash(dirNode) {
    if (dirNode.children.size === 0) {
      return this._hashString(`DIR|empty`);
    }

    const childEntries = Array.from(dirNode.children.entries())
      .map(([name, node]) => `${name}|${node.type === 'file' ? node.hash : node.hash}`)
      .sort(); // Sort guarantees structural consistency

    const payload = `DIR|` + childEntries.join('|');
    return this._hashString(payload);
  }

  /**
   * @param {string} payload
   * @private
   */
  async _hashString(payload) {
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Clones a tree structure recursively using path-copying.
   * This is foundational for the Phase 3 Shadow Trees (DiffService).
   * @param {import('../models/WorkspaceContracts.js').DirectoryNode} node
   */
  cloneTree(node) {
    if (node.type === 'file') {
      return { ...node };
    }
    const clonedDir = {
      type: 'dir',
      id: node.id,
      name: node.name,
      children: new Map(),
    };
    for (const [key, val] of node.children) {
      clonedDir.children.set(key, this.cloneTree(val));
    }
    return clonedDir;
  }
}

export const snapshotStore = new SnapshotService();
