/**
 * @file blobStore.js
 * @description In-memory Content Deduplication store for the File System.
 * Every blob is uniquely identified by its SHA-256 hash.
 */

class BlobStore {
  constructor() {
    /** @type {Map<string, ArrayBuffer | string>} */
    this.blobs = new Map();
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
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  }

  /**
   * Stores the content and returns its deduplicated blobId.
   * @param {string | ArrayBuffer} content
   * @returns {Promise<{ blobId: string, hash: string }>}
   */
  async put(content) {
    const hash = await this._generateHash(content);
    const blobId = hash; // The blobId is intrinsically its hash.

    if (!this.blobs.has(blobId)) {
      this.blobs.set(blobId, content);
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
}

// Export a singleton instance.
export const blobStore = new BlobStore();
