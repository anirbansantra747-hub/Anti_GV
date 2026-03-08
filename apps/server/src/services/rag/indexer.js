/**
 * @file indexer.js
 * @description Full-project indexer + incremental re-indexer.
 *
 * Workflow:
 *   1. Walk the project directory tree
 *   2. For each file: chunk → embed → upsert
 *   3. Incremental mode: compare chunk hashes → only re-embed changed chunks
 *
 * Exposed as both a programmatic API and a CLI entry point.
 */

import fs from 'fs/promises';
import path from 'path';
import { chunkFile, shouldSkip } from './chunker.js';
import { embedChunks } from './embedder.js';
import * as vectorStore from './vectorStore.js';

/**
 * Walk a directory tree and collect all file paths.
 * @param {string} dir - Root directory to walk
 * @returns {Promise<string[]>} Array of absolute file paths
 */
async function walkDir(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (shouldSkip(fullPath)) continue;
      const nestedFiles = await walkDir(fullPath);
      files.push(...nestedFiles);
    } else if (entry.isFile()) {
      if (!shouldSkip(fullPath)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Index (or re-index) an entire project.
 * @param {string} projectRoot - Absolute path to the project root
 * @param {{ incremental?: boolean, onProgress?: (msg: string) => void }} options
 * @returns {Promise<{ totalFiles: number, totalChunks: number, newChunks: number, skippedChunks: number }>}
 */
export async function indexProject(projectRoot, options = {}) {
  const { incremental = true, onProgress = console.log } = options;

  onProgress(
    `[Indexer] Starting ${incremental ? 'incremental' : 'full'} indexing of: ${projectRoot}`
  );

  // 1. Walk directory tree
  const allFiles = await walkDir(projectRoot);
  onProgress(`[Indexer] Found ${allFiles.length} files`);

  let totalChunks = 0;
  let newChunks = 0;
  let skippedChunks = 0;

  // 2. Process files in batches to avoid OOM on large codebases
  const FILE_BATCH_SIZE = 20;

  for (let i = 0; i < allFiles.length; i += FILE_BATCH_SIZE) {
    const fileBatch = allFiles.slice(i, i + FILE_BATCH_SIZE);
    const allChunksToEmbed = [];

    for (const filePath of fileBatch) {
      try {
        const source = await fs.readFile(filePath, 'utf-8');
        const chunks = chunkFile(source, filePath);

        if (chunks.length === 0) continue;
        totalChunks += chunks.length;

        if (incremental) {
          // Get existing hashes from ChromaDB
          const existingHashes = await vectorStore.getHashesForFile(filePath);

          // Filter to only changed chunks
          const changedChunks = chunks.filter((chunk) => {
            const existingHash = existingHashes.get(chunk.name);
            if (existingHash === chunk.hash) {
              skippedChunks++;
              return false; // Unchanged — skip
            }
            return true; // Changed or new — re-embed
          });

          if (changedChunks.length > 0) {
            allChunksToEmbed.push(...changedChunks);
          }
        } else {
          // Full re-index — delete existing and re-embed all
          await vectorStore.deleteByFile(filePath);
          allChunksToEmbed.push(...chunks);
        }
      } catch (err) {
        // Skip files that can't be read (binary, permissions, etc.)
        if (err.code !== 'ERR_INVALID_STATE') {
          onProgress(`[Indexer] Skipping ${filePath}: ${err.message}`);
        }
      }
    }

    // 3. Embed and upsert the batch
    if (allChunksToEmbed.length > 0) {
      onProgress(
        `[Indexer] Embedding ${allChunksToEmbed.length} chunks (files ${i + 1}–${Math.min(i + FILE_BATCH_SIZE, allFiles.length)})`
      );

      const embedded = await embedChunks(allChunksToEmbed);
      await vectorStore.upsert(embedded);
      newChunks += embedded.length;
    }
  }

  const totalStored = await vectorStore.getCount();
  onProgress(
    `[Indexer] Done! Files: ${allFiles.length}, Total chunks: ${totalChunks}, New/updated: ${newChunks}, Skipped: ${skippedChunks}, Stored in DB: ${totalStored}`
  );

  return { totalFiles: allFiles.length, totalChunks, newChunks, skippedChunks };
}

/**
 * Re-index a single file (used when file watcher detects a change).
 * @param {string} filePath - Absolute path to the changed file
 */
export async function reindexFile(filePath, onProgress = console.log) {
  try {
    const source = await fs.readFile(filePath, 'utf-8');
    const chunks = chunkFile(source, filePath);

    if (chunks.length === 0) {
      await vectorStore.deleteByFile(filePath);
      onProgress(`[Indexer] File deleted/empty, removed chunks: ${filePath}`);
      return;
    }

    // Delete old chunks and re-embed
    await vectorStore.deleteByFile(filePath);
    const embedded = await embedChunks(chunks);
    await vectorStore.upsert(embedded);
    onProgress(`[Indexer] Re-indexed ${filePath}: ${embedded.length} chunks`);
  } catch (err) {
    onProgress(`[Indexer] Failed to re-index ${filePath}: ${err.message}`);
  }
}
