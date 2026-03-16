/* eslint-disable no-unused-vars */
/**
 * @file TabBar.jsx
 * @description Sleek open-file tab strip above the Monaco editor.
 */

import React from 'react';
import { useEditorStore } from '../../stores/editorStore.js';
import { Circle, X } from 'lucide-react';

function getBasename(path) {
  return path ? path.split('/').pop() : '';
}

export default function TabBar() {
  const openTabs = useEditorStore((s) => s.openTabs);
  const activeFile = useEditorStore((s) => s.activeFile);
  const dirtyFiles = useEditorStore((s) => s.dirtyFiles);
  const openFile = useEditorStore((s) => s.openFile);
  const closeTab = useEditorStore((s) => s.closeTab);

  if (openTabs.length === 0) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        background: 'rgba(11,12,16,0.5)',
        borderBottom: '1px solid var(--panel-border)',
        overflowX: 'auto',
        flexShrink: 0,
        height: 40,
        padding: '0 8px',
        gap: 4,
      }}
    >
      {openTabs.map((path) => {
        const isActive = path === activeFile;
        const isDirty = dirtyFiles.has(path);
        const name = getBasename(path);
        return (
          <div
            key={path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 14px',
              height: 34,
              borderRadius: 0,
              background: isActive ? 'var(--panel-bg)' : 'transparent',
              border: isActive ? '1px solid var(--accent)' : '1px solid transparent',
              borderBottom: 'none',
              color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: isActive ? 700 : 400,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              transition: 'background 0.1s, color 0.1s',
              userSelect: 'none',
              position: 'relative',
              boxShadow: 'none',
            }}
            onClick={() => openFile(path)}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'var(--panel-bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }
            }}
          >
            {/* Brutalist active indicator block */}
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 4,
                  background: 'var(--accent)',
                }}
              />
            )}

            {isDirty && (
              <Circle size={8} fill="#f59e0b" color="#f59e0b" style={{ flexShrink: 0 }} />
            )}
            <span>{name}</span>

            <button
              title={`Close ${name}`}
              onClick={(e) => {
                e.stopPropagation();
                if (isDirty) {
                  const ok = window.confirm(`Discard unsaved changes to "${name}"?`);
                  if (!ok) return;
                }
                closeTab(path);
              }}
              style={{
                background: 'none',
                border: 'none',
                padding: 2,
                color: 'inherit',
                cursor: 'pointer',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0.5,
                transition: 'all 0.1s',
                marginLeft: 2,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.background = 'var(--red)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '0.5';
                e.currentTarget.style.background = 'none';
                e.currentTarget.style.color = 'inherit';
              }}
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
