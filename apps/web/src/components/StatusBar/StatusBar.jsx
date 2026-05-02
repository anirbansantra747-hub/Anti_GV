/* eslint-disable no-unused-vars */
/**
 * @file StatusBar.jsx
 * @description VS Code-style bottom status bar for Anti_GV IDE.
 * Shows: WebSocket connection, workspace state, tab role, active file language, cursor position.
 */

import React, { useEffect, useState } from 'react';
import { useEditorStore } from '../../stores/editorStore.js';
import { useFileSystemStore } from '../../stores/fileSystemStore.js';
import { useAgentStore } from '../../stores/agentStore.js';

const LANG_MAP = {
  js: 'JavaScript',
  jsx: 'JavaScript React',
  ts: 'TypeScript',
  tsx: 'TypeScript React',
  py: 'Python',
  json: 'JSON',
  md: 'Markdown',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  sh: 'Shell',
  yaml: 'YAML',
  yml: 'YAML',
  txt: 'Plain Text',
  rs: 'Rust',
  go: 'Go',
  cpp: 'C++',
  c: 'C',
  java: 'Java',
  rb: 'Ruby',
};

function getLang(path) {
  if (!path) return null;
  const ext = path.split('.').pop().toLowerCase();
  return LANG_MAP[ext] || ext.toUpperCase();
}

const STATE_COLORS = {
  IDLE: 'var(--green)',
  AI_PENDING: 'var(--amber)',
  DIFF_REVIEW: '#3b82f6',
  COMMITTING: 'var(--purple)',
  CONFLICT: 'var(--red)',
  ERROR: 'var(--red)',
};

export default function StatusBar({ tabRole = 'unknown', isConnected = false, cursorPos = null }) {
  const activeFile = useEditorStore((s) => s.activeFile);
  const workspaceState = useFileSystemStore((s) => s.workspaceState) || 'IDLE';
  const socketConnected = useAgentStore((s) => s.isConnected);

  const lang = getLang(activeFile);
  const stateColor = STATE_COLORS[workspaceState] || 'var(--green)';
  const online = socketConnected || isConnected;
  const connColor = online ? '#ffffff' : '#ffcccc';

  const cellStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '0 8px',
    height: '100%',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'background 0.1s',
    fontSize: 12,
    fontWeight: 400,
    color: '#ffffff',
    letterSpacing: '0',
  };

  return (
    <div
      id="status-bar"
      style={{
        height: 22,
        background: '#007acc',
        color: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        flexShrink: 0,
        overflow: 'hidden',
        userSelect: 'none',
        fontSize: 12,
      }}
    >
      {/* ── Left items ──────────────────────────────────────────── */}

      {/* Connection dot */}
      <div
        style={{
          ...cellStyle,
          color: connColor,
        }}
        title={online ? 'Server connected' : 'Server disconnected'}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: connColor,
            flexShrink: 0,
            boxShadow: online ? `0 0 6px ${connColor}` : 'none',
            animation: online ? 'none' : 'pulse 1.4s ease-in-out infinite',
          }}
        />
        {online ? 'Connected' : 'Offline'}
      </div>

      {/* Workspace state */}
      <div style={{ ...cellStyle, color: '#ffffff' }} title={`Workspace state: ${workspaceState}`}>
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: stateColor,
            flexShrink: 0,
            animation: workspaceState !== 'IDLE' ? 'pulse 1.4s ease-in-out infinite' : 'none',
          }}
        />
        {workspaceState}
      </div>

      {/* Tab role (dev only) */}
      <div style={{ ...cellStyle }} title="Tab role (master writes, slave mirrors)">
        {tabRole.toUpperCase()}
      </div>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* ── Right items ─────────────────────────────────────────── */}

      {/* Cursor position */}
      {cursorPos && (
        <div
          style={{
            ...cellStyle,
          }}
        >
          Ln {cursorPos.lineNumber}, Col {cursorPos.column}
        </div>
      )}

      {/* Language */}
      {lang && (
        <div
          style={{
            ...cellStyle,
            fontWeight: 400,
          }}
        >
          {lang}
        </div>
      )}

      {/* UTF-8 label */}
      <div style={{ ...cellStyle }}>UTF-8</div>
    </div>
  );
}
