/**
 * @file blobStore.js
 * @description In-memory Content Deduplication store for the File System.
 * Every blob is uniquely identified by its SHA-256 hash.
 *
 * Features:
 *  - Reference counting  — tracks how many FileNodes point to each blob
 *  - Size cap            — triggers GC when total stored bytes exceeds MAX_TOTAL_BYTES
 *  - gc()                — sweeps zero-ref blobs to reclaim memory
 */

/** @constant {number} 100 MB total blob budget */
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

class BlobStore {
  constructor() {
    /** @type {Map<string, ArrayBuffer | string>} */
    this.blobs = new Map();

    /** @type {Map<string, number>} — reference counts per blobId */
    this._refCounts = new Map();

    /** @type {number} — approximate total bytes stored */
    this._totalBytes = 0;
  }

  /**
   * Browser-native crypto digest for generating SHA-256 hashes.
   * @param {string | ArrayBuffer} content
   * @returns {Promise<string>}
   */
  async _generateHash(content) {
    let data;
    if (typeof content === 'string') {
      const encoder = new TextEncoder();
      data = encoder.encode(content);
    } else {
      data = content;
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * Estimate byte size of a blob value.
   * @param {string | ArrayBuffer} content
   * @returns {number}
   */
  _byteSize(content) {
    if (typeof content === 'string') return content.length * 2; // rough UTF-16
    return content.byteLength;
  }

  /**
   * Stores the content and returns its deduplicated blobId.
   * Automatically increments the reference count.
   * @param {string | ArrayBuffer} content
   * @returns {Promise<{ blobId: string, hash: string }>}
   */
  async put(content) {
    const hash = await this._generateHash(content);
    const blobId = hash; // The blobId is intrinsically its hash.

    if (!this.blobs.has(blobId)) {
      this.blobs.set(blobId, content);
      this._totalBytes += this._byteSize(content);
      this._refCounts.set(blobId, 1);

      // If we've exceeded the budget, try to free zero-ref blobs
      if (this._totalBytes > MAX_TOTAL_BYTES) {
        this.gc();
      }
    } else {
      this.incRef(blobId);
    }

    return { blobId, hash };
  }

  /**
   * Retrieves the content by blobId.
   * @param {string} blobId
   * @returns {Promise<ArrayBuffer | string>}
   */
  async get(blobId) {
    if (!this.blobs.has(blobId)) {
      throw new Error(`Blob not found for id: ${blobId}`);
    }
    return this.blobs.get(blobId);
  }

  /**
   * Checks if the blob exists in the store.
   * @param {string} hash
   * @returns {boolean}
   */
  exists(hash) {
    return this.blobs.has(hash);
  }

  // ── Reference Counting ────────────────────────────────────────────────────

  /**
   * Increment reference count for a blobId.
   * Called when a new FileNode starts pointing to this blob.
   * @param {string} blobId
   */
  incRef(blobId) {
    this._refCounts.set(blobId, (this._refCounts.get(blobId) ?? 0) + 1);
  }

  /**
   * Decrement reference count for a blobId.
   * Called when a FileNode is overwritten or deleted.
   * @param {string} blobId
   */
  decRef(blobId) {
    const count = this._refCounts.get(blobId) ?? 0;
    if (count <= 1) {
      this._refCounts.set(blobId, 0);
    } else {
      this._refCounts.set(blobId, count - 1);
    }
  }

  /**
   * Garbage collect: remove all blobs with zero references.
   * @returns {number} Number of blobs freed
   */
  gc() {
    let freed = 0;
    for (const [blobId, refCount] of this._refCounts.entries()) {
      if (refCount <= 0 && this.blobs.has(blobId)) {
        this._totalBytes -= this._byteSize(this.blobs.get(blobId));
        this.blobs.delete(blobId);
        this._refCounts.delete(blobId);
        freed++;
      }
    }
    if (freed > 0) {
      console.log(
        `[BlobStore] GC freed ${freed} blob(s). Total: ${(this._totalBytes / 1024 / 1024).toFixed(1)} MB`
      );
    }
    return freed;
  }
}

// Export a singleton instance.
export const blobStore = new BlobStore();
