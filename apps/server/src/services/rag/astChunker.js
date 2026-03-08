/**
 * @file astChunker.js
 * @description AST-aware semantic chunker for JavaScript/TypeScript files.
 *
 * Instead of dumb fixed-size slicing, this parses source code into meaningful
 * semantic units:
 *   - HEADER: imports + top-level variable declarations
 *   - FUNCTION: each named function/arrow-function (with JSDoc if present)
 *   - CLASS: each class declaration (split per method if large)
 *   - EXPORT: export statements at the bottom
 *
 * Each chunk carries metadata: filePath, chunkType, name, startLine, endLine, hash.
 * Only changed chunks get re-embedded on file updates (hash comparison).
 */

import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { createHash } from 'crypto';

/**
 * Parse a JS/TS file into semantic chunks.
 * @param {string} source - The raw source code
 * @param {string} filePath - Absolute path to the file
 * @returns {Array<{
 *   filePath: string,
 *   chunkType: 'header' | 'function' | 'class' | 'export' | 'top_level',
 *   name: string,
 *   startLine: number,
 *   endLine: number,
 *   content: string,
 *   hash: string
 * }>}
 */
export function chunkWithAST(source, filePath) {
  const lines = source.split('\n');
  const chunks = [];
  const claimedRanges = []; // Track which line ranges are already chunked

  let ast;
  try {
    ast = acorn.parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      locations: true,
      allowImportExportEverywhere: true,
      allowAwaitOutsideFunction: true,
      // Tolerate minor syntax issues
      onComment: () => {},
    });
  } catch {
    // If acorn can't parse, return null — caller should use fallback chunker
    return null;
  }

  // ── 1. HEADER: Collect all imports + top-level const/let/var declarations ──
  const headerNodes = [];
  const functionNodes = [];
  const classNodes = [];
  const exportNodes = [];
  const otherTopLevel = [];

  for (const node of ast.body) {
    switch (node.type) {
      case 'ImportDeclaration':
        headerNodes.push(node);
        break;

      case 'FunctionDeclaration':
        functionNodes.push(node);
        break;

      case 'ClassDeclaration':
        classNodes.push(node);
        break;

      case 'ExportNamedDeclaration':
      case 'ExportDefaultDeclaration':
        // If the export wraps a function/class, extract the inner declaration
        if (node.declaration) {
          if (node.declaration.type === 'FunctionDeclaration') {
            functionNodes.push({ ...node.declaration, _exportWrapper: node });
          } else if (node.declaration.type === 'ClassDeclaration') {
            classNodes.push({ ...node.declaration, _exportWrapper: node });
          } else {
            exportNodes.push(node);
          }
        } else {
          exportNodes.push(node);
        }
        break;

      case 'ExportAllDeclaration':
        exportNodes.push(node);
        break;

      case 'VariableDeclaration': {
        // Check if any declarator is an arrow function or function expression
        const hasFuncInit = node.declarations.some(
          (d) =>
            d.init &&
            (d.init.type === 'ArrowFunctionExpression' || d.init.type === 'FunctionExpression')
        );
        if (hasFuncInit) {
          functionNodes.push(node);
        } else {
          headerNodes.push(node);
        }
        break;
      }

      default:
        // Expression statements that are function calls, etc.
        otherTopLevel.push(node);
        break;
    }
  }

  // ── Emit HEADER chunk (all imports + variable declarations) ──
  if (headerNodes.length > 0) {
    const startLine = Math.min(...headerNodes.map((n) => n.loc.start.line));
    const endLine = Math.max(...headerNodes.map((n) => n.loc.end.line));
    const content = extractLines(lines, startLine, endLine);

    chunks.push(
      makeChunk(filePath, 'header', 'imports_and_declarations', startLine, endLine, content)
    );
    claimedRanges.push([startLine, endLine]);
  }

  // ── Emit FUNCTION chunks ──
  for (const node of functionNodes) {
    const outerNode = node._exportWrapper || node;
    const startLine = outerNode.loc.start.line;
    const endLine = outerNode.loc.end.line;

    // Grab the name
    let name = 'anonymous';
    if (node.id?.name) {
      name = node.id.name;
    } else if (node.type === 'VariableDeclaration' && node.declarations[0]?.id?.name) {
      name = node.declarations[0].id.name;
    }

    // Include any JSDoc comment above the function
    const jsdocStartLine = findJSDocAbove(lines, startLine);
    const actualStart = jsdocStartLine || startLine;

    const content = extractLines(lines, actualStart, endLine);
    chunks.push(makeChunk(filePath, 'function', name, actualStart, endLine, content));
    claimedRanges.push([actualStart, endLine]);
  }

  // ── Emit CLASS chunks ──
  for (const node of classNodes) {
    const outerNode = node._exportWrapper || node;
    const startLine = outerNode.loc.start.line;
    const endLine = outerNode.loc.end.line;
    const name = node.id?.name || 'AnonymousClass';
    const totalLines = endLine - startLine + 1;

    // If class is small (< 80 lines), keep as one chunk
    if (totalLines <= 80) {
      const jsdocStart = findJSDocAbove(lines, startLine);
      const actualStart = jsdocStart || startLine;
      const content = extractLines(lines, actualStart, endLine);
      chunks.push(makeChunk(filePath, 'class', name, actualStart, endLine, content));
      claimedRanges.push([actualStart, endLine]);
    } else {
      // Split by methods
      const methods = node.body?.body || [];
      if (methods.length === 0) {
        const content = extractLines(lines, startLine, endLine);
        chunks.push(makeChunk(filePath, 'class', name, startLine, endLine, content));
        claimedRanges.push([startLine, endLine]);
      } else {
        // Class header (up to first method)
        const firstMethodLine = methods[0].loc.start.line;
        if (firstMethodLine > startLine) {
          const headerContent = extractLines(lines, startLine, firstMethodLine - 1);
          chunks.push(
            makeChunk(
              filePath,
              'class',
              `${name}.__header`,
              startLine,
              firstMethodLine - 1,
              headerContent
            )
          );
          claimedRanges.push([startLine, firstMethodLine - 1]);
        }

        // Each method as its own chunk
        for (const method of methods) {
          const mStart = method.loc.start.line;
          const mEnd = method.loc.end.line;
          const mName = method.key?.name || method.key?.value || 'anonymous_method';
          const jsdocStart = findJSDocAbove(lines, mStart);
          const actualStart = jsdocStart || mStart;
          const content = extractLines(lines, actualStart, mEnd);
          chunks.push(
            makeChunk(filePath, 'function', `${name}.${mName}`, actualStart, mEnd, content)
          );
          claimedRanges.push([actualStart, mEnd]);
        }
      }
    }
  }

  // ── Emit EXPORT chunks ──
  if (exportNodes.length > 0) {
    const startLine = Math.min(...exportNodes.map((n) => n.loc.start.line));
    const endLine = Math.max(...exportNodes.map((n) => n.loc.end.line));
    const content = extractLines(lines, startLine, endLine);
    chunks.push(makeChunk(filePath, 'export', 'exports', startLine, endLine, content));
    claimedRanges.push([startLine, endLine]);
  }

  // ── Emit TOP_LEVEL chunks for anything not claimed ──
  if (otherTopLevel.length > 0) {
    for (const node of otherTopLevel) {
      const startLine = node.loc.start.line;
      const endLine = node.loc.end.line;
      // Skip if this range is already claimed
      if (claimedRanges.some(([s, e]) => startLine >= s && endLine <= e)) continue;

      const content = extractLines(lines, startLine, endLine);
      if (content.trim().length > 10) {
        chunks.push(
          makeChunk(filePath, 'top_level', `statement_L${startLine}`, startLine, endLine, content)
        );
      }
    }
  }

  return chunks;
}

// ── Helpers ────────────────────────────────────────────────

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

function extractLines(lines, startLine, endLine) {
  // Lines are 1-indexed from acorn
  return lines.slice(startLine - 1, endLine).join('\n');
}

/**
 * Look backward from a given line to find a JSDoc block comment (/** ... * /)
 * Returns the start line of the JSDoc, or null if none found.
 */
function findJSDocAbove(lines, targetLine) {
  // Walk backwards from the line above targetLine
  let i = targetLine - 2; // 0-indexed, one line above
  if (i < 0) return null;

  // Skip blank lines
  while (i >= 0 && lines[i].trim() === '') i--;

  if (i < 0) return null;

  // Check if the line ends a block comment
  const trimmed = lines[i].trim();
  if (!trimmed.endsWith('*/')) return null;

  // Walk back to find the opening /**
  while (i >= 0) {
    if (lines[i].trim().startsWith('/**') || lines[i].trim().startsWith('/*')) {
      return i + 1; // Convert back to 1-indexed
    }
    i--;
  }

  return null;
}
