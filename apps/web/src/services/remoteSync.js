/**
 * @file remoteSync.js
 * @description Tier 3 differential remote sync.
 *
 * Strategy (V3 ADR):
 *  - Only pushes blobs whose hash doesn't already exist on the server (differential).
 *  - Compares local version (rootTreeHash) vs remote version before pushing.
 *  - If remote.version !== local.version → emits CONFLICT_DETECTED.
 *  - Remote endpoint is the Anti_GV backend REST API (workspace service).
 *
 * Call remoteSync.push() after a commit (manual or Ctrl+S trigger).
 * Call remoteSync.fetch() on first load if IDB cache is missing / stale.
 */

import { blobStore } from './blobStore.js';
import { memfs } from './memfsService.js';
import { bus, Events } from './eventBus.js';

// Base URL — override via env in production
const API_BASE = import.meta.env?.VITE_API_URL ?? 'http://localhost:3001';

class RemoteSync {
  constructor() {
    /** @type {string | null} JWT bearer token (set by auth module) */
    this.authToken = null;
  }

  /** Set auth token (called by auth service after login) */
  setToken(token) {
    this.authToken = token;
  }

  /**
   * Push local Tier 1 state to Tier 3 (server).
   * Differential: only sends blobs the server does not already have.
   * @returns {Promise<void>}
   */
  async push() {
    const { id: workspaceId, version: localVersion } = memfs.workspace;

    // 1. Fetch the remote version hash
    const remoteVersion = await this._getRemoteVersion(workspaceId);

    // 2. Conflict check
    if (remoteVersion && remoteVersion !== localVersion) {
      console.warn(
        '[RemoteSync] Conflict detected! remote:',
        remoteVersion,
        'local:',
        localVersion
      );
      bus.emit(Events.CONFLICT_DETECTED, { localVersion, remoteVersion });
      return;
    }

    // 3. Build flat file map
    const files = this._flattenTree(memfs.workspace.root);

    // 4. Ask server which blobs it already has (differential)
    const allBlobIds = [...new Set(Object.values(files).map((f) => f.blobId))];
    const missingBlobIds = await this._getMissingBlobIds(workspaceId, allBlobIds);

    // 5. Upload only missing blobs
    const blobs = {};
    for (const blobId of missingBlobIds) {
      if (blobStore.exists(blobId)) {
        const content = await blobStore.get(blobId);
        blobs[blobId] = typeof content === 'string' ? content : Array.from(new Uint8Array(content));
      }
    }

    // 6. Push the full workspace snapshot
    const payload = {
      workspaceId,
      version: localVersion,
      files,
      blobs,
      pushedAt: Date.now(),
    };

    const res = await this._fetch(`/api/workspace/${workspaceId}/sync`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`[RemoteSync] Push failed: ${res.status} ${res.statusText}`);
    }

    console.log(
      `[RemoteSync] ✅ Pushed ${Object.keys(files).length} files, ${missingBlobIds.length} new blobs.`
    );
  }

  /**
   * Fetch Tier 3 snapshot and write it into the in-memory Tier 1 map.
   * Used when local IDB is empty/stale.
   * @param {string} workspaceId
   * @returns {Promise<boolean>} true if successful
   */
  async fetch(workspaceId) {
    try {
      const res = await this._fetch(`/api/workspace/${workspaceId}/snapshot`);
      if (!res.ok) return false;

      const snapshot = await res.json();
      if (!snapshot?.files || !snapshot?.blobs) return false;

      // Populate blob store
      for (const [blobId, content] of Object.entries(snapshot.blobs)) {
        if (!blobStore.exists(blobId)) {
          const data = Array.isArray(content) ? new Uint8Array(content).buffer : content;
          blobStore.blobs.set(blobId, data);
        }
      }

      // Rebuild tree (reuse crashRecovery logic — inline here for independence)
      const root = this._rebuildTree(snapshot.files);
      memfs.workspace.root = root;
      memfs.workspace.id = workspaceId;
      memfs.workspace.version = snapshot.version;
      memfs.workspace.state = 'IDLE';

      memfs._triggerWorkspaceUpdate();
      console.log(
        `[RemoteSync] ✅ Fetched ${Object.keys(snapshot.files).length} files from Tier 3.`
      );
      return true;
    } catch (err) {
      console.error('[RemoteSync] Fetch failed:', err);
      return false;
    }
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  async _getRemoteVersion(workspaceId) {
    try {
      const res = await this._fetch(`/api/workspace/${workspaceId}/version`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.version ?? null;
    } catch {
      return null;
    }
  }

  async _getMissingBlobIds(workspaceId, blobIds) {
    try {
      const res = await this._fetch(`/api/workspace/${workspaceId}/blobs/diff`, {
        method: 'POST',
        body: JSON.stringify({ blobIds }),
      });
      if (!res.ok) return blobIds; // Fallback: upload everything
      const data = await res.json();
      return data.missing ?? blobIds;
    } catch {
      return blobIds;
    }
  }

  _fetch(path, options = {}) {
    return fetch(`${API_BASE}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {}),
      },
      ...options,
    });
  }

  _flattenTree(node, currentPath = '', out = {}) {
    for (const [name, child] of node.children) {
      const fullPath = `${currentPath}/${name}`;
      if (child.type === 'file') {
        out[fullPath] = { hash: child.hash, blobId: child.blobId, binary: child.binary };
      } else {
        this._flattenTree(child, fullPath, out);
      }
    }
    return out;
  }

  _rebuildTree(files) {
    const root = { type: 'dir', id: 'root', name: '/', children: new Map() };
    for (const [fullPath, meta] of Object.entries(files)) {
      const segments = fullPath.split('/').filter(Boolean);
      let current = root;
      for (let i = 0; i < segments.length - 1; i++) {
        const seg = segments[i];
        if (!current.children.has(seg)) {
          current.children.set(seg, {
            type: 'dir',
            id: crypto.randomUUID(),
            name: seg,
            children: new Map(),
          });
        }
        current = current.children.get(seg);
      }
      const fileName = segments[segments.length - 1];
      current.children.set(fileName, {
        type: 'file',
        id: crypto.randomUUID(),
        name: fileName,
        hash: meta.hash,
        blobId: meta.blobId,
        binary: meta.binary ?? false,
      });
    }
    return root;
  }
}

export const remoteSync = new RemoteSync();
