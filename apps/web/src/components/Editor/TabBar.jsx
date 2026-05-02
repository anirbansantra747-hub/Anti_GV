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
        background: 'var(--panel-bg)',
        overflowX: 'auto',
        flexShrink: 0,
        height: 35,
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
              padding: '0 10px 0 14px',
              height: 35,
              background: isActive ? 'var(--app-bg)' : '#2d2d2d',
              borderRight: '1px solid #252526',
              color: isActive ? '#ffffff' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontSize: 13,
              whiteSpace: 'nowrap',
              flexShrink: 0,
              userSelect: 'none',
              position: 'relative',
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
            {/* VS Code active indicator line */}
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 1,
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
                opacity: isActive || isDirty ? 1 : 0,
                transition: 'background 0.1s',
                marginLeft: 4,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'none';
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
