import React from 'react';
import { useEditorStore } from '../../stores/editorStore';

export default function TabBar() {
  const { openTabs, activeFile, dirtyFiles, openFile, closeTab } = useEditorStore();

  if (openTabs.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        background: '#0f172a',
        borderBottom: '1px solid #1e293b',
        overflowX: 'auto',
        scrollbarWidth: 'none', // hide scrollbar for firefox
        msOverflowStyle: 'none', // hide scrollbar for IE 10+
      }}
    >
      {openTabs.map((path) => {
        const isActive = activeFile === path;
        const isDirty = dirtyFiles.has(path);
        const filename = path.split('/').pop() || path;

        return (
          <div
            key={path}
            onClick={() => openFile(path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '8px 16px',
              background: isActive ? '#1e293b' : 'transparent',
              borderRight: '1px solid #1e293b',
              borderTop: isActive ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              color: isActive ? '#f8fafc' : '#94a3b8',
              fontSize: '0.875rem',
              minWidth: '120px',
              userSelect: 'none',
            }}
          >
            <span style={{ marginRight: '8px' }}>{filename}</span>
            {isDirty && (
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#eab308',
                  marginRight: '8px',
                }}
              />
            )}
            <span
              onClick={(e) => {
                e.stopPropagation();
                closeTab(path);
              }}
              style={{
                marginLeft: 'auto',
                padding: '2px',
                borderRadius: '4px',
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#334155')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              ×
            </span>
          </div>
        );
      })}
    </div>
  );
}
