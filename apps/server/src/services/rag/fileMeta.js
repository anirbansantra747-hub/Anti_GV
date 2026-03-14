/**
 * @file fileMeta.js
 * @description Extract file-level metadata (imports/exports/symbols).
 */

import path from 'path';
import { extractJsMeta } from './jsMeta.js';
import { extractSymbols } from './symbolExtractor.js';

export function extractFileMeta(source, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const language = detectLanguage(ext);

  if (!language) {
    return { language: '', imports: [], exports: [], symbols: [] };
  }

  const symbols = extractSymbols(source, language).map((s) => ({
    ...s,
    hash: '',
  }));

  const { imports, exports } = extractImportsExports(source, ext, language);

  return { language, imports, exports, symbols };
}

function detectLanguage(ext) {
  if (['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'].includes(ext)) return 'javascript';
  if (ext === '.py') return 'python';
  if (ext === '.java') return 'java';
  return '';
}

function extractImportsExports(source, ext, language) {
  if (language === 'javascript') {
    return extractJsMeta(source);
  }

  if (language === 'python') {
    const imports = new Set();
    const exports = new Set();
    const lines = source.split('\n');
    for (const line of lines) {
      const t = line.trim();
      const m1 = t.match(/^import\s+([A-Za-z0-9_\.]+)/);
      if (m1) imports.add(m1[1]);
      const m2 = t.match(/^from\s+([A-Za-z0-9_\.]+)\s+import\s+(.+)/);
      if (m2) {
        imports.add(m2[1]);
        const names = m2[2].split(',').map((s) => s.trim().split(' ')[0]);
        for (const n of names) if (n) exports.add(n);
      }
    }
    return { imports: Array.from(imports), exports: Array.from(exports) };
  }

  if (language === 'java') {
    const imports = new Set();
    const exports = new Set();
    const lines = source.split('\n');
    for (const line of lines) {
      const t = line.trim();
      const m = t.match(/^import\s+([A-Za-z0-9_\.]+);/);
      if (m) imports.add(m[1]);
      const c = t.match(/\bpublic\s+(class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/);
      if (c) exports.add(c[2]);
    }
    return { imports: Array.from(imports), exports: Array.from(exports) };
  }

  return { imports: [], exports: [] };
}
