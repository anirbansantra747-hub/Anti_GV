/* eslint-disable no-unused-vars */
/**
 * @file FileNode.jsx
 * @description Single file/folder row rendered inside react-arborist.
 * Uses Lucide icons. Shows dirty indicator and right-click context menu.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  File,
  FileCode,
  FileText,
  FileJson,
  FileImage,
  Folder,
  FolderOpen,
  FolderDot,
  Edit2,
  Trash2,
  Circle,
} from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore.js';
import { useAgentStore } from '../../stores/agentStore.js';
import { fileSystemAPI } from '../../services/fileSystemAPI.js';

// ── Icon map by extension ──────────────────────────────────────────────────────
const EXT_ICONS = {
  js: { Icon: FileCode, color: '#f7df1e' },
  jsx: { Icon: FileCode, color: '#61dafb' },
  ts: { Icon: FileCode, color: '#3178c6' },
  tsx: { Icon: FileCode, color: '#3178c6' },
  py: { Icon: FileCode, color: '#4584b6' },
  json: { Icon: FileJson, color: '#7ec8e3' },
  md: { Icon: FileText, color: '#a8b8cc' },
  txt: { Icon: FileText, color: '#a8b8cc' },
  html: { Icon: FileCode, color: '#e44d26' },
  css: { Icon: FileCode, color: '#264de4' },
  scss: { Icon: FileCode, color: '#c6538c' },
  svg: { Icon: FileImage, color: '#ffb13b' },
  png: { Icon: FileImage, color: '#a8b8cc' },
  jpg: { Icon: FileImage, color: '#a8b8cc' },
  jpeg: { Icon: FileImage, color: '#a8b8cc' },
};

function getFileIcon(name) {
  const ext = name.split('.').pop().toLowerCase();
  return EXT_ICONS[ext] || { Icon: File, color: '#64748b' };
}

// ── Context menu ──────────────────────────────────────────────────────────────
function ContextMenu({ x, y, onRename, onDelete, onClose }) {
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const items = [
    { label: 'Rename', Icon: Edit2, action: onRename },
    { label: 'Delete', Icon: Trash2, action: onDelete, danger: true },
  ];

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: y,
        left: x,
        zIndex: 1000,
        background: '#1a2035',
        border: '1px solid #2d3748',
        borderRadius: 8,
        padding: '4px 0',
        boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
        minWidth: 150,
        backdropFilter: 'blur(8px)',
      }}
    >
      {items.map(({ label, Icon, action, danger }) => (
        <button
          key={label}
          onClick={() => {
            action();
            onClose();
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            textAlign: 'left',
            background: 'none',
            border: 'none',
            padding: '7px 14px',
            color: danger ? '#f87171' : '#cbd5e1',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#2d3748')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
        >
          <Icon size={14} strokeWidth={1.8} />
          {label}
        </button>
      ))}
    </div>
  );
}

// ── FileNode ──────────────────────────────────────────────────────────────────
export default function FileNode({ node, style, dragHandle }) {
  const [ctxMenu, setCtxMenu] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState(node.data.name);
  const inputRef = useRef(null);

  const dirtyFiles = useEditorStore((s) => s.dirtyFiles);
  const socket = useAgentStore((s) => s.socket);
  const isDirty = node.data.type === 'file' && dirtyFiles.has(node.id);
  const isDir = node.data.type === 'dir';

  const FolderIcon = node.isOpen ? FolderOpen : Folder;
  const { Icon: FileIcon, color: fileColor } = isDir
    ? { Icon: null, color: null }
    : getFileIcon(node.data.name);

  useEffect(() => {
    if (renaming) inputRef.current?.select();
  }, [renaming]);

  const commitRename = () => {
    setRenaming(false);
    const newName = renameVal.trim();
    if (!newName || newName === node.data.name) return;
    const segments = node.id.split('/').filter(Boolean);
    segments[segments.length - 1] = newName;
    const newPath = '/' + segments.join('/');
    try {
      fileSystemAPI.renameFile(node.id, newPath, { sourceModule: 'UI' });
      // Also persist to disk via socket
      if (socket) {
        socket.emit('fs:rename', { oldPath: node.id, newPath }, (res) => {
          if (!res?.success) console.error('[FileNode] Disk rename failed:', res?.error);
        });
      }
      // Update open tab if this file was open
      const store = useEditorStore.getState();
      if (store.activeFile === node.id) {
        store.closeTab(node.id);
        store.openFile(newPath);
      }
    } catch (err) {
      console.error('[FileNode] Rename failed:', err);
    }
  };

  const handleDelete = () => {
    try {
      fileSystemAPI.deleteFile(node.id);
      useEditorStore.getState().closeTab(node.id);
      // Also delete on disk via socket
      if (socket) {
        socket.emit('fs:delete', { path: node.id }, (res) => {
          if (!res?.success) console.error('[FileNode] Disk delete failed:', res?.error);
        });
      }
    } catch (err) {
      console.error('[FileNode] Delete failed:', err);
    }
  };

  return (
    <>
      <div
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: `2px 8px 2px ${(node.level || 0) * 12 + 8}px`,
          borderRadius: 4,
          cursor: 'pointer',
          userSelect: 'none',
          background: node.isSelected ? 'rgba(56,189,248,0.12)' : 'transparent',
          color: node.isSelected ? '#e2e8f0' : '#b0bec5',
          transition: 'all 0.1s ease',
        }}
        ref={dragHandle}
        onClick={() => {
          node.select();
          if (isDir) node.toggle();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtxMenu({ x: e.clientX, y: e.clientY });
        }}
        onMouseEnter={(e) => {
          if (!node.isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
        }}
        onMouseLeave={(e) => {
          if (!node.isSelected) e.currentTarget.style.background = 'transparent';
        }}
      >
        {/* Leading indent triangle for directories */}
        {isDir && (
          <svg
            width="8"
            height="8"
            viewBox="0 0 8 8"
            style={{
              flexShrink: 0,
              transform: node.isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s',
              opacity: 0.5,
            }}
          >
            <polygon points="0,0 8,4 0,8" fill="currentColor" />
          </svg>
        )}

        {/* File / Folder icon */}
        {isDir ? (
          <FolderIcon
            size={15}
            strokeWidth={1.6}
            color={node.isOpen ? '#f5a623' : '#f0a500'}
            style={{ flexShrink: 0 }}
          />
        ) : (
          <FileIcon size={15} strokeWidth={1.6} color={fileColor} style={{ flexShrink: 0 }} />
        )}

        {/* Name or rename input */}
        {renaming ? (
          <input
            ref={inputRef}
            value={renameVal}
            onChange={(e) => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            onClick={(e) => e.stopPropagation()}
            style={{
              flex: 1,
              background: '#0f172a',
              color: '#e2e8f0',
              border: '1px solid #22d3ee',
              borderRadius: 3,
              padding: '1px 5px',
              fontSize: 13,
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />
        ) : (
          <span
            style={{
              fontSize: 13,
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              color: node.isSelected ? '#e2e8f0' : 'inherit',
            }}
          >
            {node.data.name}
          </span>
        )}

        {/* Dirty indicator */}
        {isDirty && <Circle size={7} fill="#f59e0b" color="#f59e0b" style={{ flexShrink: 0 }} />}
      </div>

      {ctxMenu && (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          onRename={() => {
            setRenameVal(node.data.name);
            setRenaming(true);
          }}
          onDelete={handleDelete}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </>
  );
}
