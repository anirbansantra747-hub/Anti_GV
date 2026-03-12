/**
 * @file vectorStore.js
 * @description Pinecone vector store adapter for RAG.
 *
 * Connects to the Pinecone index specified by PINECONE_API_KEY.
 * Provides upsert, query, and deleteByFile operations, ensuring compatibility
 * with the original ChromaDB interfaces used by the orchestrator.
 */

import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
dotenv.config();

const INDEX_NAME = 'antigv-codebase';

let pineconeClient = null;
let pineconeIndex = null;

/**
 * Initialize connection to Pinecone and get the index.
 */
async function ensureCollection() {
  if (pineconeIndex) return pineconeIndex;

  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY is not set in environment variables');
  }

  pineconeClient = new Pinecone({ apiKey });

  // Optional: Auto-create the index if it doesn't exist (Only works if user has available quota)
  // For production, it's safer to just assume the index is created, or catch the error.
  try {
    const list = await pineconeClient.listIndexes();
    const exists = list.indexes?.find((i) => i.name === INDEX_NAME);
    if (!exists) {
      console.log(`[VectorStore] Creating Pinecone index: ${INDEX_NAME}...`);
      await pineconeClient.createIndex({
        name: INDEX_NAME,
        dimension: 1024, // Matching llama-text-embed-v2 out of embedder.js
        metric: 'cosine',
        spec: {
          serverless: { cloud: 'aws', region: 'us-east-1' },
        },
      });
      // Wait for initialization
      await new Promise((res) => setTimeout(res, 5000));
    }
  } catch (err) {
    console.warn('[VectorStore] Index configuration warning:', err.message);
  }

  pineconeIndex = pineconeClient.index(INDEX_NAME);
  console.log(`[VectorStore] Connected to Pinecone index: ${INDEX_NAME}`);
  return pineconeIndex;
}

/**
 * Upsert an array of embedded chunks into Pinecone.
 * Pinecone expects { id, values, metadata }.
 * We store the chunk `content` directly in `metadata` (limit ~40KB per vector).
 */
export async function upsert(embeddedChunks) {
  if (embeddedChunks.length === 0) return;

  const index = await ensureCollection();

  // Pinecone batch limit is typically ~100-250
  const BATCH = 100;
  for (let i = 0; i < embeddedChunks.length; i += BATCH) {
    const batch = embeddedChunks.slice(i, i + BATCH);

    const vectors = batch.map((c) => ({
      id: generateId(c),
      values: c.embedding,
      metadata: {
        filePath: c.filePath,
        chunkType: c.chunkType,
        name: c.name,
        startLine: c.startLine,
        endLine: c.endLine,
        hash: c.hash,
        content: c.content, // Crucial: Store text in metadata
      },
    }));

    await index.upsert(vectors);

    console.log(
      `[VectorStore] Upserted batch ${Math.floor(i / BATCH) + 1} (${batch.length} chunks)`
    );
  }
}

/**
 * Query the vector store for chunks relevant to a text query.
 * Expects the exact return format required by `contextAssembler.js`.
 */
export async function query(queryEmbedding, topK = 10, whereFilter = undefined) {
  const index = await ensureCollection();

  const results = await index.query({
    vector: queryEmbedding,
    topK: topK,
    filter: whereFilter,
    includeMetadata: true,
  });

  if (!results.matches || results.matches.length === 0) return [];

  return results.matches.map((match) => ({
    id: match.id,
    content: match.metadata.content,
    metadata: {
      filePath: match.metadata.filePath,
      chunkType: match.metadata.chunkType,
      name: match.metadata.name,
      startLine: match.metadata.startLine,
      endLine: match.metadata.endLine,
      hash: match.metadata.hash,
    },
    distance: 1 - (match.score || 1), // Convert cosine similarity score to roughly a 'distance' metric if needed
  }));
}

/**
 * Delete all chunks belonging to a specific file using metadata filters.
 */
export async function deleteByFile(filePath) {
  const index = await ensureCollection();

  try {
    // Note: Pinecone Serverless supports deleteMany with a filter
    await index.deleteMany({ filePath });
    console.log(`[VectorStore] Deleted all chunks for: ${filePath}`);
  } catch (err) {
    console.warn(`[VectorStore] Delete warning for ${filePath}: ${err.message}`);
  }
}

/**
 * Get the count of all stored chunks.
 */
export async function getCount() {
  const index = await ensureCollection();
  const stats = await index.describeIndexStats();
  return stats.totalRecordCount || 0;
}

/**
 * Get all stored hashes for a given file. Used for incremental indexing.
 * @param {string} filePath
 * @returns {Promise<Map<string, string>>} Map of chunkName → hash
 */
export async function getHashesForFile(filePath) {
  const index = await ensureCollection();
  const hashMap = new Map();

  // Pinecone doesn't have a simple 'SELECT * WHERE metadata=' like SQL.
  // A hacky way to do this in Pinecone is to query with a dummy embedding
  // and the filter, asking for high topK. This is an approximation.
  try {
    const dummyVector = new Array(1024).fill(0);
    const results = await index.query({
      vector: dummyVector,
      topK: 1000,
      filter: { filePath },
      includeMetadata: true,
    });

    for (const match of results.matches) {
      if (match.metadata && match.metadata.name && match.metadata.hash) {
        hashMap.set(match.metadata.name, match.metadata.hash);
      }
    }
  } catch (err) {
    console.warn(`[VectorStore] getHashesForFile warning: ${err.message}`);
  }

  return hashMap;
}

// ── Helpers ───────────────────────────────────────────────

/**
 * Generate a deterministic ID for a chunk.
 * Format: filePath::chunkType::name
 */
function generateId(chunk) {
  const normalized = chunk.filePath.replace(/\\/g, '/');
  return `${normalized}::${chunk.chunkType}::${chunk.name}`;
}
