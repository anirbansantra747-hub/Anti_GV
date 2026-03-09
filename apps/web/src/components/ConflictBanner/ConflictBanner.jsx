/* eslint-disable no-unused-vars */
/**
 * @file ConflictBanner.jsx
 * @description Phase 7 — Workspace state notification banners.
 * Renders:
 *  - CONFLICT banner: remote version diverged from local
 *  - INTEGRITY FAIL banner: Merkle root hash check failed (workspace frozen)
 */

import React from 'react';
import { AlertTriangle, ShieldX, RefreshCw } from 'lucide-react';
import { useFileSystemStore } from '../../stores/fileSystemStore.js';

// ── Integrity failure banner ────────────────────────────────────────────────
export function IntegrityBanner() {
  const failed = useFileSystemStore((s) => s.integrityFailed);
  if (!failed) return null;

  return (
    <div style={{
      background: 'rgba(239,68,68,0.12)',
      borderBottom: '1px solid rgba(239,68,68,0.3)',
      padding: '8px 16px',
      display: 'flex', alignItems: 'center', gap: 10,
      flexShrink: 0,
      animation: 'slideUpFade 0.2s var(--ease-out)',
    }}>
      <ShieldX size={14} color="#ef4444" strokeWidth={2} style={{ flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, color: '#fca5a5', fontWeight: 500 }}>
        🔴 FS integrity check failed — workspace is frozen. Merkle root hash diverged from stored version.
      </span>
      <button
        onClick={() => window.location.reload()}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)',
          borderRadius: 6, padding: '4px 12px',
          color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'var(--font-ui)',
        }}
      >
        <RefreshCw size={10} strokeWidth={2.5} />
        Reload
      </button>
    </div>
  );
}

// ── Conflict banner ─────────────────────────────────────────────────────────
export function ConflictBanner() {
  const workspaceState = useFileSystemStore((s) => s.workspaceState);
  const conflictPayload = useFileSystemStore((s) => s.conflictPayload);

  if (workspaceState !== 'CONFLICT') return null;

  const local  = conflictPayload?.localVersion?.slice(0, 8)  ?? '…';
  const remote = conflictPayload?.remoteVersion?.slice(0, 8) ?? '…';

  const handleForceMine = () => {
    // TODO: Push local state to remote (Phase 6 — Tier 3 remote sync)
    console.warn('[ConflictBanner] "Force Mine" — remote push not yet implemented (Phase 6).');
    useFileSystemStore.setState({ workspaceState: 'IDLE', conflictPayload: null });
  };

  const handleAcceptTheirs = () => {
    // TODO: Pull remote snapshot and hydrate (Phase 6 — Tier 3 remote sync)
    console.warn('[ConflictBanner] "Accept Theirs" — remote pull not yet implemented (Phase 6).');
    useFileSystemStore.setState({ workspaceState: 'IDLE', conflictPayload: null });
  };

  return (
    <div style={{
      background: 'rgba(245,158,11,0.1)',
      borderBottom: '1px solid rgba(245,158,11,0.3)',
      padding: '8px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      flexShrink: 0,
      animation: 'slideUpFade 0.2s var(--ease-out)',
    }}>
      <AlertTriangle size={14} color="#f59e0b" strokeWidth={2} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 12, color: '#fcd34d', fontWeight: 600 }}>
          ⚠️ Remote conflict detected
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
          local <code style={{ fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>{local}…</code>
          {' ≠ '}
          remote <code style={{ fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>{remote}…</code>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleForceMine}
          style={{
            background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)',
            borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
            color: '#f59e0b', fontSize: 11, fontWeight: 700,
            fontFamily: 'var(--font-ui)',
          }}
        >
          Keep Mine
        </button>
        <button
          onClick={handleAcceptTheirs}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid var(--panel-border)',
            borderRadius: 6, padding: '4px 12px', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 11,
            fontFamily: 'var(--font-ui)',
          }}
        >
          Accept Theirs
        </button>
      </div>
    </div>
  );
}
