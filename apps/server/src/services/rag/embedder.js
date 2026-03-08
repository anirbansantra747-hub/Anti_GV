/**
 * @file embedder.js
 * @description Embedding service using Pinecone's inference API.
 *
 * Takes text chunks and converts them into vector embeddings.
 * Batches requests for throughput (max 96 chunks per batch).
 */

import dotenv from 'dotenv';
dotenv.config();

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const EMBEDDING_MODEL = 'llama-text-embed-v2';
const BATCH_SIZE = 96;
const PINECONE_INFERENCE_URL = 'https://api.pinecone.io/embed';

/**
 * Embed a batch of text chunks using Pinecone Inference API.
 * @param {string[]} texts - Array of text strings to embed
 * @returns {Promise<number[][]>} Array of embedding vectors
 */
async function embedBatch(texts) {
  if (!PINECONE_API_KEY) {
    throw new Error('PINECONE_API_KEY is not set in environment variables');
  }

  const response = await fetch(PINECONE_INFERENCE_URL, {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json',
      'X-Pinecone-Api-Version': '2025-10',
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      inputs: texts.map((text) => ({ text })),
      parameters: {
        input_type: 'passage',
        truncate: 'END',
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Pinecone embedding failed (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.data.map((item) => item.values);
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
      // Prepend metadata for better embedding quality
      const prefix = `File: ${chunk.filePath} | Type: ${chunk.chunkType} | Name: ${chunk.name}\n`;
      return prefix + chunk.content;
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
  // multilingual-e5-large produces 1024-dimensional vectors
  return 1024;
}
