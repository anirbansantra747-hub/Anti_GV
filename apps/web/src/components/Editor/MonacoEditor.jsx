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
  const markDirty  = useEditorStore((s) => s.markDirty);
  const editorRef  = useRef(null);
  const monacoRef  = useRef(null);
  const currentPathRef = useRef(null);

  // Check if active file is binary/large — route to LargeFileView
  const treeData = useFileSystemStore((s) => s.treeData);
  const isBinaryFile = useCallback(() => {
    if (!activeFile || !treeData.length) return false;
    function findNode(nodes, path) {
      for (const n of nodes) {
        const nPath = n.id || `/${n.name}`;
        if (n.type === 'file' && n.id === path) return n;
        if (n.children) { const r = findNode(n.children, path); if (r) return r; }
      }
      return null;
    }
    const node = findNode(treeData, activeFile);
    return node?.binary === true;
  }, [activeFile, treeData]);

  // Detect language from file extension
  const language = activeFile
    ? (getLanguageFromExtension(getBasename(activeFile)) || 'plaintext')
    : 'plaintext';

  // Load file content when activeFile changes
  useEffect(() => {
    if (!activeFile) return;

    if (contentCache.has(activeFile)) {
      if (editorRef.current) editorRef.current.setValue(contentCache.get(activeFile));
      return;
    }

    fileSystemAPI.readFile(activeFile)
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

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current  = editor;
    monacoRef.current  = monaco;
    currentPathRef.current = activeFile;

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

    // Cursor position tracking → StatusBar
    editor.onDidChangeCursorPosition((e) => {
      onCursorPositionChange?.({
        lineNumber: e.position.lineNumber,
        column: e.position.column,
      });
    });
  }, [activeFile]);

  const handleChange = useCallback((newValue) => {
    if (!activeFile || newValue === undefined) return;
    contentCache.set(activeFile, newValue);
    markDirty(activeFile);

    // Write to Tier 1 (triggers debounced IDB save via eventBus)
    fileSystemAPI.writeFile(activeFile, newValue, { sourceModule: 'UI' })
      .catch((err) => console.error('[MonacoEditor] Write failed:', err));
  }, [activeFile, markDirty]);

  // Keep currentPathRef in sync for the mount callback
  useEffect(() => {
    currentPathRef.current = activeFile;
    // When file switches, reload the editor value
    if (editorRef.current && activeFile) {
      const cached = contentCache.get(activeFile);
      if (cached !== undefined) editorRef.current.setValue(cached);
    }
  }, [activeFile]);

  if (!activeFile) {
    return (
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        color: '#334155', gap: 12,
      }}>
        <div style={{ fontSize: 48 }}>📄</div>
        <p style={{ fontSize: 14, margin: 0, color: 'var(--text-muted)' }}>Open a file from the file tree</p>
        <p style={{ fontSize: 12, color: '#1e293b', margin: 0 }}>
          or press{' '}
          <kbd style={{
            background: '#1e293b', border: '1px solid #334155',
            borderRadius: 3, padding: '1px 5px', color: '#64748b', fontSize: 11
          }}>Ctrl+P</kbd>{' '}to quick-open
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
