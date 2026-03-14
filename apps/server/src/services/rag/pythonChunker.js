/**
 * @file pythonChunker.js
 * @description Lightweight Python chunker (class/function blocks + import header).
 */

import { createHash } from 'crypto';

export function chunkPython(source, filePath) {
  const lines = source.split('\n');
  const chunks = [];

  // Header: consecutive import/from lines near top
  let headerEnd = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) {
      if (headerEnd === i) headerEnd = i + 1;
      continue;
    }
    if (/^(import\s+|from\s+.+\s+import\s+)/.test(line)) {
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

  // Find def/class blocks
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('#') || trimmed === '') {
      i++;
      continue;
    }

    const defMatch = trimmed.match(/^(def|class)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (defMatch) {
      const type = defMatch[1] === 'class' ? 'class' : 'function';
      const name = defMatch[2];
      const startLine = findDecoratorStart(lines, i) + 1; // 1-based
      const baseIndent = leadingIndent(line);

      let endLine = i + 1;
      let j = i + 1;
      for (; j < lines.length; j++) {
        const l = lines[j];
        if (l.trim() === '' || l.trim().startsWith('#')) {
          endLine = j + 1;
          continue;
        }
        const indent = leadingIndent(l);
        if (indent <= baseIndent && !l.trim().startsWith('@')) {
          break;
        }
        endLine = j + 1;
      }

      const content = lines.slice(startLine - 1, endLine).join('\n');
      chunks.push(makeChunk(filePath, type, name, startLine, endLine, content));
      i = j;
      continue;
    }

    i++;
  }

  return chunks;
}

function leadingIndent(line) {
  const match = line.match(/^\s*/);
  return match ? match[0].length : 0;
}

function findDecoratorStart(lines, defLineIndex) {
  let i = defLineIndex - 1;
  while (i >= 0) {
    const t = lines[i].trim();
    if (t.startsWith('@')) {
      i--;
      continue;
    }
    if (t === '' || t.startsWith('#')) {
      i--;
      continue;
    }
    break;
  }
  return i + 1;
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
