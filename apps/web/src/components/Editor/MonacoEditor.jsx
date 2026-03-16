/* eslint-disable no-unused-vars */
/**
 * @file MonacoEditor.jsx
 * @description Monaco Editor wrapper with stronger empty states and local-save support.
 */

import React, { useEffect, useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore } from '../../stores/editorStore.js';
import { useFileSystemStore } from '../../stores/fileSystemStore.js';
import { useAgentStore } from '../../stores/agentStore.js';
import { useSettingsStore } from '../../stores/settingsStore.js';
import { fileSystemAPI } from '../../services/fileSystemAPI.js';
import { bus, Events } from '../../services/eventBus.js';
import { getLanguageFromExtension } from '@antigv/shared';
import LargeFileView from './LargeFileView.jsx';
import { openFilesViaInput } from '../../services/localFileService.js';
import { workspaceAccessService } from '../../services/workspaceAccessService.js';
import InlineDiffReview from './InlineDiffReview.jsx';

const contentCache = new Map();

function getBasename(path) {
  return path ? path.split('/').pop() : '';
}

function InfoPanel({ eyebrow, title, detail, meta = [], actions = null }) {
  return (
    <div
      style={{
        flex: 1,
        display: 'grid',
        placeItems: 'center',
        padding: '32px',
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.02), transparent 18%), rgba(8,11,16,0.82)',
      }}
    >
      <div
        style={{
          width: 'min(760px, 100%)',
          border: '1px solid var(--panel-border)',
          background: 'rgba(17,21,27,0.96)',
          boxShadow: '8px 8px 0 rgba(0,0,0,0.72)',
          padding: '24px',
          display: 'grid',
          gap: 18,
        }}
      >
        <div style={{ display: 'grid', gap: 8 }}>
          <span
            style={{
              fontSize: 11,
              color: 'var(--accent)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            {eyebrow}
          </span>
          <h2
            style={{
              margin: 0,
              fontSize: 'clamp(1.8rem, 4vw, 3rem)',
              lineHeight: 0.95,
              letterSpacing: '-0.05em',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h2>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', maxWidth: 560 }}>
            {detail}
          </p>
        </div>

        {meta.length ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10,
            }}
          >
            {meta.map((item) => (
              <div
                key={item.label}
                style={{
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '12px 14px',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                  }}
                >
                  {item.label}
                </span>
                <strong style={{ color: 'var(--text-primary)', fontSize: 13 }}>{item.value}</strong>
              </div>
            ))}
          </div>
        ) : null}

        {actions}
      </div>
    </div>
  );
}

