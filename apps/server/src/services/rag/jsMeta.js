/**
 * @file jsMeta.js
 * @description Extract imports/exports metadata for JS/TS.
 */

import * as acorn from 'acorn';

export function extractJsMeta(source) {
  const imports = new Set();
  const exports = new Set();

  try {
    const ast = acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: false,
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true,
    });

    for (const node of ast.body) {
      if (node.type === 'ImportDeclaration') {
        if (node.source?.value) imports.add(node.source.value);
      }

      if (node.type === 'ExportNamedDeclaration') {
        if (node.declaration?.id?.name) exports.add(node.declaration.id.name);
        if (node.declaration?.declarations) {
          for (const d of node.declaration.declarations) {
            if (d.id?.name) exports.add(d.id.name);
          }
        }
        if (node.specifiers) {
          for (const s of node.specifiers) {
            if (s.exported?.name) exports.add(s.exported.name);
          }
        }
        if (node.source?.value) imports.add(node.source.value);
      }

      if (node.type === 'ExportDefaultDeclaration') {
        exports.add('default');
      }

      if (node.type === 'ExportAllDeclaration') {
        exports.add('*');
        if (node.source?.value) imports.add(node.source.value);
      }
    }
  } catch {
    // Fallback regex when parsing fails
    const lines = source.split('\n');
    for (const line of lines) {
      const t = line.trim();
      const m = t.match(/^import\s+.*?from\s+['\"](.+?)['\"]/);
      if (m) imports.add(m[1]);
      const r = t.match(/require\(['\"](.+?)['\"]\)/);
      if (r) imports.add(r[1]);
      if (t.startsWith('export ')) exports.add('export');
    }
  }

  return { imports: Array.from(imports), exports: Array.from(exports) };
}
