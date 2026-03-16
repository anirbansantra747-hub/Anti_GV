/**
 * @file contextService.js
 * @description Builds a focused context window of source code for the LLM Agent.
 *
 * SIGNALS INCLUDED:
 *   1. File Tree              (light structural context)
 *   2. Active File            (highest priority — always included)
 *   3. Open Tabs              (next priority — up to MAX_CONTEXT_FILES)
 *   4. Cursor Position        (line/column/selection from editorStore)
 *   5. Terminal Output        (last N lines from the terminal buffer)
 *   6. Chat History           (last 6 user+assistant messages from agentStore)
 *   7. Monaco Diagnostics     (lint/type errors from the Monaco model markers)
 */

import { fileSystemAPI } from './fileSystemAPI.js';

/** Max characters per file to include in context (protect token budget) */
const MAX_CHARS_PER_FILE = 12_000;

/** Max number of additional files to include beyond the active file */
const MAX_CONTEXT_FILES = 5;

/** Max terminal lines to include in context */
const MAX_TERMINAL_LINES = 50;

/** Max chat messages (user + assistant) to include */
const MAX_CHAT_MESSAGES = 6;

class ContextService {
  /**
   * Internal: rolling terminal output buffer (last N lines).
   * Populated by the Terminal component via appendTerminalOutput().
   * @type {string[]}
   */
  _terminalLines = [];

