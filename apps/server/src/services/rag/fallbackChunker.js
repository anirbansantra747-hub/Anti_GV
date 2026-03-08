/**
 * @file fallbackChunker.js
 * @description Sliding-window chunker for files that can't be AST-parsed
 * (CSS, HTML, JSON, Markdown, configs, binary-adjacent text, etc.)
 *
 * Uses semantic boundaries (blank lines, section headers) when possible,
 * falls back to fixed-size windows with overlap.
 */

import { createHash } from 'crypto';

const MAX_CHUNK_LINES = 60;
const OVERLAP_LINES = 8;

/**
 * Chunk a non-parseable file using smart line-based sliding windows.
 * Tries to break at blank-line boundaries rather than mid-statement.
 *
 * @param {string} source - Raw file content
 * @param {string} filePath - Absolute path
 * @returns {Array<import('./astChunker.js').default>}
 */
export function chunkWithSlidingWindow(source, filePath) {
  const lines = source.split('\n');
  const chunks = [];

  if (lines.length <= MAX_CHUNK_LINES) {
    // Small file — one chunk
    chunks.push(makeChunk(filePath, 'whole_file', fileBasename(filePath), 1, lines.length, source));
    return chunks;
  }

  let cursor = 0;
  let chunkIndex = 0;

  while (cursor < lines.length) {
    let end = Math.min(cursor + MAX_CHUNK_LINES, lines.length);

    // Try to find a natural break point (blank line) near the end
    if (end < lines.length) {
      let bestBreak = -1;
      // Look backward from `end` up to 15 lines for a blank line
      for (let i = end; i >= end - 15 && i > cursor; i--) {
        if (lines[i]?.trim() === '') {
          bestBreak = i;
          break;
        }
      }
      if (bestBreak > cursor) {
        end = bestBreak;
      }
    }

    const content = lines.slice(cursor, end).join('\n');
    const startLine = cursor + 1; // 1-indexed
    const endLine = end;

    if (content.trim().length > 0) {
      chunks.push(makeChunk(filePath, 'block', `chunk_${chunkIndex}`, startLine, endLine, content));
      chunkIndex++;
    }

    // Advance cursor with overlap
    cursor = end - OVERLAP_LINES;
    if (cursor <= (chunks.length > 0 ? end - MAX_CHUNK_LINES : 0)) {
      cursor = end; // Prevent infinite loop
    }
  }

  return chunks;
}

/**
 * Special chunker for JSON/config files — keeps the file as one chunk
 * if small, otherwise splits top-level keys.
 */
export function chunkJSON(source, filePath) {
  const lines = source.split('\n');

  if (lines.length <= MAX_CHUNK_LINES) {
    return [makeChunk(filePath, 'config', fileBasename(filePath), 1, lines.length, source)];
  }

  // Fall back to sliding window for large JSON
  return chunkWithSlidingWindow(source, filePath);
}

// ── Helpers ──────────────────────────────────────────────────

function makeChunk(filePath, chunkType, name, startLine, endLine, content) {
  return {
    filePath,
    chunkType,
    name,
    startLine,
    endLine,
    content,
    hash: createHash('sha256').update(content).digest('hex').substring(0, 16),
  };
}

function fileBasename(filePath) {
  return filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
}
