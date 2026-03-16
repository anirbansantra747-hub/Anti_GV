/**
 * @file embedder.js
 * @description Local embedding client (HTTP).
 *
 * Uses a local embedding service (Python) to generate vector embeddings.
 */

const EMBEDDING_URL = process.env.EMBEDDING_URL || 'http://localhost:8001/embed';
const EMBEDDING_INFO_URL = process.env.EMBEDDING_INFO_URL || 'http://localhost:8001/info';
const DEFAULT_DIM = Number(process.env.EMBEDDING_DIM) || 384; // all-MiniLM-L6-v2
const BATCH_SIZE = Number(process.env.EMBEDDING_BATCH_SIZE) || 8;
const MAX_CHARS = Number(process.env.EMBEDDING_MAX_CHARS) || 8000;
const HEALTH_TTL_MS = 30_000;
let lastHealthCheckAt = 0;
let lastHealthOk = false;
let lastHealthInfo = null;

/**
 * Embed a batch of text chunks using the local embedding service.
 * @param {string[]} texts - Array of text strings to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function embedBatch(texts) {
  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ texts }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Embedding server failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  if (!data?.embeddings) {
    throw new Error('Embedding server response missing embeddings');
  }
  return data.embeddings;
}

/**
 * Embed an array of chunk objects. Adds the `embedding` field to each chunk.
 * Handles batching automatically.
 *
 * @param {Array<{ content: string, [key: string]: any }>} chunks
 * @returns {Promise<Array<{ content: string, embedding: number[], [key: string]: any }>>}
 */
export async function embedChunks(chunks) {
  if (chunks.length === 0) return [];

  const results = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const texts = batch.map((chunk) => {
      const prefix = `File: ${chunk.filePath} | Type: ${chunk.chunkType} | Name: ${chunk.name}\n`;
      const content = typeof chunk.content === 'string' ? chunk.content : '';
      const trimmed = content.length > MAX_CHARS ? content.slice(0, MAX_CHARS) : content;
      return prefix + trimmed;
    });

    console.log(
      `[Embedder] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)} (${batch.length} chunks)`
    );

    const embeddings = await embedBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      results.push({
        ...batch[j],
        embedding: embeddings[j],
      });
    }
  }

  return results;
}

/**
 * Get the embedding dimension for the current model.
 */
export function getEmbeddingDimension() {
  return DEFAULT_DIM;
}

/**
 * Optional: fetch live embedding info from the server.
 */
export async function getEmbeddingInfo() {
  try {
    const res = await fetch(EMBEDDING_INFO_URL);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Cached health check for embedding server availability.
 * @param {{ force?: boolean }} [opts]
 */
export async function getEmbeddingHealth(opts = {}) {
  const { force = false } = opts;
  const now = Date.now();
  if (!force && now - lastHealthCheckAt < HEALTH_TTL_MS) {
    return { ok: lastHealthOk, info: lastHealthInfo };
  }
  const info = await getEmbeddingInfo();
  lastHealthOk = !!info;
  lastHealthInfo = info;
  lastHealthCheckAt = now;
  return { ok: lastHealthOk, info: lastHealthInfo };
}

export async function isEmbeddingAvailable() {
  const health = await getEmbeddingHealth();
  return health.ok;
}
