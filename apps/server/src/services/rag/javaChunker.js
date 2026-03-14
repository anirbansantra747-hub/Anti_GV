/**
 * @file javaChunker.js
 * @description Lightweight Java chunker (class/interface/enum/record blocks + imports).
 */

import { createHash } from 'crypto';

export function chunkJava(source, filePath) {
  const lines = source.split('\n');
  const chunks = [];

  // Header: import/package lines
  let headerEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '' || t.startsWith('//')) {
      if (headerEnd === i) headerEnd = i + 1;
      continue;
    }
    if (/^(package\s+|import\s+)/.test(t)) {
      headerEnd = i + 1;
      continue;
    }
    break;
  }
  if (headerEnd > 0) {
    chunks.push(
      makeChunk(filePath, 'header', 'imports', 1, headerEnd, lines.slice(0, headerEnd).join('\n'))
    );
  }

  // Find top-level class/interface/enum/record blocks
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed === '') {
      i++;
      continue;
    }

    const m = trimmed.match(/\b(class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m && trimmed.includes('{')) {
      const name = m[2];
      const startLine = i + 1;
      let braceCount = countBraces(line);
      let endLine = i + 1;
      let j = i + 1;
      for (; j < lines.length; j++) {
        braceCount += countBraces(lines[j]);
        endLine = j + 1;
        if (braceCount <= 0) {
          j++;
          break;
        }
      }
      const content = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push(makeChunk(filePath, 'class', name, startLine, endLine, content));
      i = j;
      continue;
    }

    i++;
  }

  return chunks;
}

function countBraces(line) {
  let count = 0;
  for (const ch of line) {
    if (ch === '{') count++;
    if (ch === '}') count--;
  }
  return count;
}

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
