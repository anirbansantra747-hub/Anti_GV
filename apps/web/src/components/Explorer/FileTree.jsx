/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import { useFileSystemStore } from '../../stores/fileSystemStore';
import TreeNode from './TreeNode';

export default function FileTree() {
  const socket = useAgentStore((state) => state.socket);
  const treeData = useFileSystemStore((state) => state.treeData);
  const workspaceState = useFileSystemStore((state) => state.workspaceState);

  if (workspaceState === 'ERROR') {
    return (
      <div style={{ color: '#ef4444', fontSize: '0.875rem', padding: '16px' }}>
        Workspace frozen due to Integrity Failure. Please reload.
      </div>
    );
  }

  if (!treeData || treeData.length === 0) {
    return (
      <div style={{ color: '#64748b', fontSize: '0.875rem', padding: '16px' }}>
        Loading workspace...
      </div>
    );
  }

  const handleOpenFolder = () => {
    if (!socket) {
      console.error('[Explorer FileTree] Socket not connected');
      return;
    }
    console.log('[Explorer FileTree] Emitting fs:pick_folder to open folder picker');
    socket.emit('fs:pick_folder', {}, (response) => {
      if (response?.success) {
        console.log(`[Explorer FileTree] Folder opened successfully: ${response.newRoot}`);
      } else if (!response?.canceled) {
        console.error('[Explorer FileTree] Failed to open folder:', response?.error);
      }
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid #1e293b',
          background: '#0f172a',
        }}
      >
        <span
          style={{
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#94a3b8',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          Explorer
        </span>
        <button
          onClick={handleOpenFolder}
          title="Open Folder from PC"
          style={{
            background: 'transparent',
            border: '1px solid #334155',
            borderRadius: '4px',
            padding: '2px 8px',
            color: '#38bdf8',
            cursor: 'pointer',
            fontSize: '0.7rem',
          }}
        >
          Open Folder
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {treeData[0]?.children?.length === 0 ? (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              color: '#64748b',
              fontSize: '0.875rem',
              padding: '32px 16px',
              textAlign: 'center',
              gap: '12px',
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
            </svg>
            <div>This folder is empty</div>
            <div style={{ fontSize: '0.75rem', color: '#475569' }}>
              Create a file or ask the AI to start coding.
            </div>
          </div>
        ) : (
          treeData[0]?.children?.map((node) => <TreeNode key={node.name} node={node} depth={0} />)
        )}
      </div>
    </div>
  );
}
