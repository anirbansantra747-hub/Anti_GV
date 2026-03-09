/* eslint-disable no-unused-vars */
/**
 * @file DiffViewer.jsx
 * @description Monaco DiffEditor wrapper for reviewing AI-proposed Shadow Tree patches.
 *
 * Usage: Rendered when the workspace enters the DIFF_REVIEW state.
 * Accepts a txId and a list of patched file paths.
 * For each file, renders a side-by-side Monaco DiffEditor (original vs proposed).
 * User must explicitly Accept or Reject each diff for the commit to proceed.
 */

import React, { useState, useEffect, useRef } from 'react';
import { diffService } from '../../services/diffService.js';
import { bus, Events } from '../../services/eventBus.js';

/**
 * @param {{
 *   txId: string,
 *   patchedPaths: string[],
 *   onClose: () => void
 * }} props
 */
export function DiffViewer({ txId, patchedPaths, onClose }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [diffs, setDiffs] = useState({}); // { [path]: { original, proposed } }
  const [decisions, setDecisions] = useState({}); // { [path]: 'accept' | 'reject' }
  const [isLoading, setIsLoading] = useState(true);

  const editorRef = useRef(null);
  const diffEditorRef = useRef(null);

  // Load all diffs upfront
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = {};
      for (const path of patchedPaths) {
        results[path] = await diffService.getDiff(txId, path);
      }
      if (!cancelled) setDiffs(results);
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [txId, patchedPaths]);

  // Mount/update Monaco DiffEditor when active file changes
  useEffect(() => {
    const container = editorRef.current;
    if (!container || isLoading) return;

    const currentPath = patchedPaths[currentIndex];
    const { original = '', proposed = '' } = diffs[currentPath] ?? {};

    if (!window.monaco) return; // Monaco not loaded yet

    if (diffEditorRef.current) {
      diffEditorRef.current.dispose();
    }

    diffEditorRef.current = window.monaco.editor.createDiffEditor(container, {
      readOnly: true,
      renderSideBySide: true,
      enableSplitViewResizing: false,
      theme: 'vs-dark',
      fontSize: 13,
      minimap: { enabled: false },
    });

    const lang = guessLanguage(currentPath);

    diffEditorRef.current.setModel({
      original: window.monaco.editor.createModel(original, lang),
      modified: window.monaco.editor.createModel(proposed, lang),
    });

    return () => {
      diffEditorRef.current?.dispose();
      diffEditorRef.current = null;
    };
  }, [currentIndex, diffs, isLoading]);

  const currentPath = patchedPaths[currentIndex];
  const allDecided = patchedPaths.every((p) => decisions[p]);

  function decide(path, choice) {
    setDecisions((prev) => ({ ...prev, [path]: choice }));
  }

  async function handleFinalCommit() {
    // Reject any files the user marked as "reject" by rolling them back
    const rejectedPaths = patchedPaths.filter((p) => decisions[p] === 'reject');
    if (rejectedPaths.length === patchedPaths.length) {
      // All rejected — just rollback the whole transaction
      diffService.rollback(txId);
      bus.emit(Events.AI_REJECT_DIFF);
      onClose();
      return;
    }

    // Commit accepted diffs
    await diffService.commit(txId);
    bus.emit(Events.AI_APPROVE_DIFF);
    onClose();
  }

  if (isLoading) {
    return (
      <div className="diff-viewer-overlay" style={styles.overlay}>
        <div style={styles.loadingBox}>
          <p style={{ color: '#60a5fa' }}>Preparing diff view…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>🔍 Review AI Changes</h2>
          <span style={styles.subtitle}>
            {patchedPaths.length} file{patchedPaths.length !== 1 ? 's' : ''} modified
          </span>
        </div>

        {/* File Tabs */}
        <div style={styles.fileTabs}>
          {patchedPaths.map((path, i) => {
            const d = decisions[path];
            const label = d === 'accept' ? '✅' : d === 'reject' ? '❌' : '⏳';
            return (
              <button
                key={path}
                style={{
                  ...styles.fileTab,
                  ...(i === currentIndex ? styles.fileTabActive : {}),
                }}
                onClick={() => setCurrentIndex(i)}
              >
                {label} {path.split('/').pop()}
              </button>
            );
          })}
        </div>

        {/* Monaco Diff Pane */}
        <div ref={editorRef} style={styles.monacoPane} />

        {/* Per-file Accept/Reject */}
        <div style={styles.fileActions}>
          <button
            style={{ ...styles.btn, ...styles.btnAccept }}
            onClick={() => decide(currentPath, 'accept')}
            disabled={!!decisions[currentPath]}
          >
            ✅ Accept
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnReject }}
            onClick={() => decide(currentPath, 'reject')}
            disabled={!!decisions[currentPath]}
          >
            ❌ Reject
          </button>
        </div>

        {/* Final action */}
        <div style={styles.footer}>
          {allDecided && (
            <button style={{ ...styles.btn, ...styles.btnCommit }} onClick={handleFinalCommit}>
              Apply {patchedPaths.filter((p) => decisions[p] === 'accept').length} accepted
              change(s)
            </button>
          )}
          <button
            style={{ ...styles.btn, ...styles.btnCancel }}
            onClick={() => {
              diffService.rollback(txId);
              bus.emit(Events.AI_REJECT_DIFF);
              onClose();
            }}
          >
            Cancel All
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function guessLanguage(path) {
  const ext = path.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    css: 'css',
    html: 'html',
    json: 'json',
    md: 'markdown',
    sh: 'shell',
    rs: 'rust',
    go: 'go',
    java: 'java',
  };
  return map[ext] ?? 'plaintext';
}

// ── Inline styles (dark IDE themed) ───────────────────────────────────────────

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  loadingBox: {
    background: '#1e1e2e',
    borderRadius: 12,
    padding: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: {
    background: '#1e1e2e',
    borderRadius: 12,
    width: '90vw',
    maxWidth: 1200,
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
  header: {
    padding: '16px 24px 12px',
    borderBottom: '1px solid #2d2d44',
    display: 'flex',
    alignItems: 'baseline',
    gap: 12,
  },
  title: { margin: 0, color: '#e2e8f0', fontSize: 18, fontWeight: 700 },
  subtitle: { color: '#94a3b8', fontSize: 13 },
  fileTabs: {
    display: 'flex',
    gap: 6,
    padding: '10px 16px',
    background: '#161622',
    borderBottom: '1px solid #2d2d44',
    overflowX: 'auto',
  },
  fileTab: {
    padding: '5px 12px',
    borderRadius: 6,
    border: '1px solid #3d3d5c',
    background: '#222236',
    color: '#94a3b8',
    cursor: 'pointer',
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
    whiteSpace: 'nowrap',
  },
  fileTabActive: { background: '#3b82f6', color: '#fff', borderColor: '#3b82f6' },
  monacoPane: { flex: 1, minHeight: 0 },
  fileActions: {
    display: 'flex',
    gap: 10,
    padding: '10px 16px',
    borderTop: '1px solid #2d2d44',
    background: '#161622',
  },
  footer: {
    display: 'flex',
    gap: 10,
    padding: '12px 16px',
    borderTop: '1px solid #2d2d44',
    background: '#12121c',
    justifyContent: 'flex-end',
  },
  btn: {
    padding: '8px 18px',
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    transition: 'opacity 0.15s',
  },
  btnAccept: { background: '#22c55e', color: '#fff' },
  btnReject: { background: '#ef4444', color: '#fff' },
  btnCommit: { background: '#3b82f6', color: '#fff' },
  btnCancel: { background: '#374151', color: '#d1d5db' },
};
