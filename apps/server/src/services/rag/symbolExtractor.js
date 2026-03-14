/**
 * @file symbolExtractor.js
 * @description Language-aware symbol extraction for indexing.
 */

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';

export function extractSymbols(source, language) {
  if (language === 'javascript') return extractJsSymbols(source);
  if (language === 'python') return extractPythonSymbols(source);
  if (language === 'java') return extractJavaSymbols(source);
  return [];
}

function extractJsSymbols(source) {
  const symbols = [];
  const seen = new Set();

  try {
    const ast = acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true,
    });

    walk.ancestor(ast, {
      FunctionDeclaration(node, ancestors) {
        const name = node.id?.name || 'anonymous';
        pushSymbol(symbols, seen, name, 'function', node.loc?.start?.line, node.loc?.end?.line);
      },
      ClassDeclaration(node) {
        const name = node.id?.name || 'AnonymousClass';
        pushSymbol(symbols, seen, name, 'class', node.loc?.start?.line, node.loc?.end?.line);
      },
      VariableDeclarator(node) {
        const init = node.init;
        if (!init) return;
        if (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') return;
        const name = node.id?.name;
        if (!name) return;
        pushSymbol(symbols, seen, name, 'function', node.loc?.start?.line, node.loc?.end?.line);
      },
      MethodDefinition(node, ancestors) {
        const className = findEnclosingClassName(ancestors);
        const methodName = node.key?.name || node.key?.value;
        if (!methodName) return;
        const name = className ? `${className}.${methodName}` : `${methodName}`;
        pushSymbol(symbols, seen, name, 'function', node.loc?.start?.line, node.loc?.end?.line);
      },
      Property(node, ancestors) {
        const val = node.value;
        if (!val || (val.type !== 'ArrowFunctionExpression' && val.type !== 'FunctionExpression'))
          return;
        const key = node.key?.name || node.key?.value;
        if (!key) return;
        const name = key;
        pushSymbol(symbols, seen, name, 'function', node.loc?.start?.line, node.loc?.end?.line);
      },
    });
  } catch {
    // fallback to regex if AST fails
    return extractJsSymbolsByRegex(source);
  }

  return symbols;
}

function findEnclosingClassName(ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = ancestors[i];
    if (node.type === 'ClassDeclaration' && node.id?.name) return node.id.name;
  }
  return null;
}

function extractJsSymbolsByRegex(source) {
  const symbols = [];
  const seen = new Set();
  const lines = source.split('\n');
  lines.forEach((line, idx) => {
    const t = line.trim();
    let m = t.match(/^function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (m) {
      pushSymbol(symbols, seen, m[1], 'function', idx + 1, idx + 1);
      return;
    }
    m = t.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) {
      pushSymbol(symbols, seen, m[1], 'class', idx + 1, idx + 1);
      return;
    }
    m = t.match(/^(const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(?.*?\)?\s*=>/);
    if (m) {
      pushSymbol(symbols, seen, m[2], 'function', idx + 1, idx + 1);
    }
  });
  return symbols;
}

function extractPythonSymbols(source) {
  const symbols = [];
  const seen = new Set();
  const lines = source.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    const defMatch = t.match(/^def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
    if (defMatch) {
      pushSymbol(symbols, seen, defMatch[1], 'function', i + 1, i + 1);
      continue;
    }
    const clsMatch = t.match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
    if (clsMatch) {
      pushSymbol(symbols, seen, clsMatch[1], 'class', i + 1, i + 1);
      continue;
    }
  }

  return symbols;
}

function extractJavaSymbols(source) {
  const symbols = [];
  const seen = new Set();
  const lines = source.split('\n');
  let currentClass = '';

  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) continue;

    const m = t.match(/\b(class|interface|enum|record)\s+([A-Za-z_][A-Za-z0-9_]*)/);
    if (m) {
      currentClass = m[2];
      pushSymbol(symbols, seen, currentClass, 'class', i + 1, i + 1);
      continue;
    }

    if (t.includes('(') && t.includes(')') && (t.endsWith('{') || t.endsWith(';'))) {
      if (/\b(if|for|while|switch|catch|new)\b/.test(t)) continue;
      const meth = t.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (meth) {
        const name = currentClass ? `${currentClass}.${meth[1]}` : meth[1];
        pushSymbol(symbols, seen, name, 'function', i + 1, i + 1);
      }
    }
  }

  return symbols;
}

function pushSymbol(list, seen, name, type, startLine, endLine) {
  if (!name) return;
  const key = `${type}:${name}:${startLine || 0}`;
  if (seen.has(key)) return;
  seen.add(key);
  list.push({
    name,
    type,
    startLine: startLine || 1,
    endLine: endLine || startLine || 1,
  });
}
