/* eslint-disable no-unused-vars */
/**
 * @file QuickOpen.jsx
 * @description Ctrl+P command palette — fuzzy-match file search across the workspace.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, File, FileCode, FileText, FileJson, FileImage } from 'lucide-react';
import { fileSystemAPI } from '../../services/fileSystemAPI.js';
import { useEditorStore } from '../../stores/editorStore.js';

const EXT_ICONS = {
  js: { I: FileCode, c: '#f7df1e' }, jsx: { I: FileCode, c: '#61dafb' },
  ts: { I: FileCode, c: '#3178c6' }, tsx: { I: FileCode, c: '#3178c6' },
  py: { I: FileCode, c: '#4584b6' }, json: { I: FileJson, c: '#7ec8e3' },
  md:  { I: FileText,  c: '#a8b8cc' }, html: { I: FileCode, c: '#e44d26' },
  css: { I: FileCode, c: '#264de4' }, scss: { I: FileCode, c: '#c6538c' },
  svg: { I: FileImage, c: '#ffb13b' },
};

function fileIcon(path) {
  const ext = path.split('.').pop().toLowerCase();
  const e = EXT_ICONS[ext];
  return e ? { Icon: e.I, color: e.c } : { Icon: File, color: '#64748b' };
}

/** Simple fuzzy match — returns a score (higher = better match) or -1 if no match */
function fuzzyScore(query, text) {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t.includes(q)) return 100 + (q.length / t.length) * 100;
  let qi = 0, score = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) { score += qi === 0 ? 10 : 5; qi++; }
  }
  return qi === q.length ? score : -1;
}

export default function QuickOpen({ onClose }) {
  const [query, setQuery]   = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef            = useRef(null);
  const listRef             = useRef(null);
  const openFile            = useEditorStore((s) => s.openFile);

  // Gather all file paths
  const allPaths = useMemo(() => {
    try { return fileSystemAPI.listFiles('/'); } catch { return []; }
  }, []);

  // Fuzzy-filter + sort
  const results = useMemo(() => {
    if (!query.trim()) return allPaths.slice(0, 40);
    return allPaths
      .map((p) => ({ p, s: fuzzyScore(query, p) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p)
      .slice(0, 40);
  }, [query, allPaths]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setCursor(0); }, [results]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[cursor];
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const open = (path) => { openFile(path); onClose(); };

  const onKey = (e) => {
    if (e.key === 'ArrowDown')  { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === 'Enter' && results[cursor]) open(results[cursor]);
    if (e.key === 'Escape')     onClose();
  };

  /** Highlight the query chars inside the path */
  function highlight(path) {
    if (!query) return <span style={{ color: 'var(--text-secondary)' }}>{path}</span>;
    const q = query.toLowerCase();
    const parts = [];
    let i = 0;
    const t = path;
    const tl = t.toLowerCase();
    while (i < t.length) {
      const idx = tl.indexOf(q, i);
      if (idx === -1) { parts.push(<span key={i} style={{ color: 'var(--text-secondary)' }}>{t.slice(i)}</span>); break; }
      if (idx > i) parts.push(<span key={`p${i}`} style={{ color: 'var(--text-muted)' }}>{t.slice(i, idx)}</span>);
      parts.push(<span key={`h${idx}`} style={{ color: 'var(--accent)', fontWeight: 600 }}>{t.slice(idx, idx + q.length)}</span>);
      i = idx + q.length;
    }
    return parts;
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(3px)',
        }}
      />

      {/* Panel */}
      <div
        id="quick-open-panel"
        style={{
          position: 'fixed', top: 80, left: '50%', transform: 'translateX(-50%)',
          zIndex: 1000, width: '100%', maxWidth: 560,
          background: '#0d1424',
          border: '1px solid var(--panel-border-active)',
          borderRadius: 12,
          boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(34,211,238,0.08)',
          overflow: 'hidden',
          animation: 'slideUpFade 0.2s var(--ease-out)',
        }}
        onKeyDown={onKey}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--panel-border)' }}>
          <Search size={16} color="var(--accent)" strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go to file…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 14, fontFamily: 'var(--font-ui)',
            }}
          />
          <kbd style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 4, padding: '1px 6px', fontSize: 11, color: 'var(--text-muted)',
          }}>ESC</kbd>
        </div>

        {/* Results list */}
        <div
          ref={listRef}
          style={{ maxHeight: 360, overflowY: 'auto', padding: '4px 0' }}
        >
          {results.length === 0 && (
            <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
              No files match "{query}"
            </div>
          )}

          {results.map((path, i) => {
            const { Icon, color } = fileIcon(path);
            const name = path.split('/').pop();
            const dir  = path.slice(0, path.lastIndexOf('/') + 1);
            return (
              <div
                key={path}
                onClick={() => open(path)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 16px', cursor: 'pointer',
                  background: i === cursor ? 'rgba(34,211,238,0.08)' : 'transparent',
                  borderLeft: i === cursor ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={() => setCursor(i)}
              >
                <Icon size={14} color={color} strokeWidth={1.8} style={{ flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {highlight(name)}
                  </span>
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                    {dir}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer hint */}
        <div style={{
          borderTop: '1px solid var(--panel-border)',
          padding: '6px 16px',
          display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-muted)',
        }}>
          <span><kbd style={{ fontFamily: 'inherit' }}>↑↓</kbd> navigate</span>
          <span><kbd style={{ fontFamily: 'inherit' }}>↵</kbd> open</span>
          <span><kbd style={{ fontFamily: 'inherit' }}>ESC</kbd> close</span>
          <span style={{ marginLeft: 'auto' }}>{results.length} file{results.length !== 1 ? 's' : ''}</span>
        </div>
      </div>
    </>
  );
}