export default function MonacoEditor({ onContentLoad, onCursorPositionChange }) {
  const activeFile = useEditorStore((s) => s.activeFile);
  const openTabs = useEditorStore((s) => s.openTabs);
  const markDirty = useEditorStore((s) => s.markDirty);
  const editorFontSize = useSettingsStore((s) => s.editorFontSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const showLineNumbers = useSettingsStore((s) => s.showLineNumbers);
  const editorRef = useRef(null);
  const currentPathRef = useRef(null);
  const workspaceState = useFileSystemStore((s) => s.workspaceState);
  const activeTransactionId = useAgentStore((s) => s.activeTransactionId);

  const treeData = useFileSystemStore((s) => s.treeData);

  const isBinaryFile = useCallback(() => {
    if (!activeFile || !treeData.length) return false;

    function findNode(nodes, path) {
      for (const node of nodes) {
        if (node.type === 'file' && node.id === path) return node;
        if (node.children) {
          const found = findNode(node.children, path);
          if (found) return found;
        }
      }
      return null;
    }

    return findNode(treeData, activeFile)?.binary === true;
  }, [activeFile, treeData]);

  const language = activeFile
    ? getLanguageFromExtension(getBasename(activeFile)) || 'plaintext'
    : 'plaintext';

  useEffect(() => {
    if (!activeFile) return;

    const isHydrating =
      !treeData ||
      treeData.length === 0 ||
      (treeData.length === 1 && treeData[0].children?.length === 0);

    if (isHydrating && !contentCache.has(activeFile)) return;

    const loadFromSocket = (path) => {
      if (!socket) return;
      socket.emit('fs:read', { path }, (response) => {
        const real = response?.success && response.content != null ? response.content : '';
        contentCache.set(path, real);
        // Hydrate memfs with real content so future reads + diffs work (best-effort, may fail if AI_PENDING)
        if (real) {
          fileSystemAPI.writeFile(path, real, { sourceModule: 'UI', silent: true }).catch(() => {});
        }
        if (editorRef.current && currentPathRef.current === path) {
          editorRef.current.setValue(real);
        }
        onContentLoad?.(real);
      });
    };

    fileSystemAPI
      .readFile(activeFile)
      .then((content) => {
        // Empty content + not yet cached = stub file — fetch real content from server
        if (content === '' && !contentCache.has(activeFile)) {
          loadFromSocket(activeFile);
          return;
        }
        contentCache.set(activeFile, content);
        if (editorRef.current && currentPathRef.current === activeFile) {
          if (editorRef.current.getValue() !== content) {
            editorRef.current.setValue(content);
          }
        }
        onContentLoad?.(content);
      })
      .catch(() => {
        // File missing from memfs entirely — try server directly
        if (!contentCache.has(activeFile)) {
          loadFromSocket(activeFile);
          return;
        }
        contentCache.set(activeFile, '');
        if (editorRef.current && currentPathRef.current === activeFile) {
          if (editorRef.current.getValue() !== '') {
            editorRef.current.setValue('');
          }
        }
      });
  }, [activeFile, onContentLoad, treeData]);

  // Clear editor content cache on workspace reset
  useEffect(() => {
    return bus.on(Events.WS_RESET, () => {
      contentCache.clear();
    });
  }, []);

  useEffect(() => {
    return bus.on(Events.FS_MUTATED, (payload) => {
      if (payload?.source === 'commit') {
        contentCache.clear();
      }
    });
  }, []);

  const handleEditorDidMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;
      currentPathRef.current = activeFile;

      // Expose monaco globally so contextService can read diagnostics
      if (typeof window !== 'undefined') {
        window.monaco = monaco;
        console.log('[MonacoEditor] ✅ window.monaco exposed for diagnostics');
      }

      if (activeFile && contentCache.has(activeFile)) {
        editor.setValue(contentCache.get(activeFile));
      }

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        const { activeFile: filePath, clearDirty } = useEditorStore.getState();
        const { socket } = useAgentStore.getState();
        if (!filePath) return;

        workspaceAccessService
          .saveFile(filePath, editor.getValue(), socket)
          .then(() => clearDirty(filePath))
          .catch((error) => console.error('[MonacoEditor] Save failed:', error.message));
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyW, () => {
        const { activeFile: filePath, closeTab } = useEditorStore.getState();
        if (filePath) closeTab(filePath);
      });

      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, () => {
        const { openTabs: tabs, activeFile: filePath, openFile } = useEditorStore.getState();
        if (tabs.length < 2) return;
        const idx = tabs.indexOf(filePath);
        openFile(tabs[(idx + 1) % tabs.length]);
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
    [activeFile, onCursorPositionChange]
  );

  const handleChange = useCallback(
    (newValue) => {
      if (!activeFile || newValue === undefined) return;
      contentCache.set(activeFile, newValue);
      markDirty(activeFile);
      fileSystemAPI
        .writeFile(activeFile, newValue, { sourceModule: 'UI' })
        .catch((err) => console.error('[MonacoEditor] Write failed:', err));
    },
    [activeFile, markDirty]
  );

  useEffect(() => {
    currentPathRef.current = activeFile;
    if (editorRef.current && activeFile) {
      const cached = contentCache.get(activeFile);
      if (cached !== undefined && editorRef.current.getValue() !== cached) {
        editorRef.current.setValue(cached);
      }
    }
  }, [activeFile]);

  // Add socket for "Open Folder"
  const socket = useAgentStore((s) => s.socket);

  if (workspaceState === 'DIFF_REVIEW' && activeTransactionId) {
    return <InlineDiffReview txId={activeTransactionId} />;
  }

  if (!activeFile) {
    const isEmptyWorkspace =
      !treeData ||
      treeData.length === 0 ||
      (treeData.length === 1 && (treeData[0].children?.length ?? 0) === 0);

    if (isEmptyWorkspace) {
      return (
        <InfoPanel
          eyebrow="Workspace"
          title="Open a folder to start coding."
          detail="The editor is ready, but there is no workspace mounted yet. Open a folder or import files and the first readable file will be focused automatically."
          meta={[
            { label: 'Save target', value: 'No folder linked' },
            { label: 'Quick open', value: 'Ctrl+P' },
          ]}
          actions={
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="brutalist-button"
                onClick={() => {
                  const socket = useAgentStore.getState().socket;
                  if (!socket) {
                    console.error('[MonacoEditor] Socket not connected');
                    return;
                  }
                  console.log('[MonacoEditor] Emitting fs:pick_folder to open folder picker');
                  socket.emit('fs:pick_folder', {}, (response) => {
                    if (response?.success) {
                      console.log(`[MonacoEditor] Folder opened successfully: ${response.newRoot}`);
                    } else if (!response?.canceled) {
                      console.error('[MonacoEditor] Failed to open folder:', response?.error);
                    }
                  });
                }}
              >
                Open Folder
              </button>
              <button
                className="brutalist-button ghost"
                onClick={() =>
                  openFilesViaInput({ multiple: true }).catch((error) =>
                    console.error('[MonacoEditor] Open files import failed:', error)
                  )
                }
              >
                Import Files
              </button>
            </div>
          }
        />
      );
    }

    return (
      <InfoPanel
        eyebrow="Editor"
        title="Pick a file to inspect or edit."
        detail="The workspace is loaded. Use the file tree, quick open, or upload more files to bring code into focus."
        meta={[
          { label: 'Open tabs', value: String(openTabs.length) },
          { label: 'Search', value: 'Ctrl+P' },
          { label: 'State', value: 'Awaiting active file' },
        ]}
      />
    );
  }

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
        fontSize: editorFontSize,
        fontFamily: '"IBM Plex Mono", "JetBrains Mono", "Cascadia Code", monospace',
        fontLigatures: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap,
        tabSize: 2,
        padding: { top: 16 },
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        renderLineHighlight: 'gutter',
        lineNumbers: showLineNumbers ? 'on' : 'off',
        glyphMargin: false,
        folding: true,
        automaticLayout: true,
        overviewRulerBorder: false,
        scrollbar: {
          verticalScrollbarSize: 10,
          horizontalScrollbarSize: 10,
        },
      }}
    />
  );
}
