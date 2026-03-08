/**
 * @file chunker.js
 * @description Unified chunking dispatcher.
 *
 * Routes files to the appropriate chunker:
 *   - JS/JSX/TS/TSX → AST-aware semantic chunker
 *   - JSON/config → JSON chunker
 *   - Everything else → Sliding-window fallback
 *
 * Skips binary / irrelevant files (node_modules, .git, images, etc.)
 */

import { chunkWithAST } from './astChunker.js';
import { chunkWithSlidingWindow, chunkJSON } from './fallbackChunker.js';
import path from 'path';

/** File extensions we can parse with AST */
const AST_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);

/** File extensions handled as JSON/config */
const CONFIG_EXTENSIONS = new Set(['.json', '.jsonc']);

/** Extensions/patterns to always skip */
const SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp3',
  '.mp4',
  '.wav',
  '.avi',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.lock',
  '.map',
]);

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
  'coverage',
  '.nyc_output',
  '__pycache__',
  '.venv',
  'venv',
]);

/**
 * Determine if a file path should be skipped entirely.
 */
export function shouldSkip(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (SKIP_EXTENSIONS.has(ext)) return true;

  const parts = filePath.split(/[\\/]/);
  return parts.some((part) => SKIP_DIRS.has(part));
}

/**
 * Chunk a single file into semantic units.
 * @param {string} source - Raw file content
 * @param {string} filePath - Absolute or relative path
 * @returns {Array<{
 *   filePath: string,
 *   chunkType: string,
 *   name: string,
 *   startLine: number,
 *   endLine: number,
 *   content: string,
 *   hash: string
 * }>}
 */
export function chunkFile(source, filePath) {
  if (shouldSkip(filePath)) return [];
  if (!source || source.trim().length === 0) return [];

  const ext = path.extname(filePath).toLowerCase();

  // 1. Try AST-based chunking for JS/TS
  if (AST_EXTENSIONS.has(ext)) {
    const astChunks = chunkWithAST(source, filePath);
    if (astChunks && astChunks.length > 0) {
      return astChunks;
    }
    // AST parsing failed — fall through to sliding window
  }

  // 2. JSON/config files
  if (CONFIG_EXTENSIONS.has(ext)) {
    return chunkJSON(source, filePath);
  }

  // 3. Fallback sliding window for everything else
  return chunkWithSlidingWindow(source, filePath);
}