  /**
   * Append a line of terminal output to the rolling buffer.
   * Call this from the Terminal/xterm output handler.
   * @param {string} line
   */
  appendTerminalOutput(line) {
    // Strip ANSI escape codes so the LLM gets plain text
    const clean = line.replace(/\x1B\[[0-9;]*[mGKHF]/g, '').trimEnd();
    if (!clean) return;
    this._terminalLines.push(clean);
    // Keep only the last MAX_TERMINAL_LINES lines
    if (this._terminalLines.length > MAX_TERMINAL_LINES * 2) {
      this._terminalLines = this._terminalLines.slice(-MAX_TERMINAL_LINES);
    }
  }

  /**
   * Retrieve the last N lines of terminal output as a string.
   * @returns {string}
   */
  _getTerminalSnippet() {
    const tail = this._terminalLines.slice(-MAX_TERMINAL_LINES);
    return tail.join('\n');
  }

  /**
   * Read Monaco model markers (lint/type errors) for the active file.
   * Returns an array of diagnostic strings.
   * @param {string | null} activeFile
   * @returns {string[]}
   */
  _getMonacoDiagnostics(activeFile) {
    try {
      if (!activeFile || typeof window === 'undefined' || !window.monaco) return [];
      const models = window.monaco.editor.getModels();
      const model = models.find(
        (m) => m.uri.path === activeFile || m.uri.toString().endsWith(activeFile)
      );
      if (!model) return [];
      const markers = window.monaco.editor.getModelMarkers({ resource: model.uri });
      return markers.map(
        (m) => `[${m.severity === 8 ? 'ERROR' : 'WARN'}] Line ${m.startLineNumber}: ${m.message}`
      );
    } catch {
      return [];
    }
  }

  /**
   * Read the last MAX_CHAT_MESSAGES messages from agentStore.
   * Imported lazily to avoid circular deps.
   * @returns {{ role: string, content: string }[]}
   */
  _getChatHistory() {
    try {
      // Dynamic import already resolved — agentStore is a singleton
      // We can't await here (sync context), so we access the Zustand store directly
      // via the global store instance (the module is already loaded by now)
      const { useAgentStore } = window.__agentStoreRef || {};
      if (!useAgentStore) return [];
      const messages = useAgentStore.getState().messages || [];
      return messages
        .filter((m) => m.type === 'text' && m.content)
        .slice(-MAX_CHAT_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content }));
    } catch {
      return [];
    }
  }

  /**
   * Build a full context string for a given prompt and active file.
   * @param {{
   *   activeFile: string | null,
   *   openTabs: string[],
   *   userPrompt: string,
   *   cursorPosition?: { line: number, column: number, selected: string }
   * }} options
   * @returns {Promise<{ contextString: string, fileTree: string[], includedFiles: string[] }>}
   */
  async buildContext({ activeFile, openTabs, userPrompt, cursorPosition }) {
    const sections = [];
    const includedFiles = [];

    console.group('[ContextService] buildContext()');
    console.log('  activeFile    :', activeFile);
    console.log('  openTabs      :', openTabs);
    console.log('  cursorPosition:', cursorPosition);

    // ── 1. File Tree ────────────────────────────────────────────────────────
    const allPaths = fileSystemAPI.listFiles('/');
    const fileTree = allPaths.filter((p) => !p.includes('node_modules'));
    sections.push(`## File Tree\n\`\`\`\n${fileTree.join('\n')}\n\`\`\``);
    console.log('  fileTree items:', fileTree.length);

    // ── 2. Active File ───────────────────────────────────────────────────────
    if (activeFile && fileSystemAPI.existsFile(activeFile)) {
      const content = await this._readSafe(activeFile);
      sections.push(`## Active File: ${activeFile}\n\`\`\`\n${content}\n\`\`\``);
      includedFiles.push(activeFile);
      console.log('  ✅ Active file included:', activeFile, `(${content.length} chars)`);
    } else {
      console.warn('  ⚠️  No active file or file not found in memfs');
    }

    // ── 3. Open Tabs ─────────────────────────────────────────────────────────
    const otherTabs = openTabs
      .filter((p) => p !== activeFile && fileSystemAPI.existsFile(p))
      .slice(0, MAX_CONTEXT_FILES - includedFiles.length);

    for (const tab of otherTabs) {
      const content = await this._readSafe(tab);
      sections.push(`## Open Tab: ${tab}\n\`\`\`\n${content}\n\`\`\``);
      includedFiles.push(tab);
    }
    console.log('  ✅ Open tabs included:', otherTabs.length);

    // ── 4. Cursor Position ────────────────────────────────────────────────────
    if (cursorPosition && activeFile) {
      const { line, column, selected } = cursorPosition;
      let cursorSection = `## Cursor Context\nFile: ${activeFile} | Line: ${line} | Column: ${column}`;
      if (selected && selected.trim().length > 0) {
        cursorSection += `\n\nSelected Text:\n\`\`\`\n${selected.slice(0, 500)}\n\`\`\``;
      }
      sections.push(cursorSection);
      console.log(`  ✅ Cursor: L${line}:C${column}, selected=${selected.length} chars`);
    }

    // ── 5. Terminal Output ────────────────────────────────────────────────────
    const terminalOutput = this._getTerminalSnippet();
    if (terminalOutput.trim().length > 0) {
      sections.push(
        `## Terminal Output (last ${MAX_TERMINAL_LINES} lines)\n\`\`\`\n${terminalOutput}\n\`\`\``
      );
      console.log(`  ✅ Terminal output: ${this._terminalLines.length} lines`);
    } else {
      console.log('  ℹ️  Terminal output: empty');
    }

    // ── 6. Chat History ────────────────────────────────────────────────────────
    const chatHistory = this._getChatHistory();
    if (chatHistory.length > 0) {
      const chatFormatted = chatHistory
        .map((m) => `**${m.role === 'user' ? 'User' : 'Assistant'}:** ${m.content}`)
        .join('\n\n');
      sections.push(
        `## Recent Conversation (last ${chatHistory.length} messages)\n${chatFormatted}`
      );
      console.log(`  ✅ Chat history: ${chatHistory.length} messages`);
    } else {
      console.log('  ℹ️  Chat history: empty');
    }

    // ── 7. Monaco Diagnostics (lint errors) ────────────────────────────────────
    const diagnostics = this._getMonacoDiagnostics(activeFile);
    if (diagnostics.length > 0) {
      sections.push(`## Editor Diagnostics (Lint/Type Errors)\n${diagnostics.join('\n')}`);
      console.log(`  ✅ Monaco diagnostics: ${diagnostics.length} issues`);
    } else {
      console.log('  ℹ️  Monaco diagnostics: none');
    }

    // ── Assemble ────────────────────────────────────────────────────────────────
    const contextString = [`## User Prompt\n${userPrompt}`, ...sections].join('\n\n---\n\n');

    console.log('  📦 Final context length:', contextString.length, 'chars');
    console.groupEnd();

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
      if (fileSystemAPI.existsFile(path)) {
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
      const content = await fileSystemAPI.readFile(path);
      if (typeof content !== 'string') return `[Binary file — ${path}]`;
      if (content.length > MAX_CHARS_PER_FILE) {
        return (
          content.slice(0, MAX_CHARS_PER_FILE) + `\n\n… [truncated — ${content.length} chars total]`
        );
      }
      return content;
    } catch {
      return `[Could not read file: ${path}]`;
    }
  }
}

export const contextService = new ContextService();
