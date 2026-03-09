/**
 * @file StatusBar.jsx
 * @description VS Code-style bottom status bar for Anti_GV IDE.
 * Shows: WebSocket connection, workspace state, tab role, active file language, cursor position.
 */

import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore.js';
import { useFileSystemStore } from '../../stores/fileSystemStore.js';

const LANG_MAP = {
  js: 'JavaScript', jsx: 'JavaScript React', ts: 'TypeScript', tsx: 'TypeScript React',
  py: 'Python', json: 'JSON', md: 'Markdown', html: 'HTML', css: 'CSS',
  scss: 'SCSS', sh: 'Shell', yaml: 'YAML', yml: 'YAML', txt: 'Plain Text',
  rs: 'Rust', go: 'Go', cpp: 'C++', c: 'C', java: 'Java', rb: 'Ruby',
};

function getLang(path) {
  if (!path) return null;
  const ext = path.split('.').pop().toLowerCase();
  return LANG_MAP[ext] || ext.toUpperCase();
}

const STATE_COLORS = {
  IDLE:        '#22c55e',
  AI_PENDING:  '#f59e0b',
  DIFF_REVIEW: '#3b82f6',
  COMMITTING:  '#a855f7',
  CONFLICT:    '#ef4444',
  ERROR:       '#ef4444',
};

export default function StatusBar({ tabRole = 'unknown', isConnected = false, cursorPos = null }) {
  const activeFile     = useEditorStore((s) => s.activeFile);
  const workspaceState = useFileSystemStore((s) => s.workspaceState) || 'IDLE';

  const lang       = getLang(activeFile);
  const stateColor = STATE_COLORS[workspaceState] || '#22c55e';
  const connColor  = isConnected ? '#22c55e' : '#ef4444';

  const cellStyle = {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '0 10px', height: '100%',
    borderRight: '1px solid rgba(255,255,255,0.05)',
    cursor: 'default', whiteSpace: 'nowrap',
    transition: 'background 0.15s',
    fontSize: 11, fontWeight: 500,
    color: 'var(--text-secondary)',
    letterSpacing: '0.02em',
  };

  return (
    <div
      id="status-bar"
      style={{
        height: 'var(--statusbar-h)',
        background: '#060a12',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ── Left items ──────────────────────────────────────────── */}

      {/* Connection dot */}
      <div
        style={{
          ...cellStyle,
          background: `${connColor}10`,
          borderRight: `1px solid ${connColor}20`,
          color: connColor,
        }}
        title={isConnected ? 'Server connected' : 'Server disconnected'}
      >
        <span style={{
          width: 6, height: 6, borderRadius: '50%', background: connColor, flexShrink: 0,
          boxShadow: isConnected ? `0 0 6px ${connColor}` : 'none',
          animation: isConnected ? 'none' : 'pulse 1.4s ease-in-out infinite',
        }} />
        {isConnected ? 'Connected' : 'Offline'}
      </div>

      {/* Workspace state */}
      <div
        style={{ ...cellStyle, color: stateColor }}
        title={`Workspace state: ${workspaceState}`}
      >
        <span style={{
          width: 5, height: 5, borderRadius: '50%', background: stateColor, flexShrink: 0,
          animation: workspaceState !== 'IDLE' ? 'pulse 1.4s ease-in-out infinite' : 'none',
        }} />
        {workspaceState}
      </div>

      {/* Tab role (dev only) */}
      <div style={{ ...cellStyle, fontFamily: 'var(--font-mono)' }} title="Tab role (master writes, slave mirrors)">
        {tabRole.toUpperCase()}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* ── Right items ─────────────────────────────────────────── */}

      {/* Cursor position */}
      {cursorPos && (
        <div style={{ ...cellStyle, borderLeft: '1px solid rgba(255,255,255,0.05)', borderRight: 'none', fontFamily: 'var(--font-mono)' }}>
          Ln {cursorPos.lineNumber}, Col {cursorPos.column}
        </div>
      )}

      {/* Language */}
      {lang && (
        <div style={{ ...cellStyle, borderLeft: '1px solid rgba(255,255,255,0.05)', borderRight: 'none', color: 'var(--accent)' }}>
          {lang}
        </div>
      )}

      {/* UTF-8 label */}
      <div style={{ ...cellStyle, borderLeft: '1px solid rgba(255,255,255,0.05)', borderRight: 'none' }}>
        UTF-8
      </div>
    </div>
  );
}
