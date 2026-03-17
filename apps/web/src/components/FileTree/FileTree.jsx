/* eslint-disable no-unused-vars */
/**
 * @file FileTree.jsx
 * @description File explorer panel built on react-arborist.
 * Shows a visible sidebar with:
 *  - "Explorer" header with three-dot (⋯) menu
 *  - Search bar to filter files
 *  - Toolbar with New File, New Folder, Open File, Open Folder
 *  - Big "Open Folder" button when workspace is empty
 *  - File tree with react-arborist when files exist
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Tree } from 'react-arborist';
import { Search, X, RefreshCw, FilePlus, FolderPlus } from 'lucide-react';
import { useFileSystemStore } from '../../stores/fileSystemStore.js';
import { useAgentStore } from '../../stores/agentStore.js';
import { useEditorStore } from '../../stores/editorStore.js';
import {
  handleDrop,
  openFilesViaInput,
  supportsDirectoryPicker,
  openWorkspaceFolder,
} from '../../services/localFileService.js';
import { fileSystemAPI } from '../../services/fileSystemAPI.js';
import { syncRealDiskToMemfs } from '../../services/initSyncService.js';
import FileNode from './FileNode.jsx';
import FileTreeActions from './FileTreeActions.jsx';
import ExplorerMenu from './ExplorerMenu.jsx';

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
  const treeData = useFileSystemStore((s) => s.treeData);
  const workspaceRootPath = useAgentStore((s) => s.workspaceRootPath);
  const socket = useAgentStore((s) => s.socket);
  const [selectedPath, setSelectedPath] = useState(null); // reactive so FileTreeActions re-renders
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropProgress, setDropProgress] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [inlineMode, setInlineMode] = useState(null); // 'file' | 'folder' | null

  const rootChildren = treeData?.[0]?.children ?? [];
  const hasFiles = rootChildren.length > 0;
  const hasOpenWorkspace = Boolean(workspaceRootPath);

  const containerRef = useRef(null);
  const [treeHeight, setTreeHeight] = useState(300);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTreeHeight(entry.contentRect.height);
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [hasFiles]);

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
    setSelectedPath(node.id);
    if (node.data.type !== 'file' || node.data.binary) return;
    useEditorStore.getState().openFile(node.id);
  };

  const getParentPath = () => {
    if (!selectedPath) return '';
    const isFile = arboristData.some(n => findNodeType(n, selectedPath) === 'file');
    if (isFile) {
      return selectedPath.substring(0, selectedPath.lastIndexOf('/'));
    }
    return selectedPath;
  };

  const findNodeType = (node, targetId) => {
    if (node.id === targetId) return node.type;
    if (node.children) {
      for (let child of node.children) {
        let res = findNodeType(child, targetId);
        if (res) return res;
      }
    }
    return null;
  };


  const handleNewFile = () => {
    const name = window.prompt("New file name:");
    if (!name?.trim()) return;
    const parentPath = getParentPath();
    const fullPath = `${parentPath}/${name.trim()}`.replace(/\/\//g, '/');

    try {
      fileSystemAPI.writeFile(fullPath, '', { sourceModule: 'UI' });
      if (socket) {
        socket.emit('fs:create', { path: fullPath, type: 'file' }, (res) => {
          if (!res?.success) console.error('[FileTree] Disk file create failed:', res?.error);
        });
      }
      useEditorStore.getState().openFile(fullPath);
    } catch (err) {
      console.error('[FileTree] File creation failed:', err);
    }
  };

  const handleNewFolder = () => {
    const name = window.prompt("New folder name:");
    if (!name?.trim()) return;
    const parentPath = getParentPath();
    const fullPath = `${parentPath}/${name.trim()}`.replace(/\/\//g, '/');

    try {
      fileSystemAPI.mkdir(fullPath, { recursive: true }, 'UI');
      if (socket) {
        socket.emit('fs:create', { path: fullPath, type: 'dir' }, (res) => {
          if (!res?.success) console.error('[FileTree] Disk folder create failed:', res?.error);
        });
      }
    } catch (err) {
      console.error('[FileTree] Folder creation failed:', err);
    }
  };

  const handleRefresh = async () => {
    try {
      await syncRealDiskToMemfs({ preferIDB: false, reset: false });
    } catch (error) {
       console.error('[FileTree] Refresh failed:', error);
    }
  };

  // ── Drag & Drop handlers ────────────────────────────────────────────────────
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setIsDragOver(true);
  };

  const onDragLeave = (e) => {
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
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
        background: 'var(--app-bg)',
        position: 'relative',
        outline: isDragOver ? '2px dashed var(--accent)' : 'none',
        outlineOffset: -2,
        transition: 'outline-color 0.15s',
      }}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* ── Explorer Header ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: '10px 12px 8px',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
          borderBottom: '1px solid var(--panel-border)',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--panel-bg)',
        }}
      >
        <span>Explorer</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <button
            title="New File"
            onClick={handleNewFile}
            style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '3px' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
              e.currentTarget.style.color = '#e2e8f0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = '#94a3b8';
            }}
          >
            <FilePlus size={14} />
          </button>
          <button
            title="New Folder"
            onClick={handleNewFolder}
             style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '3px' }}
             onMouseEnter={(e) => {
               e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
               e.currentTarget.style.color = '#e2e8f0';
             }}
             onMouseLeave={(e) => {
               e.currentTarget.style.background = 'transparent';
               e.currentTarget.style.color = '#94a3b8';
             }}
          >
            <FolderPlus size={14} />
          </button>
           <button
             title="Refresh Explorer"
             onClick={handleRefresh}
             style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '3px' }}
             onMouseEnter={(e) => {
               e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
               e.currentTarget.style.color = '#e2e8f0';
             }}
             onMouseLeave={(e) => {
               e.currentTarget.style.background = 'transparent';
               e.currentTarget.style.color = '#94a3b8';
             }}
          >
            <RefreshCw size={14} />
          </button>
          <ExplorerMenu
            onNewFile={handleNewFile}
            onNewFolder={handleNewFolder}
            onRefresh={handleRefresh}
          />
        </div>
      </div>

      {/* ── Toolbar: New File, New Folder, Open File, Open Folder ────── */}
      {hasFiles && (
        <>
          {/* Search bar */}
          <div
            style={{
              padding: '8px',
              borderBottom: '1px solid var(--panel-border)',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'transparent',
            }}
          >
            <Search size={12} color="var(--text-muted)" strokeWidth={2} style={{ flexShrink: 0 }} />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter files…"
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 12,
                fontFamily: 'var(--font-ui)',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 2,
                  color: 'var(--text-secondary)',
                }}
              >
                <X size={11} strokeWidth={2} />
              </button>
            )}
          </div>

          <FileTreeActions selectedPath={selectedPath} />
        </>
      )}

      {/* ── Drag-over overlay ───────────────────────────────────────────── */}
      {isDragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 10,
            background: 'rgba(34,211,238,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              padding: '12px 20px',
              borderRadius: 10,
              background: '#0f172a',
              border: '1px solid #22d3ee55',
              color: '#22d3ee',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            Drop files or folders here
          </div>
        </div>
      )}

      {/* ── Drop progress bar ───────────────────────────────────────────── */}
      {dropProgress && dropProgress.total > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: 3,
            background: '#1e293b',
            zIndex: 20,
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.round((dropProgress.done / dropProgress.total) * 100)}%`,
              background: '#22d3ee',
              transition: 'width 0.15s',
            }}
          />
        </div>
      )}

      {/* ── Main Content Area ───────────────────────────────────────────── */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', paddingTop: 4 }}>
        {!hasFiles ? (
          /* Empty state — no folder opened yet */
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 16,
              overflowY: 'auto',
              height: '100%',
            }}
          >
            <div style={{ fontSize: 48, opacity: 0.6 }}>📂</div>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
              {hasOpenWorkspace
                ? 'This folder is open but currently empty.'
                : 'You have not yet opened a folder.'}
            </p>
            <button
              onClick={() => {
                openWorkspaceFolder().catch((error) =>
                  console.error('[FileTree] Open folder failed:', error)
                );
              }}
              style={{
                background: '#0e639c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                padding: '10px 20px',
                fontSize: '14px',
                cursor: 'pointer',
                width: '100%',
                maxWidth: '200px',
                fontFamily: 'var(--font-ui)',
                fontWeight: 600,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => (e.target.style.background = '#1177bb')}
              onMouseLeave={(e) => (e.target.style.background = '#0e639c')}
            >
              Open Folder
            </button>
            <p style={{ color: '#475569', fontSize: 11, margin: 0 }}>
              or drag and drop a folder here
            </p>
          </div>
        ) : (
          /* File tree */
          <Tree
            data={arboristData}
            onSelect={handleSelect}
            openByDefault={!!searchQuery}
            width="100%"
            height={treeHeight}
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
