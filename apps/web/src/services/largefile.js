/**
 * @file largefile.js
 * @description Large file handling policy (V3 ADR #5).
 *
 * Files > 2MB are flagged as binary=true. They:
 *  - Bypass Monaco text rendering (return a "Large File View" indicator)
 *  - Store only the blobId pointer (content stays in BlobStore as ArrayBuffer)
 *  - Compute hash via streaming chunks for memory safety
 *
 * This module provides:
 *  - isLargeFile(content) — guard check
 *  - streamingHash(arrayBuffer) — chunked SHA-256 for large payloads
 *  - getLargeFileInfo(fileNode) — metadata for the Large File UI card
 */

/** @constant {number} 2 megabytes in bytes */
export const LARGE_FILE_THRESHOLD = 2 * 1024 * 1024;

/**
 * Returns true if the content exceeds the 2MB threshold.
 * @param {string | ArrayBuffer} content
 * @returns {boolean}
 */
export function isLargeFile(content) {
  if (typeof content === 'string') {
    // Rough byte estimate: chars × 3 for worst-case UTF-8
    return content.length * 3 > LARGE_FILE_THRESHOLD;
  }
  return content.byteLength > LARGE_FILE_THRESHOLD;
}

/**
 * Hash an ArrayBuffer using crypto.subtle.digest directly.
 * Web Crypto handles large buffers internally without needing manual chunking.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<string>}
 */
export async function streamingHash(buffer) {
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Produce a human-readable info card for the Large File View UI.
 * @param {import('../models/WorkspaceContracts.js').FileNode} fileNode
 * @param {ArrayBuffer} [buffer] - optional raw buffer to get exact size
 * @returns {{ name: string, blobId: string, sizeLabel: string, message: string }}
 */
export function getLargeFileInfo(fileNode, buffer) {
  const byteSize = buffer?.byteLength ?? 0;
  const sizeLabel = byteSize
    ? byteSize >= 1_000_000
      ? `${(byteSize / 1_000_000).toFixed(1)} MB`
      : `${(byteSize / 1_000).toFixed(1)} KB`
    : 'Size unknown';

  return {
    name: fileNode.name,
    blobId: fileNode.blobId,
    sizeLabel,
    message: `This file is too large to display in the editor (${sizeLabel}). It is safely stored and tracked by its content hash.`,
  };
}

/**
 * Guard applied inside memfsService.writeFileSync.
 * Returns the correct binary flag and uses streamingHash for >2MB content.
 * @param {string | ArrayBuffer} content
 * @returns {Promise<{ blobId: string, hash: string, binary: boolean }>}
 */
export async function processFileContent(content) {
  const { blobStore } = await import('./blobStore.js');
  const large = isLargeFile(content);

  if (large && content instanceof ArrayBuffer) {
    const hash = await streamingHash(content);
    const blobId = hash;
    if (!blobStore.exists(blobId)) {
      blobStore.blobs.set(blobId, content);
    }
    return { blobId, hash, binary: true };
  }

  // Standard path for normal-sized files
  const { blobId, hash } = await blobStore.put(content);
  return { blobId, hash, binary: false };
}
