/**
 * @file vectorStore.js
 * @description ChromaDB vector store adapter.
 *
 * Connects to the ChromaDB instance running in Docker (lexi_chromadb, port 8000).
 * Provides upsert, query, and deleteByFile operations.
 */

import { ChromaClient } from 'chromadb';

const CHROMA_HOST = process.env.CHROMA_HOST || 'http://localhost:8000';
const COLLECTION_NAME = 'antigv_codebase';

let client = null;
let collection = null;

/**
 * Initialize connection to ChromaDB and get/create the collection.
 */
async function ensureCollection() {
  if (collection) return collection;

  client = new ChromaClient({ path: CHROMA_HOST });

  // Dummy embedding function since we compute embeddings via Pinecone before passing to ChromaDB
  const dummyEmbeddingFunction = {
    generate: (texts) => new Array(texts.length).fill([]),
  };

  // Get or create the collection
  collection = await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    embeddingFunction: dummyEmbeddingFunction,
    metadata: {
      description: 'Anti_GV codebase semantic chunks',
      'hnsw:space': 'cosine',
    },
  });

  console.log(`[VectorStore] Connected to ChromaDB collection: ${COLLECTION_NAME}`);
  return collection;
}

/**
 * Upsert an array of embedded chunks into ChromaDB.
 * @param {Array<{
 *   filePath: string,
 *   chunkType: string,
 *   name: string,
 *   startLine: number,
 *   endLine: number,
 *   content: string,
 *   hash: string,
 *   embedding: number[]
 * }>} embeddedChunks
 */
export async function upsert(embeddedChunks) {
  if (embeddedChunks.length === 0) return;

  const col = await ensureCollection();

  // ChromaDB batch limit is typically around 5461, we'll batch at 100 for safety
  const BATCH = 100;
  for (let i = 0; i < embeddedChunks.length; i += BATCH) {
    const batch = embeddedChunks.slice(i, i + BATCH);

    const ids = batch.map((c) => generateId(c));
    const embeddings = batch.map((c) => c.embedding);
    const documents = batch.map((c) => c.content);
    const metadatas = batch.map((c) => ({
      filePath: c.filePath,
      chunkType: c.chunkType,
      name: c.name,
      startLine: c.startLine,
      endLine: c.endLine,
      hash: c.hash,
    }));

    await col.upsert({
      ids,
      embeddings,
      documents,
      metadatas,
    });

    console.log(
      `[VectorStore] Upserted batch ${Math.floor(i / BATCH) + 1} (${batch.length} chunks)`
    );
  }
}

/**
 * Query the vector store for chunks relevant to a text query.
 * @param {number[]} queryEmbedding - The query vector
 * @param {number} topK - Number of results to return
 * @param {Object} [whereFilter] - Optional ChromaDB where filter
 * @returns {Promise<Array<{
 *   id: string,
 *   content: string,
 *   metadata: Object,
 *   distance: number
 * }>>}
 */
export async function query(queryEmbedding, topK = 10, whereFilter = undefined) {
  const col = await ensureCollection();

  const results = await col.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
    where: whereFilter,
    include: ['documents', 'metadatas', 'distances'],
  });

  if (!results.ids || results.ids.length === 0) return [];

  return results.ids[0].map((id, i) => ({
    id,
    content: results.documents[0][i],
    metadata: results.metadatas[0][i],
    distance: results.distances[0][i],
  }));
}

/**
 * Delete all chunks belonging to a specific file.
 * Used for incremental re-indexing when a file changes.
 * @param {string} filePath
 */
export async function deleteByFile(filePath) {
  const col = await ensureCollection();

  try {
    await col.delete({
      where: { filePath },
    });
    console.log(`[VectorStore] Deleted all chunks for: ${filePath}`);
  } catch (err) {
    // ChromaDB may throw if no matching chunks exist — that's fine
    console.warn(`[VectorStore] Delete warning for ${filePath}: ${err.message}`);
  }
}

/**
 * Get the count of all stored chunks.
 */
export async function getCount() {
  const col = await ensureCollection();
  return await col.count();
}

/**
 * Get all stored hashes for a given file. Used for incremental indexing.
 * @param {string} filePath
 * @returns {Promise<Map<string, string>>} Map of chunkName → hash
 */
export async function getHashesForFile(filePath) {
  const col = await ensureCollection();

  const results = await col.get({
    where: { filePath },
    include: ['metadatas'],
  });

  const hashMap = new Map();
  if (results.metadatas) {
    for (const meta of results.metadatas) {
      hashMap.set(meta.name, meta.hash);
    }
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
