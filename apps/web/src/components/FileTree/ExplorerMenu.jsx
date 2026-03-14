/* eslint-disable no-unused-vars */
/**
 * @file ExplorerMenu.jsx
 * @description Three-dot dropdown menu for the Explorer panel header.
 * Provides: Open Folder, New File, New Folder, Refresh.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  openDirectoryViaFSA,
  openFilesViaInput,
  supportsDirectoryPicker,
} from '../../services/localFileService.js';

export default function ExplorerMenu({ onNewFile, onNewFolder }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const items = [
    {
      label: 'Open Folder...',
      action: () => {
        if (supportsDirectoryPicker) {
          openDirectoryViaFSA().catch((error) =>
            console.error('[ExplorerMenu] Open folder failed:', error)
          );
          return;
        }

        openFilesViaInput({ directory: true }).catch((error) =>
          console.error('[ExplorerMenu] Open folder import failed:', error)
        );
      },
    },
    { label: 'New File', action: onNewFile },
    { label: 'New Folder', action: onNewFolder },
    { divider: true },
    { label: 'Refresh', action: () => window.location.reload() },
  ];

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="Explorer actions"
        style={{
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          cursor: 'pointer',
          fontSize: '16px',
          padding: '2px 6px',
          lineHeight: 1,
          borderRadius: '3px',
          transition: 'background 0.1s, color 0.1s',
        }}
        onMouseEnter={(e) => {
          e.target.style.background = 'rgba(255,255,255,0.08)';
          e.target.style.color = '#e2e8f0';
        }}
        onMouseLeave={(e) => {
          e.target.style.background = 'transparent';
          e.target.style.color = '#94a3b8';
        }}
      >
        ...
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: 4,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '6px',
            padding: '4px 0',
            minWidth: '180px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            zIndex: 1000,
          }}
        >
          {items.map((item, i) =>
            item.divider ? (
              <div key={i} style={{ height: 1, background: '#334155', margin: '4px 0' }} />
            ) : (
              <button
                key={i}
                onClick={() => {
                  setOpen(false);
                  item.action?.();
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  color: '#cbd5e1',
                  padding: '7px 14px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.target.style.background = 'rgba(56,189,248,0.1)')}
                onMouseLeave={(e) => (e.target.style.background = 'transparent')}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
