/* eslint-disable no-unused-vars */
/**
 * @file contextSnapshotAPI.js
 * @description Token-budget-aware context snapshot API for the AI Agent module.
 * Called by the Context Assembler in Phase 1 of Module 4 (AI Agent system).
 *
 * Usage:
 *   import { contextSnapshotAPI } from './contextSnapshotAPI.js';
 *   const snap = await contextSnapshotAPI.getContextSnapshot({
 *     files: ['/src/app.js'],
 *     maxChars: 6000,
 *     sourceModule: 'AI_AGENT'
 *   });
 */

import { memfs } from './memfsService.js';
import { blobStore } from './blobStore.js';
import { guardRead } from './fsGuard.js';
import { isLargeFile } from './largefile.js';

const DEFAULT_MAX_CHARS = 8_000;
const LARGE_FILE_NOTICE = '[File too large for context — excluded]';

class ContextSnapshotAPI {
  /**
   * Get a sanitised, token-budget-aware snapshot of requested files.
   * Automatically excludes large (binary) files.
   * @param {{
   *   files?: string[],     // Specific paths to include (defaults to all open files)
   *   maxChars?: number,    // Total char budget across all files
   *   includeTree?: boolean // Whether to prepend the file tree listing
   *   sourceModule?: string
   * }} opts
   * @returns {Promise<{
   *   contextString: string,
   *   includedFiles: string[],
   *   excludedFiles: string[],
   *   charsUsed: number
   * }>}
   */
  async getContextSnapshot({
    files,
    maxChars = DEFAULT_MAX_CHARS,
    includeTree = true,
    sourceModule = 'AI_AGENT',
  } = {}) {
    const targetPaths = files ?? memfs.readdir('/', { recursive: true });
    const sections = [];
    const includedFiles = [];
    const excludedFiles = [];
    let charsUsed = 0;

    // 1. File tree (lightweight, always included if requested)
    if (includeTree) {
      const allPaths = memfs
        .readdir('/', { recursive: true })
        .filter((p) => !p.includes('node_modules'));
      const treeSection = `## File Tree\n\`\`\`\n${allPaths.join('\n')}\n\`\`\``;
      sections.push(treeSection);
      charsUsed += treeSection.length;
    }

    // 2. Requested file contents (with budget enforcement)
    for (const path of targetPaths) {
      if (charsUsed >= maxChars) break;
      if (!memfs.exists(path)) continue;

      try {
        guardRead(path);

        const node = this._getFileNode(path);
        if (!node || node.type !== 'file') continue;

        // Skip large/binary files
        if (node.binary) {
          excludedFiles.push(path);
          continue;
        }

        const content = await memfs.readFile(path, 'utf8');

        if (isLargeFile(content)) {
          excludedFiles.push(path);
          continue;
        }

        // Token-budget trim
        const remaining = maxChars - charsUsed;
        const trimmed =
          content.length > remaining ? content.slice(0, remaining) + '\n… [truncated]' : content;

        const section = `## ${path}\n\`\`\`\n${trimmed}\n\`\`\``;
        sections.push(section);
        charsUsed += section.length;
        includedFiles.push(path);
      } catch {
        excludedFiles.push(path);
      }
    }

    return {
      contextString: sections.join('\n\n---\n\n'),
      includedFiles,
      excludedFiles,
      charsUsed,
    };
  }

  /**
   * Get the file tree as a plain string (for quick prompt prefixes).
   * @returns {string}
   */
  getFileTree() {
    return memfs
      .readdir('/', { recursive: true })
      .filter((p) => !p.includes('node_modules'))
      .join('\n');
  }

  _getFileNode(path) {
    const segments = path.split('/').filter(Boolean);
    let node = memfs.workspace.root;
    for (const seg of segments) {
      node = node.children?.get(seg);
      if (!node) return null;
    }
    return node;
  }
}

export const contextSnapshotAPI = new ContextSnapshotAPI();
