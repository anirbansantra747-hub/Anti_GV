/* eslint-disable no-unused-vars */
/**
 * @file InlineDiffReview.jsx
 * @description Embedded diff review for AI-proposed changes.
 * Renders inside the main editor pane with per-file accept/reject controls.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { diffService } from '../../services/diffService.js';
import { useAgentStore } from '../../stores/agentStore.js';

export default function InlineDiffReview({ txId }) {
  const { finalizeDiff, rejectTransaction } = useAgentStore();
  const editorRef = useRef(null);
  const diffEditorRef = useRef(null);
  const [diffs, setDiffs] = useState({});
  const [decisions, setDecisions] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const patchedPaths = useMemo(() => diffService.getTransaction(txId)?.patchedPaths || [], [txId]);

  // Load diffs upfront
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const results = {};
      for (const path of patchedPaths) {
        results[path] = await diffService.getDiff(txId, path);
      }
      if (!cancelled) {
        setDiffs(results);
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [txId, patchedPaths]);

  // Mount/update Monaco DiffEditor
  useEffect(() => {
    const container = editorRef.current;
    if (!container || isLoading) return;

    const currentPath = patchedPaths[currentIndex];
    const { original = '', proposed = '' } = diffs[currentPath] ?? {};

    if (!window.monaco) return;

    if (diffEditorRef.current) {
      diffEditorRef.current.dispose();
    }

    diffEditorRef.current = window.monaco.editor.createDiffEditor(container, {
      readOnly: true,
      renderSideBySide: false,
      enableSplitViewResizing: false,
      theme: 'vs-dark',
      fontSize: 13,
      minimap: { enabled: false },
      automaticLayout: true,
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
  }, [currentIndex, diffs, isLoading, patchedPaths]);

  const monacoReady = typeof window !== 'undefined' && window.monaco;

  if (!patchedPaths.length) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyTitle}>No pending changes</div>
        <button style={styles.btnCancel} onClick={rejectTransaction}>
          Close
        </button>
      </div>
    );
  }

  const currentPath = patchedPaths[currentIndex];
  const allDecided = patchedPaths.every((p) => decisions[p]);

  function decide(path, choice) {
    const next = { ...decisions, [path]: choice };
    setDecisions(next);
    const nextIndex = patchedPaths.findIndex((p) => !next[p]);
    if (nextIndex !== -1) setCurrentIndex(nextIndex);
  }

  async function handleApply() {
    const accepted = patchedPaths.filter((p) => decisions[p] === 'accept');
    const rejected = patchedPaths.filter((p) => decisions[p] === 'reject');
    await finalizeDiff({ acceptedPaths: accepted, rejectedPaths: rejected });
  }

  return (
    <div style={styles.root}>
      <div style={styles.header}>
        <div>
          <div style={styles.title}>Review AI Changes</div>
          <div style={styles.subtitle}>
            {patchedPaths.length} file{patchedPaths.length !== 1 ? 's' : ''} modified
          </div>
        </div>
        <div style={styles.headerActions}>
          <button style={styles.btnCancel} onClick={rejectTransaction}>
            Cancel All
          </button>
        </div>
      </div>

      <div style={styles.fileTabs}>
        {patchedPaths.map((path, i) => {
          const d = decisions[path];
          const label = d === 'accept' ? 'OK' : d === 'reject' ? 'NO' : '...';
          return (
            <button
              key={path}
              style={{ ...styles.fileTab, ...(i === currentIndex ? styles.fileTabActive : {}) }}
              onClick={() => setCurrentIndex(i)}
            >
              {label} {path.split('/').pop()}
            </button>
          );
        })}
      </div>

      {!monacoReady ? (
        <div style={styles.loading}>Loading editor...</div>
      ) : isLoading ? (
        <div style={styles.loading}>Preparing diff view...</div>
      ) : (
        <div ref={editorRef} style={styles.monacoPane} />
      )}

      <div style={styles.fileActions}>
        <button
          style={{
            ...styles.btn,
            ...styles.btnAccept,
            opacity: decisions[currentPath] ? 0.5 : 1,
          }}
          onClick={() => decide(currentPath, 'accept')}
          disabled={!!decisions[currentPath]}
        >
          Accept File
        </button>
        <button
          style={{
            ...styles.btn,
            ...styles.btnReject,
            opacity: decisions[currentPath] ? 0.5 : 1,
          }}
          onClick={() => decide(currentPath, 'reject')}
          disabled={!!decisions[currentPath]}
        >
          Reject File
        </button>
        {allDecided && (
          <button style={{ ...styles.btn, ...styles.btnCommit }} onClick={handleApply}>
            Apply Accepted
          </button>
        )}
      </div>
    </div>
  );
}

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

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0f1117',
    borderTop: '1px solid var(--panel-border)',
  },
  header: {
    padding: '12px 16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottom: '1px solid var(--panel-border)',
    background: 'var(--panel-bg)',
  },
  title: { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' },
  subtitle: { fontSize: 11, color: 'var(--text-muted)' },
  headerActions: { display: 'flex', gap: 8 },
  fileTabs: {
    display: 'flex',
    gap: 6,
    padding: '8px 12px',
    borderBottom: '1px solid var(--panel-border)',
    background: '#111522',
    overflowX: 'auto',
  },
  fileTab: {
    padding: '5px 10px',
    borderRadius: 4,
    border: '1px solid #2b2f3a',
    background: '#1a1f2b',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    whiteSpace: 'nowrap',
  },
  fileTabActive: { background: '#2563eb', color: '#fff', borderColor: '#2563eb' },
  monacoPane: { flex: 1, minHeight: 0, width: '100%' },
  loading: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#93c5fd',
    fontSize: 12,
  },
  fileActions: {
    display: 'flex',
    gap: 10,
    padding: '10px 16px',
    borderTop: '1px solid var(--panel-border)',
    background: '#0d1117',
  },
  btn: {
    padding: '6px 14px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  btnAccept: { background: '#22c55e', color: '#fff' },
  btnReject: { background: '#ef4444', color: '#fff' },
  btnCommit: { marginLeft: 'auto', background: '#3b82f6', color: '#fff' },
  btnCancel: {
    padding: '6px 12px',
    borderRadius: 4,
    border: '1px solid var(--panel-border)',
    background: 'transparent',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: 'var(--text-muted)',
  },
  emptyTitle: { fontSize: 14, color: 'var(--text-secondary)' },
};
