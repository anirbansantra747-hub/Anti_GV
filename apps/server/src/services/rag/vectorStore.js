/**
 * @file vectorStore.js
 * @description ChromaDB vector store adapter for RAG (local).
 */

import { ChromaClient, IncludeEnum } from 'chromadb';

const COLLECTION_NAME = 'antigv-codebase';

let chromaClient = null;
let chromaCollection = null;

function getClient() {
  if (chromaClient) return chromaClient;
  const rawHost = process.env.CHROMA_HOST || 'localhost';
  const parsed = parseHost(rawHost);
  chromaClient = new ChromaClient({
    host: parsed.host,
    port: parsed.port || Number(process.env.CHROMA_PORT) || 8000,
    ssl: parsed.ssl ?? (process.env.CHROMA_SSL || '').toLowerCase() === 'true',
  });
  return chromaClient;
}

async function ensureCollection() {
  if (chromaCollection) return chromaCollection;

  const client = getClient();
  chromaCollection = await client.getOrCreateCollection({
    name: COLLECTION_NAME,
    // We always provide embeddings explicitly; avoid default embedder dependency.
    embeddingFunction: {
      generate: async () => {
        throw new Error('Embedding function is disabled. Provide embeddings explicitly.');
      },
    },
    metadata: { 'hnsw:space': 'cosine' },
  });
  console.log(`[VectorStore] Connected to Chroma collection: ${COLLECTION_NAME}`);
  return chromaCollection;
}

/**
 * Upsert an array of embedded chunks into Chroma.
 * Stores content in documents and metadata for filtering.
 */
export async function upsert(embeddedChunks) {
  if (embeddedChunks.length === 0) return;
  const collection = await ensureCollection();

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
      workspaceId: c.workspaceId || 'default',
    }));

    await collection.upsert({ ids, embeddings, documents, metadatas });

    const fileList = Array.from(new Set(batch.map((c) => c.filePath)));
    const preview = fileList.slice(0, 5).join(', ');
    const suffix = fileList.length > 5 ? `, ... (+${fileList.length - 5} more)` : '';
    console.log(
      `[VectorStore] Upserted batch ${Math.floor(i / BATCH) + 1} (${batch.length} chunks) files: ${preview}${suffix}`
    );
  }
}

/**
 * Query the vector store for chunks relevant to a text query.
 */
export async function query(queryEmbedding, topK = 10, whereFilter = undefined) {
  const collection = await ensureCollection();

  const results = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
    where: whereFilter,
    include: [IncludeEnum.metadatas, IncludeEnum.documents, IncludeEnum.distances],
  });

  const rows = results.rows()[0] || [];
  return rows.map((row) => ({
    id: row.id,
    content: row.document || '',
    metadata: {
      filePath: row.metadata?.filePath,
      chunkType: row.metadata?.chunkType,
      name: row.metadata?.name,
      startLine: row.metadata?.startLine,
      endLine: row.metadata?.endLine,
      hash: row.metadata?.hash,
      workspaceId: row.metadata?.workspaceId,
    },
    distance: row.distance ?? 0,
  }));
}

/**
 * Delete all chunks belonging to a specific file (and optional workspace).
 */
export async function deleteByFile(filePath, workspaceId = undefined) {
  const collection = await ensureCollection();
  const where = buildWhere({ filePath, workspaceId });
  await collection.delete({ where });
  console.log(`[VectorStore] Deleted all chunks for: ${filePath}`);
}

/**
 * Get the count of all stored chunks.
 */
export async function getCount() {
  const collection = await ensureCollection();
  return collection.count();
}

/**
 * Get all stored hashes for a given file. Used for incremental indexing.
 * @param {string} filePath
 * @param {string} [workspaceId]
 * @returns {Promise<Map<string, string>>} Map of chunkName â†’ hash
 */
export async function getHashesForFile(filePath, workspaceId = undefined) {
  const collection = await ensureCollection();
  const where = buildWhere({ filePath, workspaceId });

  const result = await collection.get({
    where,
    include: [IncludeEnum.metadatas],
  });

  const hashMap = new Map();
  const metas = result?.metadatas || [];
  for (const meta of metas) {
    if (meta?.name && meta?.hash) {
      hashMap.set(meta.name, meta.hash);
    }
  }

  return hashMap;
}

/**
 * Generate a deterministic ID for a chunk.
 * Format: workspaceId::filePath::chunkType::name
 */
export function buildChunkId(chunk) {
  const workspaceId = chunk.workspaceId || 'default';
  const normalized = chunk.filePath.replace(/\\/g, '/');
  return `${workspaceId}::${normalized}::${chunk.chunkType}::${chunk.name}`;
}

function generateId(chunk) {
  return buildChunkId(chunk);
}

export async function deleteByIds(ids) {
  if (!ids || ids.length === 0) return;
  const collection = await ensureCollection();
  await collection.delete({ ids });
  console.log(`[VectorStore] Deleted ${ids.length} chunks by id`);
}

function parseHost(value) {
  try {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      const url = new URL(value);
      return {
        host: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        ssl: url.protocol === 'https:',
      };
    }
  } catch {
    // ignore
  }
  return { host: value };
}

function buildWhere({ filePath, workspaceId }) {
  if (filePath && workspaceId) {
    return { $and: [{ filePath }, { workspaceId }] };
  }
  if (filePath) return { filePath };
  if (workspaceId) return { workspaceId };
  return undefined;
}
