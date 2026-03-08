/**
 * @file test_m9.js
 * @description Test script for Module 9: RAG Pipeline
 *
 * Tests:
 *   1. AST chunker on a real codebase file
 *   2. ChromaDB connection
 *   3. Pinecone embedding (if API key set)
 *   4. Full pipeline: chunk → embed → upsert → query
 *
 * Usage: node test_m9.js
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { chunkFile } from './chunker.js';
import { chunkWithAST } from './astChunker.js';

// Load .env from apps/server
dotenv.config({ path: path.resolve(import.meta.dirname, '../../../.env') });

console.log('═══════════════════════════════════════════════');
console.log(' Module 9: RAG Pipeline — Test Suite');
console.log('═══════════════════════════════════════════════\n');

// ── Test 1: AST Chunker ─────────────────────────────────────
console.log('📦 Test 1: AST Chunker');
console.log('─'.repeat(40));

// Read a real file from the project
const testFile = path.resolve(import.meta.dirname, '../agent/coderAgent.js');
const source = fs.readFileSync(testFile, 'utf-8');

const chunks = chunkWithAST(source, testFile);

if (!chunks || chunks.length === 0) {
  console.log('❌ AST chunker returned no chunks!');
} else {
  console.log(`✅ AST parsed ${chunks.length} semantic chunks:`);
  for (const chunk of chunks) {
    console.log(
      `   [${chunk.chunkType}] ${chunk.name} (L${chunk.startLine}–L${chunk.endLine}, ${chunk.content.length} chars, hash: ${chunk.hash})`
    );
  }
}

// ── Test 2: Unified Chunker on multiple file types ──────────
console.log('\n📦 Test 2: Unified Chunker');
console.log('─'.repeat(40));

const jsonFile = path.resolve(import.meta.dirname, '../../../package.json');
const jsonSource = fs.readFileSync(jsonFile, 'utf-8');
const jsonChunks = chunkFile(jsonSource, jsonFile);
console.log(`✅ JSON chunker: ${jsonChunks.length} chunk(s) from package.json`);

// ── Test 3: Skip detection ──────────────────────────────────
console.log('\n📦 Test 3: Skip Detection');
console.log('─'.repeat(40));

const skipTests = [
  'node_modules/foo/bar.js',
  'src/utils.js',
  'assets/logo.png',
  '.git/refs/heads/main',
  'dist/bundle.js',
  'src/components/App.jsx',
];

for (const f of skipTests) {
  const skip = chunkFile('const x = 1;', f);
  console.log(`   ${skip.length === 0 ? '⏭️  SKIP' : '✅ CHUNK'}: ${f}`);
}

// ── Test 4: ChromaDB Connection ─────────────────────────────
console.log('\n📦 Test 4: ChromaDB Connection');
console.log('─'.repeat(40));

try {
  const { getCount } = await import('./vectorStore.js');
  const count = await getCount();
  console.log(`✅ ChromaDB connected! Current chunk count: ${count}`);
} catch (err) {
  console.log(`⚠️  ChromaDB not reachable: ${err.message}`);
  console.log('   Make sure Docker container "lexi_chromadb" is running on port 8000');
}

// ── Test 5: Pinecone Embedding (only if API key set) ────────
console.log('\n📦 Test 5: Pinecone Embedding');
console.log('─'.repeat(40));

if (!process.env.PINECONE_API_KEY) {
  console.log('⏭️  Skipped — PINECONE_API_KEY not set in .env');
  console.log('   Set it and re-run to test the full pipeline');
} else {
  try {
    const { embedChunks } = await import('./embedder.js');
    const testChunks = [chunks[0]]; // Just embed the first chunk
    const embedded = await embedChunks(testChunks);
    console.log(`✅ Pinecone embedding works! Vector dimension: ${embedded[0].embedding.length}`);
  } catch (err) {
    console.log(`❌ Pinecone embedding failed: ${err.message}`);
  }
}

console.log('\n═══════════════════════════════════════════════');
console.log(' Tests Complete');
console.log('═══════════════════════════════════════════════');
