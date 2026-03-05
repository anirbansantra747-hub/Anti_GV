/**
 * @file contextService.js
 * @description Builds a focused context window of source code for the LLM Agent.
 * Gathers the active file, open tabs, and related file paths from the Tier 1 filesystem.
 * Acts as the bridge between the FileSystem and the AI module.
 */

import { memfs } from './memfsService.js';
import { blobStore } from './blobStore.js';

/** Max characters per file to include in context (protect token budget) */
const MAX_CHARS_PER_FILE = 12_000;

/** Max number of additional files to include beyond the active file */
const MAX_CONTEXT_FILES = 5;

class ContextService {
  /**
   * Build a full context string for a given prompt and active file.
   * @param {{
   *   activeFile: string | null,
   *   openTabs: string[],
   *   userPrompt: string
   * }} options
   * @returns {Promise<{ contextString: string, fileTree: string[], includedFiles: string[] }>}
   */
  async buildContext({ activeFile, openTabs, userPrompt }) {
    const sections = [];
    const includedFiles = [];

    // 1. File Tree (light structural context)
    const allPaths = memfs.readdirSync('/', { recursive: true });
    const fileTree = allPaths.filter((p) => !p.includes('node_modules'));
    sections.push(`## File Tree\n\`\`\`\n${fileTree.join('\n')}\n\`\`\``);

    // 2. Active File (highest priority — always include)
    if (activeFile && memfs.existsSync(activeFile)) {
      const content = await this._readSafe(activeFile);
      sections.push(`## Active File: ${activeFile}\n\`\`\`\n${content}\n\`\`\``);
      includedFiles.push(activeFile);
    }

    // 3. Other open tabs (excluding the active file)
    const otherTabs = openTabs
      .filter((p) => p !== activeFile && memfs.existsSync(p))
      .slice(0, MAX_CONTEXT_FILES - includedFiles.length);

    for (const tab of otherTabs) {
      const content = await this._readSafe(tab);
      sections.push(`## Open Tab: ${tab}\n\`\`\`\n${content}\n\`\`\``);
      includedFiles.push(tab);
    }

    // 4. Assemble
    const contextString = [
      `## User Prompt\n${userPrompt}`,
      ...sections,
    ].join('\n\n---\n\n');

    return { contextString, fileTree, includedFiles };
  }

  /**
   * Get all file content as a flat map for AI patch validation.
   * @param {string[]} paths
   * @returns {Promise<Record<string, string>>}
   */
  async resolveFiles(paths) {
    const result = {};
    for (const path of paths) {
      if (memfs.existsSync(path)) {
        result[path] = await this._readSafe(path);
      }
    }
    return result;
  }

  /**
   * Safely read a file, handling large/binary files gracefully.
   * @param {string} path
   * @returns {Promise<string>}
   */
  async _readSafe(path) {
    try {
      const content = await memfs.readFileSync(path, 'utf8');
      if (typeof content !== 'string') return `[Binary file — ${path}]`;
      if (content.length > MAX_CHARS_PER_FILE) {
        return content.slice(0, MAX_CHARS_PER_FILE) + `\n\n… [truncated — ${content.length} chars total]`;
      }
      return content;
    } catch {
      return `[Could not read file: ${path}]`;
    }
  }
}

export const contextService = new ContextService();
