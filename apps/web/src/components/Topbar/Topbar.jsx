/* eslint-disable no-unused-vars */
/**
 * @file Topbar.jsx
 * @description Sleek, transparent Top navigation bar using Lucide icons.
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Save, CheckCircle, XCircle, Loader, Zap, History } from 'lucide-react';
import { useFileSystemStore } from '../../stores/fileSystemStore.js';
import { remoteSync } from '../../services/remoteSync.js';

const HistoryDrawer = lazy(() => import('../History/HistoryDrawer.jsx'));

const STATE_CONFIG = {
  IDLE:        { color: '#22c55e', label: 'IDLE'        },
  AI_PENDING:  { color: '#f59e0b', label: 'AI PENDING'  },
  DIFF_REVIEW: { color: '#3b82f6', label: 'DIFF REVIEW' },
  COMMITTING:  { color: '#a855f7', label: 'COMMITTING'  },
  CONFLICT:    { color: '#ef4444', label: 'CONFLICT'    },
  ERROR:       { color: '#ef4444', label: 'ERROR'       },
};

function StateBadge({ state }) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.IDLE;
  const isAnimated = state !== 'IDLE';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      background: `${cfg.color}11`,
      border: `1px solid ${cfg.color}33`,
      borderRadius: 20, padding: '4px 12px',
      boxShadow: `inset 0 0 12px ${cfg.color}11`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: cfg.color,
        boxShadow: `0 0 8px ${cfg.color}`,
        display: 'inline-block',
        animation: isAnimated ? 'wsStatePulse 1.4s ease-in-out infinite' : 'none',
      }} />
      <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color, letterSpacing: '0.1em' }}>
        {cfg.label}
      </span>
    </div>
  );
}

const SAVE_ICONS = {
  idle:   { Icon: Save,         color: 'var(--accent)', label: 'Save'      },
  saving: { Icon: Loader,       color: '#94a3b8',       label: 'Saving…'   },
  saved:  { Icon: CheckCircle,  color: '#4ade80',       label: 'Saved'     },
  error:  { Icon: XCircle,      color: '#f87171',       label: 'Failed'    },
};

export default function Topbar({ tabRole = 'unknown', recoveredFromIDB = false }) {
  const workspaceState = useFileSystemStore((s) => s.workspaceState);
  const workspaceVersion = useFileSystemStore((s) => s.workspaceVersion);
  const [saveStatus, setSaveStatus]   = useState('idle');
  const [showRecovered, setShowRecovered] = useState(recoveredFromIDB);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!recoveredFromIDB) return;
    const t = setTimeout(() => setShowRecovered(false), 4000);
    return () => clearTimeout(t);
  }, [recoveredFromIDB]);

  const handleSave = async () => {
    if (saveStatus === 'saving') return;
    setSaveStatus('saving');
    try {
      await remoteSync.push();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2200);
    } catch (err) {
      console.error('[Topbar] Remote sync failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const { Icon: SaveIcon, color: saveColor, label: saveLabel } = SAVE_ICONS[saveStatus];

  return (
    <>
      <style>{`
        @keyframes wsStatePulse { 0%,100%{opacity:1; transform:scale(1)} 50%{opacity:0.4; transform:scale(0.8)} }
        @keyframes topbarSlideIn { from{transform:translateY(-10px);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes topbarSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      <div style={{
        height: 56, display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 16,
        background: 'transparent', // Let app background show through
        flexShrink: 0, zIndex: 20,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 8 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent) 0%, #818cf8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px var(--accent-glow)'
          }}>
            <Zap size={16} color="#ffffff" strokeWidth={2.5} />
          </div>
          <span style={{
            fontWeight: 800, fontSize: 18, letterSpacing: '-0.03em',
            background: 'linear-gradient(120deg, #ffffff 30%, var(--accent) 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Anti_GV
          </span>
        </div>

        {/* Workspace state badge */}
        <StateBadge state={workspaceState || 'IDLE'} />

        {/* Dev tab role */}
        {import.meta.env.DEV && (
          <div style={{
            fontSize: 10, color: 'var(--text-muted)',
            border: '1px solid var(--panel-border)', borderRadius: 6,
            padding: '3px 8px', fontFamily: '"JetBrains Mono", monospace',
            background: 'rgba(255,255,255,0.02)'
          }}>
            {tabRole.toUpperCase()}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* IDB recovery toast */}
        {showRecovered && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, fontWeight: 500, color: '#4ade80',
            background: 'rgba(34,197,94,0.1)',
            border: '1px solid #22c55e33', borderRadius: 6, padding: '4px 12px',
            animation: 'topbarSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
            <CheckCircle size={14} strokeWidth={2.5} />
            Recovered from local cache
          </div>
        )}

        {/* History button */}
        <button
          id="history-btn"
          title="Workspace history (snapshots)"
          onClick={() => setShowHistory((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            background: showHistory ? 'var(--accent-glow)' : 'rgba(255,255,255,0.04)',
            color: showHistory ? 'var(--accent)' : 'var(--text-secondary)',
            border: showHistory ? '1px solid rgba(34,211,238,0.25)' : '1px solid var(--panel-border)',
            cursor: 'pointer', fontSize: 12, fontWeight: 600,
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}
        >
          <History size={14} strokeWidth={2} />
          History
        </button>

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 16px', borderRadius: 8,
            background: `${saveColor}11`,
            color: saveColor,
            border: `1px solid ${saveColor}33`,
            cursor: saveStatus === 'saving' ? 'default' : 'pointer',
            fontSize: 13, fontFamily: 'inherit', fontWeight: 600,
            transition: 'all 0.2s',
            boxShadow: `0 4px 12px ${saveColor}11`,
            opacity: saveStatus === 'saving' ? 0.7 : 1,
          }}
          onMouseEnter={e => { if(saveStatus==='idle') e.currentTarget.style.background = `${saveColor}22`}}
          onMouseLeave={e => { if(saveStatus==='idle') e.currentTarget.style.background = `${saveColor}11`}}
        >
          <SaveIcon
            size={16}
            strokeWidth={2}
            style={saveStatus === 'saving' ? { animation: 'topbarSpin 1s linear infinite' } : {}}
          />
          {saveLabel}
        </button>
      </div>

      {/* History Drawer */}
      {showHistory && (
        <Suspense fallback={null}>
          <HistoryDrawer onClose={() => setShowHistory(false)} />
        </Suspense>
      )}
    </>
  );
}
