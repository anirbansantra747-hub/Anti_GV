/* eslint-disable no-unused-vars */
/**
 * @file FileTree.jsx
 * @description File explorer panel built on react-arborist.
 * Supports:
 *  - Reactive tree from fileSystemStore (memfs)
 *  - Click to open a file in MonacoEditor via editorStore
 *  - Drag-and-drop files/folders from the OS (via localFileService)
 */

import React, { useRef, useState, useMemo } from 'react';
import { Tree } from 'react-arborist';
import { Search, X } from 'lucide-react';
import { useFileSystemStore } from '../../stores/fileSystemStore.js';
import { useEditorStore } from '../../stores/editorStore.js';
import { handleDrop } from '../../services/localFileService.js';
import FileNode from './FileNode.jsx';
import FileTreeActions from './FileTreeActions.jsx';

// ── Transform Zustand treeData → react-arborist format ────────────────────────
function toArboristNodes(nodes, parentPath = '') {
  if (!nodes) return [];
  return nodes.map((n) => {
    const fullPath = parentPath ? `${parentPath}/${n.name}` : `/${n.name}`;
    const base = { id: fullPath, name: n.name, type: n.type, binary: n.binary ?? false };
    if (n.type === 'dir') base.children = toArboristNodes(n.children || [], fullPath);
    return base;
  });
}

export default function FileTree() {
  const treeData    = useFileSystemStore((s) => s.treeData);
  const selectedRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropProgress, setDropProgress] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  const rootChildren = treeData?.[0]?.children ?? [];

  // Filter tree nodes by search query
  const arboristData = useMemo(() => {
    const nodes = toArboristNodes(rootChildren);
    if (!searchQuery.trim()) return nodes;
    const q = searchQuery.toLowerCase();
    function filterNodes(items) {
      const out = [];
      for (const item of items) {
        if (item.type === 'file' && item.name.toLowerCase().includes(q)) {
          out.push(item);
        } else if (item.type !== 'file' && item.children) {
          const matched = filterNodes(item.children);
          if (matched.length) out.push({ ...item, children: matched });
        }
      }
      return out;
    }
    return filterNodes(nodes);
  }, [rootChildren, searchQuery]);

  const handleSelect = (nodes) => {
    const node = nodes?.[0];
    if (!node) return;
    selectedRef.current = node.id;
    if (node.data.type !== 'file' || node.data.binary) return;
    useEditorStore.getState().openFile(node.id);
  };

  // ── Drag & Drop handlers ────────────────────────────────────────────────────
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const onDragLeave = (e) => {
    // Only clear when leaving the tree container itself
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragOver(false);
  };

  const onDrop = async (e) => {
    setIsDragOver(false);
    setDropProgress({ done: 0, total: 1, current: '…' });
    try {
      await handleDrop(e, (p) => setDropProgress(p));
    } catch (err) {
      console.error('[FileTree] Drop failed:', err);
    } finally {
      setTimeout(() => setDropProgress(null), 400);
    }
  };

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column',
        height: '100%', overflow: 'hidden',
        background: '#080e1a',
        position: 'relative',
        outline: isDragOver ? '2px dashed #22d3ee' : '2px dashed transparent',
        outlineOffset: -2,
        transition: 'outline-color 0.15s',
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Panel title + search */}
      <div style={{
        padding: '10px 12px 6px',
        fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: '#334155',
        borderBottom: '1px solid #131d2e', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        Explorer
      </div>

      {/* Search bar */}
      <div style={{
        padding: '6px 8px',
        borderBottom: '1px solid #131d2e',
        flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 6,
        background: 'rgba(0,0,0,0.1)',
      }}>
        <Search size={12} color="#334155" strokeWidth={2} style={{ flexShrink: 0 }} />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter files…"
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            color: 'var(--text-secondary)', fontSize: 12,
            fontFamily: 'var(--font-ui)',
          }}
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: '#334155' }}
          >
            <X size={11} strokeWidth={2} />
          </button>
        )}
      </div>

      {/* Toolbar: New File, New Folder, Open File, Open Folder */}
      <FileTreeActions selectedPath={selectedRef.current} />

      {/* Drag-over overlay */}
      {isDragOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(34,211,238,0.06)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            padding: '12px 20px', borderRadius: 10,
            background: '#0f172a', border: '1px solid #22d3ee55',
            color: '#22d3ee', fontSize: 13, fontWeight: 600,
          }}>
            Drop files or folders here
          </div>
        </div>
      )}

      {/* Drop progress bar */}
      {dropProgress && dropProgress.total > 1 && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 3, background: '#1e293b', zIndex: 20,
        }}>
          <div style={{
            height: '100%',
            width: `${Math.round((dropProgress.done / dropProgress.total) * 100)}%`,
            background: '#22d3ee',
            transition: 'width 0.15s',
          }} />
        </div>
      )}

      {/* Tree */}
      <div style={{ flex: 1, overflow: 'auto', paddingTop: 4 }}>
        {arboristData.length === 0 ? (
          <div style={{
            padding: '32px 16px', textAlign: 'center',
            color: '#1e2a3a', fontSize: 12,
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>📂</div>
            <div style={{ color: '#334155', marginBottom: 4 }}>No files yet</div>
            <div style={{ color: '#1e293b' }}>
              Use <strong style={{ color: '#334155' }}>+ File</strong> or drop files here
            </div>
          </div>
        ) : (
          <Tree
            data={arboristData}
            onSelect={handleSelect}
            openByDefault={!!searchQuery}
            width="100%"
            indent={16}
            rowHeight={28}
            overscanCount={4}
          >
            {FileNode}
          </Tree>
        )}
      </div>
    </div>
  );
}
