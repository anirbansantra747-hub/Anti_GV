/* eslint-disable no-unused-vars */
/**
 * @file FileTreeActions.jsx
 * @description Toolbar above the FileTree.
 */

import React, { useState } from 'react';
import {
  FilePlus, FolderPlus, FolderOpen, Upload,
  CheckCircle, XCircle, Loader,
} from 'lucide-react';
import {
  supportsFileSystemAccess, supportsDirectoryPicker,
  openFilesViaFSA, openDirectoryViaFSA,
  openFilesViaInput,
} from '../../services/localFileService.js';
import { fileSystemAPI } from '../../services/fileSystemAPI.js';

// ── Styles ────────────────────────────────────────────────────────────────────
const BTN_BASE = {
  display: 'flex', alignItems: 'center', gap: 6,
  background: 'none', border: '1px solid transparent',
  borderRadius: 6, padding: '5px 8px', color: 'var(--text-secondary)',
  fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit',
  transition: 'all 0.15s',
};

function IconBtn({ icon: Icon, label, title, onClick, accent = 'var(--accent)' }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      title={title || label}
      onClick={onClick}
      style={{
        ...BTN_BASE,
        color: hover ? accent : 'var(--text-secondary)',
        background: hover ? 'rgba(255,255,255,0.04)' : 'none',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Icon size={14} strokeWidth={2} />
      {label && <span>{label}</span>}
    </button>
  );
}

// ── Inline rename prompt ───────────────────────────────────────────────────────
function InlinePrompt({ placeholder, onConfirm, onCancel }) {
  const [val, setVal] = useState('');
  return (
    <div style={{ display: 'flex', gap: 6, padding: '8px 12px', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
      <input
        autoFocus
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && val.trim()) onConfirm(val.trim());
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        style={{
          flex: 1, background: 'rgba(255,255,255,0.03)', color: 'var(--text-primary)',
          border: '1px solid var(--accent)', borderRadius: 4,
          padding: '4px 8px', fontSize: 13, fontFamily: 'inherit', outline: 'none',
          boxShadow: '0 0 0 1px var(--accent-glow)',
        }}
      />
      <button
        onClick={() => val.trim() && onConfirm(val.trim())}
        style={{ ...BTN_BASE, color: 'var(--accent)', padding: '4px 6px' }}
      >
        <CheckCircle size={15} />
      </button>
      <button onClick={onCancel} style={{ ...BTN_BASE, color: 'var(--text-muted)', padding: '4px 6px' }}>
        <XCircle size={15} />
      </button>
    </div>
  );
}

// ── Progress toast ─────────────────────────────────────────────────────────────
function ProgressToast({ done, total, current }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const name = current?.split('/').pop() ?? '';
  return (
    <div style={{
      padding: '8px 12px', fontSize: 11, color: 'var(--text-secondary)',
      borderBottom: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.2)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Importing… {pct}%</span>
        <span style={{ color: 'var(--text-muted)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </span>
      </div>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2, transition: 'width 0.2s ease-out' }} />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function FileTreeActions({ selectedPath }) {
  const [mode, setMode] = useState(null); // 'file' | 'folder' | null
  const [progress, setProgress] = useState(null); // { done, total, current }

  const parentDir = selectedPath
    ? (selectedPath.includes('.')
        ? selectedPath.split('/').slice(0, -1).join('/') || '/'
        : selectedPath)
    : '/';

  const handleNewFile = (name) => {
    const path = parentDir === '/' ? `/${name}` : `${parentDir}/${name}`;
    try { fileSystemAPI.writeFile(path, '', { sourceModule: 'UI' }); } catch (e) { console.error(e); }
    setMode(null);
  };

  const handleNewFolder = (name) => {
    const path = parentDir === '/' ? `/${name}` : `${parentDir}/${name}`;
    try { fileSystemAPI.mkdir(path, { sourceModule: 'UI' }); } catch (e) { console.error(e); }
    setMode(null);
  };

  const handleOpenFiles = async () => {
    setProgress({ done: 0, total: 1, current: '…' });
    try {
      if (supportsFileSystemAccess) {
        await openFilesViaFSA((p) => setProgress(p));
      } else {
        await openFilesViaInput({ multiple: true }, (p) => setProgress(p));
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('[FileTreeActions] Open files failed:', err);
    } finally {
      setProgress(null);
    }
  };

  const handleOpenFolder = async () => {
    setProgress({ done: 0, total: 1, current: '…' });
    try {
      if (supportsDirectoryPicker) {
        await openDirectoryViaFSA((p) => setProgress(p));
      } else {
        await openFilesViaInput({ multiple: true, directory: true }, (p) => setProgress(p));
      }
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('[FileTreeActions] Open folder failed:', err);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div>
      {/* Toolbar row */}
      <div style={{
        display: 'flex', gap: 2, padding: '8px 12px',
        borderBottom: '1px solid var(--panel-border)',
        alignItems: 'center',
        background: 'rgba(255,255,255,0.01)',
      }}>
        <IconBtn icon={FilePlus}   title="New File"          onClick={() => setMode(mode === 'file'   ? null : 'file')} />
        <IconBtn icon={FolderPlus} title="New Folder"        onClick={() => setMode(mode === 'folder' ? null : 'folder')} />

        {/* Divider */}
        <div style={{ width: 1, height: 16, background: 'var(--panel-border)', margin: '0 6px', flexShrink: 0 }} />

        <IconBtn icon={Upload}     title="Open files from disk" onClick={handleOpenFiles}  accent="#a78bfa" />
        <IconBtn icon={FolderOpen} title="Open folder from disk" onClick={handleOpenFolder} accent="#a78bfa" />

        {/* Spinner when loading */}
        {progress && (
          <Loader size={14} color="var(--accent)" style={{ marginLeft: 'auto', animation: 'spin 1s linear infinite' }} />
        )}
      </div>

      {/* Inline prompts */}
      {mode === 'file'   && <InlinePrompt placeholder="filename.js"  onConfirm={handleNewFile}   onCancel={() => setMode(null)} />}
      {mode === 'folder' && <InlinePrompt placeholder="folder-name"  onConfirm={handleNewFolder} onCancel={() => setMode(null)} />}

      {/* Progress bar while importing */}
      {progress && progress.total > 1 && <ProgressToast {...progress} />}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
