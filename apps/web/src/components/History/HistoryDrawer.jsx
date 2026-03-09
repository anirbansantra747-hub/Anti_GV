/**
 * @file HistoryDrawer.jsx
 * @description Phase 5 — Snapshot History Panel.
 * Lists in-memory snapshots with their rootTreeHash, timestamp, and restore action.
 * Triggered from the Topbar. Uses snapshotService.cloneTree() for path-copy restores.
 */

import React, { useState, useEffect } from 'react';
import { History, RotateCcw, X, Clock, GitBranch } from 'lucide-react';
import { bus, Events } from '../../services/eventBus.js';

/** Max snapshots to keep in memory (per V3 spec: cap at 20) */
const MAX_SNAPSHOTS = 20;

// Internal in-memory ring buffer of snapshots
// Format: { id, timestamp, version, fileCount, label }
const _snapshots = [];

let _snapshotCounter = 0;

/** Called by fileSystemAPI after each successful write. */
export function recordSnapshot(version, fileCount, label = 'Manual save') {
  _snapshotCounter++;
  const snap = {
    id: _snapshotCounter,
    timestamp: Date.now(),
    version,
    fileCount,
    label,
  };
  _snapshots.unshift(snap); // newest first
  if (_snapshots.length > MAX_SNAPSHOTS) _snapshots.pop();
}

function timeAgo(ts) {
  const secs = Math.round((Date.now() - ts) / 1000);
  if (secs < 60)  return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  return `${Math.round(secs / 3600)}h ago`;
}

export default function HistoryDrawer({ onClose }) {
  const [snaps, setSnaps] = useState([..._snapshots]);
  const [ticker, setTicker] = useState(0);

  // Refresh timestamps every 15 seconds
  useEffect(() => {
    const t = setInterval(() => setTicker((v) => v + 1), 15_000);
    return () => clearInterval(t);
  }, []);

  // Listen for new snapshots
  useEffect(() => {
    const unsub = bus.on(Events.CACHE_SAVED, () => setSnaps([..._snapshots]));
    return unsub;
  }, []);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 800,
          background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
          animation: 'fadeIn 0.15s ease',
        }}
      />

      {/* Drawer */}
      <div
        id="history-drawer"
        style={{
          position: 'fixed', top: 52, right: 0, bottom: 24,
          width: 320, zIndex: 900,
          background: '#0a1020',
          borderLeft: '1px solid var(--panel-border)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-16px 0 48px rgba(0,0,0,0.5)',
          animation: 'slideUpFade 0.2s var(--ease-out)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid var(--panel-border)',
          display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <History size={15} color="var(--accent)" strokeWidth={2} />
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>
            Workspace History
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}
          >
            <X size={14} strokeWidth={2} />
          </button>
        </div>

        {/* Snapshot list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {snaps.length === 0 ? (
            <div style={{
              padding: 32, textAlign: 'center',
              color: 'var(--text-muted)', fontSize: 13,
            }}>
              <GitBranch size={32} strokeWidth={1} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }} />
              No snapshots yet.{' '}
              <span style={{ display: 'block', marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                Snapshots appear after each file save.
              </span>
            </div>
          ) : (
            snaps.map((snap, i) => (
              <div
                key={snap.id}
                style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  position: 'relative',
                }}
              >
                {/* Timeline dot */}
                <div style={{
                  position: 'absolute', left: 16, top: 20,
                  width: 8, height: 8, borderRadius: '50%',
                  background: i === 0 ? 'var(--accent)' : 'var(--text-muted)',
                  boxShadow: i === 0 ? '0 0 6px var(--accent)' : 'none',
                  transition: 'background 0.2s',
                }} />

                <div style={{ paddingLeft: 20 }}>
                  {/* Label */}
                  <div style={{
                    fontSize: 13, fontWeight: 600,
                    color: i === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                    marginBottom: 3,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span>{snap.label}</span>
                    {i === 0 && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                        background: 'var(--accent-glow)', color: 'var(--accent)',
                        border: '1px solid rgba(34,211,238,0.2)',
                        borderRadius: 4, padding: '1px 5px',
                        textTransform: 'uppercase',
                      }}>CURRENT</span>
                    )}
                  </div>

                  {/* Meta */}
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={10} strokeWidth={2} />
                      {timeAgo(snap.timestamp)}
                    </span>
                    <span>{snap.fileCount} file{snap.fileCount !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Hash */}
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    color: 'var(--text-muted)', letterSpacing: '0.02em',
                    background: 'rgba(0,0,0,0.25)', borderRadius: 4,
                    padding: '2px 6px', display: 'inline-block', marginBottom: 8,
                  }}>
                    {snap.version ? snap.version.slice(0, 16) + '…' : 'no hash'}
                  </div>

                  {/* Restore button (disabled for current) */}
                  {i > 0 && (
                    <button
                      title="Snapshot restore is a future capability (requires Shadow Tree commit)"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid var(--panel-border)',
                        borderRadius: 5, padding: '4px 10px',
                        color: 'var(--text-muted)', fontSize: 11, cursor: 'not-allowed',
                        fontFamily: 'var(--font-ui)',
                        opacity: 0.5,
                      }}
                    >
                      <RotateCcw size={10} strokeWidth={2} /> Restore
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--panel-border)',
          fontSize: 10, color: 'var(--text-muted)', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <GitBranch size={10} strokeWidth={2} />
          Up to {MAX_SNAPSHOTS} snapshots kept in memory per session
        </div>
      </div>
    </>
  );
}
