/* eslint-disable no-unused-vars */
/**
 * @file Topbar.jsx
 * @description Top navigation for workspace open/save state.
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { Save, CheckCircle, XCircle, Loader, Zap, History, Menu } from 'lucide-react';
import { useFileSystemStore } from '../../stores/fileSystemStore.js';
import { useAgentStore } from '../../stores/agentStore.js';
import { useEditorStore } from '../../stores/editorStore.js';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useWorkspaceAccessStore } from '../../stores/workspaceAccessStore.js';
import {
  openDirectoryViaFSA,
  openFilesViaFSA,
  openFilesViaInput,
  supportsDirectoryPicker,
  supportsFileSystemAccess,
} from '../../services/localFileService.js';
import { fileSystemAPI } from '../../services/fileSystemAPI.js';
import { workspaceAccessService } from '../../services/workspaceAccessService.js';

const HistoryDrawer = lazy(() => import('../History/HistoryDrawer.jsx'));

const STATE_CONFIG = {
  IDLE: { color: 'var(--green)', label: 'IDLE' },
  AI_PENDING: { color: 'var(--amber)', label: 'AI PENDING' },
  DIFF_REVIEW: { color: '#3b82f6', label: 'DIFF REVIEW' },
  COMMITTING: { color: 'var(--purple)', label: 'COMMITTING' },
  CONFLICT: { color: 'var(--red)', label: 'CONFLICT' },
  ERROR: { color: 'var(--red)', label: 'ERROR' },
};

const SAVE_ICONS = {
  idle: { Icon: Save, color: 'var(--accent)', label: 'Save File' },
  saving: { Icon: Loader, color: '#94a3b8', label: 'Saving...' },
  saved: { Icon: CheckCircle, color: '#4ade80', label: 'Saved' },
  error: { Icon: XCircle, color: '#f87171', label: 'Failed' },
};

function StateBadge({ state }) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.IDLE;
  const isAnimated = state !== 'IDLE';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: `${cfg.color}11`,
        border: `1px solid ${cfg.color}33`,
        borderRadius: 20,
        padding: '4px 12px',
        boxShadow: `inset 0 0 12px ${cfg.color}11`,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: cfg.color,
          boxShadow: `0 0 8px ${cfg.color}`,
          display: 'inline-block',
          animation: isAnimated ? 'wsStatePulse 1.4s ease-in-out infinite' : 'none',
        }}
      />
      <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: '0.1em' }}>
        {cfg.label}
      </span>
    </div>
  );
}

export default function Topbar({ tabRole = 'unknown', recoveredFromIDB = false, onNavigate }) {
  const workspaceState = useFileSystemStore((s) => s.workspaceState);
  const socket = useAgentStore((s) => s.socket);
  const activeFile = useEditorStore((s) => s.activeFile);
  const dirtyFiles = useEditorStore((s) => s.dirtyFiles);
  const clearDirty = useEditorStore((s) => s.clearDirty);
  const source = useWorkspaceAccessStore((s) => s.source);
  const profile = useSessionStore((s) => s.profile);

  const [saveStatus, setSaveStatus] = useState('idle');
  const [showRecovered, setShowRecovered] = useState(recoveredFromIDB);
  const [showHistory, setShowHistory] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const fileMenuRef = useRef(null);

  useEffect(() => {
    if (!showFileMenu) return;
    const handler = (e) => {
      if (fileMenuRef.current && !fileMenuRef.current.contains(e.target)) setShowFileMenu(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFileMenu]);

  useEffect(() => {
    if (!recoveredFromIDB) return;
    const t = setTimeout(() => setShowRecovered(false), 4000);
    return () => clearTimeout(t);
  }, [recoveredFromIDB]);

  const openFolder = () => {
    if (supportsDirectoryPicker) {
      openDirectoryViaFSA().catch((error) => console.error('[Topbar] Open folder failed:', error));
      return;
    }

    openFilesViaInput({ directory: true }).catch((error) =>
      console.error('[Topbar] Open folder import failed:', error)
    );
  };

  const openFiles = () => {
    if (supportsFileSystemAccess) {
      openFilesViaFSA().catch((error) => console.error('[Topbar] Open files failed:', error));
      return;
    }

    openFilesViaInput({ multiple: true }).catch((error) =>
      console.error('[Topbar] Open files import failed:', error)
    );
  };

  const handleSave = async () => {
    if (saveStatus === 'saving' || !activeFile) return;

    setSaveStatus('saving');
    try {
      const content = await fileSystemAPI.readFile(activeFile);
      await workspaceAccessService.saveFile(activeFile, content, socket);
      clearDirty(activeFile);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2200);
    } catch (error) {
      console.error('[Topbar] Save failed:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const { Icon: SaveIcon, color: saveColor, label: saveLabel } = SAVE_ICONS[saveStatus];
  const targetMeta = activeFile ? workspaceAccessService.describeTarget(activeFile) : null;
  const activeDirty = activeFile ? dirtyFiles.has(activeFile) : false;

  return (
    <>
      <style>{`
        @keyframes wsStatePulse { 0%,100%{opacity:1; transform:scale(1)} 50%{opacity:0.4; transform:scale(0.8)} }
        @keyframes topbarSlideIn { from{transform:translateY(-10px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes topbarSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div
        className="glass-header"
        style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          padding: '0 20px',
          gap: 16,
          flexShrink: 0,
          zIndex: 20,
        }}
      >
        <div ref={fileMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowFileMenu((v) => !v)}
            title="File menu"
            style={{
              background: showFileMenu ? 'var(--panel-bg)' : 'transparent',
              border: showFileMenu ? '1px solid var(--panel-border)' : '1px solid transparent',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              padding: '6px 8px',
              borderRadius: 0,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Menu size={18} strokeWidth={2} />
          </button>

          {showFileMenu && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                marginTop: 4,
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '4px 0',
                minWidth: '220px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                zIndex: 1000,
              }}
            >
              {[
                { label: 'Open Folder...', action: openFolder },
                { label: 'Open File...', action: openFiles },
                { divider: true },
                { label: 'Save Active File', action: handleSave, kbd: 'Ctrl+S' },
              ].map((item, i) =>
                item.divider ? (
                  <div key={i} style={{ height: 1, background: '#334155', margin: '4px 0' }} />
                ) : (
                  <button
                    key={i}
                    onClick={() => {
                      setShowFileMenu(false);
                      item.action?.();
                    }}
                    style={{
                      display: 'flex',
                      width: '100%',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'transparent',
                      border: 'none',
                      color: '#cbd5e1',
                      padding: '7px 14px',
                      fontSize: '13px',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = 'rgba(56,189,248,0.1)')
                    }
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>{item.label}</span>
                    {item.kbd && <span style={{ fontSize: 11, color: '#64748b' }}>{item.kbd}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 16 }}>
          <div
            style={{
              width: 32,
              height: 32,
              background: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid var(--accent-dim)',
              boxShadow: '4px 4px 0px rgba(0,0,0,1)',
            }}
          >
            <Zap size={16} color="#000000" strokeWidth={3} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span
              style={{
                fontWeight: 700,
                fontSize: 18,
                letterSpacing: '-0.05em',
                textTransform: 'uppercase',
                color: 'var(--text-primary)',
              }}
            >
              Anti_GV
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{source.label}</span>
          </div>
        </div>

        <StateBadge state={workspaceState || 'IDLE'} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {[
            ['Dashboard', '/dashboard'],
            ['Profile', '/profile'],
            ['Settings', '/settings'],
            ['Logout', '/logout'],
          ].map(([label, path]) => (
            <button
              key={path}
              onClick={() => onNavigate?.(path)}
              style={{
                border: '1px solid var(--panel-border)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text-secondary)',
                padding: '6px 10px',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {import.meta.env.DEV && (
          <div
            style={{
              fontSize: 10,
              color: 'var(--text-muted)',
              border: '1px solid var(--panel-border)',
              borderRadius: 6,
              padding: '3px 8px',
              fontFamily: '"JetBrains Mono", monospace',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {tabRole.toUpperCase()}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 2,
            marginRight: 4,
            minWidth: 120,
          }}
        >
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
            {profile.name}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{profile.role}</span>
        </div>

        {targetMeta && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              minWidth: 0,
              maxWidth: 360,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: activeDirty ? 'var(--accent)' : 'var(--text-primary)',
                fontWeight: 700,
                width: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'right',
              }}
              title={targetMeta.title}
            >
              {targetMeta.title}
            </span>
            <span
              style={{
                fontSize: 10,
                color: 'var(--text-muted)',
                width: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'right',
              }}
              title={targetMeta.detail}
            >
              {targetMeta.detail}
            </span>
          </div>
        )}

        {showRecovered && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              color: '#4ade80',
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid #22c55e33',
              borderRadius: 6,
              padding: '4px 12px',
              animation: 'topbarSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <CheckCircle size={14} strokeWidth={2.5} />
            Recovered from local cache
          </div>
        )}

        <button
          id="history-btn"
          title="Workspace history (snapshots)"
          onClick={() => setShowHistory((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 8,
            background: showHistory ? 'var(--accent-glow)' : 'rgba(255,255,255,0.04)',
            color: showHistory ? 'var(--accent)' : 'var(--text-secondary)',
            border: showHistory
              ? '1px solid rgba(34,211,238,0.25)'
              : '1px solid var(--panel-border)',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'inherit',
          }}
        >
          <History size={14} strokeWidth={2} />
          History
        </button>

        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving' || !activeFile}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 16px',
            borderRadius: 8,
            background: `${saveColor}11`,
            color: saveColor,
            border: `1px solid ${saveColor}33`,
            cursor: saveStatus === 'saving' || !activeFile ? 'default' : 'pointer',
            fontSize: 13,
            fontFamily: 'inherit',
            fontWeight: 600,
            boxShadow: `0 4px 12px ${saveColor}11`,
            opacity: saveStatus === 'saving' || !activeFile ? 0.7 : 1,
          }}
        >
          <SaveIcon
            size={16}
            strokeWidth={2}
            style={saveStatus === 'saving' ? { animation: 'topbarSpin 1s linear infinite' } : {}}
          />
          {activeFile ? saveLabel : 'No File'}
        </button>
      </div>

      {showHistory && (
        <Suspense fallback={null}>
          <HistoryDrawer onClose={() => setShowHistory(false)} />
        </Suspense>
      )}
    </>
  );
}
