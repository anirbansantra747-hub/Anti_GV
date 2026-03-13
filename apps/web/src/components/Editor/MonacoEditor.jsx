/* eslint-disable no-unused-vars */
/**
 * @file MonacoEditor.jsx
 * @description Monaco Editor wrapper wired to the fileSystemAPI and editorStore.
 *
 * - Reads file content from fileSystemAPI when activeFile changes.
 * - Writes changes back via fileSystemAPI and marks the file dirty in editorStore.
 * - Ctrl+S triggers a manual persist notification (IDB save is already auto-debounced).
 * - Language is detected from file extension via getLanguageFromExtension.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore.js';
import { useFileSystemStore } from '../../stores/fileSystemStore.js';
import { useAgentStore } from '../../stores/agentStore.js';
import { fileSystemAPI } from '../../services/fileSystemAPI.js';
import { getLanguageFromExtension } from '@antigv/shared';
import LargeFileView from './LargeFileView.jsx';

// Shared content cache to avoid redundant reads
const contentCache = new Map(); // path → string

function getBasename(path) {
  return path ? path.split('/').pop() : '';
}

export default function MonacoEditor({ onContentLoad, onCursorPositionChange }) {
  const activeFile = useEditorStore((s) => s.activeFile);
  const markDirty = useEditorStore((s) => s.markDirty);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const currentPathRef = useRef(null);

  // Check if active file is binary/large — route to LargeFileView
  const treeData = useFileSystemStore((s) => s.treeData);
  const isBinaryFile = useCallback(() => {
    if (!activeFile || !treeData.length) return false;
    function findNode(nodes, path) {
      for (const n of nodes) {
        const nPath = n.id || `/${n.name}`;
        if (n.type === 'file' && n.id === path) return n;
        if (n.children) {
          const r = findNode(n.children, path);
          if (r) return r;
        }
      }
      return null;
    }
    const node = findNode(treeData, activeFile);
    return node?.binary === true;
  }, [activeFile, treeData]);

  // Detect language from file extension
  const language = activeFile
    ? getLanguageFromExtension(getBasename(activeFile)) || 'plaintext'
    : 'plaintext';

  // Load file content when activeFile changes
  useEffect(() => {
    if (!activeFile) return;

    if (contentCache.has(activeFile)) {
      if (editorRef.current) editorRef.current.setValue(contentCache.get(activeFile));
      return;
    }

    fileSystemAPI
      .readFile(activeFile)
      .then((content) => {
        contentCache.set(activeFile, content);
        if (editorRef.current && currentPathRef.current === activeFile) {
          editorRef.current.setValue(content);
        }
        onContentLoad?.(content);
      })
      .catch(() => {
        // New file — start empty
        contentCache.set(activeFile, '');
        if (editorRef.current && currentPathRef.current === activeFile) {
          editorRef.current.setValue('');
        }
      });
  }, [activeFile]);

  const handleEditorDidMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      currentPathRef.current = activeFile;

      // Expose monaco globally so contextService can read diagnostics
      if (typeof window !== 'undefined') {
        window.monaco = monaco;
        console.log('[MonacoEditor] ✅ window.monaco exposed for diagnostics');
      }

      // Load content if already cached
      if (activeFile && contentCache.has(activeFile)) {
        editor.setValue(contentCache.get(activeFile));
      }

      // Ctrl+S shortcut
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        console.log('[MonacoEditor] Ctrl+S — IDB auto-save in progress.');
      });

      // Ctrl+W — close active tab
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
        const { activeFile, closeTab } = useEditorStore.getState();
        if (activeFile) closeTab(activeFile);
      });

      // Ctrl+Tab — cycle to next tab
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, () => {
        const { openTabs, activeFile, openFile } = useEditorStore.getState();
        if (openTabs.length < 2) return;
        const idx = openTabs.indexOf(activeFile);
        const next = openTabs[(idx + 1) % openTabs.length];
        openFile(next);
      });

      // ── Cursor position tracking → StatusBar + editorStore ──────────
      editor.onDidChangeCursorPosition((e) => {
        const pos = e.position;

        // Get selected text (if any)
        const selection = editor.getSelection();
        let selected = '';
        if (selection && !selection.isEmpty()) {
          selected = editor.getModel()?.getValueInRange(selection) || '';
        }

        // Feed StatusBar (existing prop callback)
        onCursorPositionChange?.({
          lineNumber: pos.lineNumber,
          column: pos.column,
        });

        // Feed editorStore → contextService (NEW)
        useEditorStore.getState().setCursor({
          line: pos.lineNumber,
          column: pos.column,
          selected,
        });
      });

      console.log('[MonacoEditor] ✅ Cursor tracking wired to editorStore.setCursor()');
    },
    [activeFile]
  );

  const handleChange = useCallback(
    (newValue) => {
      if (!activeFile || newValue === undefined) return;
      contentCache.set(activeFile, newValue);
      markDirty(activeFile);

      // Write to Tier 1 (triggers debounced IDB save via eventBus)
      fileSystemAPI
        .writeFile(activeFile, newValue, { sourceModule: 'UI' })
        .catch((err) => console.error('[MonacoEditor] Write failed:', err));
    },
    [activeFile, markDirty]
  );

  // Keep currentPathRef in sync for the mount callback
  useEffect(() => {
    currentPathRef.current = activeFile;
    // When file switches, reload the editor value
    if (editorRef.current && activeFile) {
      const cached = contentCache.get(activeFile);
      if (cached !== undefined) editorRef.current.setValue(cached);
    }
  }, [activeFile]);

  // Add socket for "Open Folder"
  const socket = useAgentStore((s) => s.socket);

  if (!activeFile) {
    if (!treeData || treeData.length === 0) {
      // No folder opened yet — show VS Code style big button
      return (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#334155',
            gap: 20,
          }}
        >
          <div style={{ fontSize: 64, color: '#1e293b' }}>📂</div>
          <h2 style={{ fontSize: 24, margin: 0, color: '#94a3b8', fontWeight: 500 }}>
            Anti_GV IDE
          </h2>
          <p style={{ fontSize: 14, margin: 0, color: 'var(--text-muted)' }}>
            You have not yet opened a folder.
          </p>
          <button
            onClick={() => socket?.emit('fs:pick_folder')}
            style={{
              background: '#0e639c',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '12px 24px',
              fontSize: '16px',
              cursor: 'pointer',
              fontFamily: 'var(--font-ui)',
              transition: 'background 0.1s',
              marginTop: '10px',
            }}
            onMouseEnter={(e) => (e.target.style.background = '#1177bb')}
            onMouseLeave={(e) => (e.target.style.background = '#0e639c')}
          >
            Open Folder
          </button>
        </div>
      );
    }

    // Folder is opened, but no active file
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#334155',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 48 }}>📄</div>
        <p style={{ fontSize: 14, margin: 0, color: 'var(--text-muted)' }}>
          Open a file from the file tree
        </p>
        <p style={{ fontSize: 12, color: '#1e293b', margin: 0 }}>
          or press{' '}
          <kbd
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: 3,
              padding: '1px 5px',
              color: '#64748b',
              fontSize: 11,
            }}
          >
            Ctrl+P
          </kbd>{' '}
          to quick-open
        </p>
      </div>
    );
  }

  // Binary / large files bypass Monaco
  if (isBinaryFile()) {
    return <LargeFileView path={activeFile} />;
  }

  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"
      onChange={handleChange}
      onMount={handleEditorDidMount}
      options={{
        fontSize: 14,
        fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
        fontLigatures: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
        padding: { top: 12 },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        renderLineHighlight: 'gutter',
        lineNumbers: 'on',
        glyphMargin: false,
        folding: true,
        automaticLayout: true,
      }}
    />
  );
}
