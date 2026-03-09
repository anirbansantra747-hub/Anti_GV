/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useCallback } from 'react';
import { useAgentStore } from '../../stores/agentStore';
import TreeNode from './TreeNode';

export default function FileTree() {
  const socket = useAgentStore((state) => state.socket);
  const [treeData, setTreeData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTree = useCallback(() => {
    if (!socket) return;

    setIsLoading(true);
    socket.emit('fs:list', { path: '.' }, (response) => {
      setIsLoading(false);
      if (response.success) {
        // Build a hierarchical tree from the flat list
        const builtTree = buildTreeHierarchy(response.items);
        setTreeData(builtTree);
        setError(null);
      } else {
        setError(response.error);
      }
    });
  }, [socket]);

  useEffect(() => {
    // Initial fetch
    if (socket) {
      fetchTree();

      // Listen for any file changes from the backend to refresh the tree
      socket.on('fs:file_changed', fetchTree);

      return () => {
        socket.off('fs:file_changed', fetchTree);
      };
    }
  }, [socket, fetchTree]);

  if (isLoading && treeData.length === 0) {
    return (
      <div style={{ color: '#64748b', fontSize: '0.875rem', padding: '16px' }}>
        Loading workspace...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: '#ef4444', fontSize: '0.875rem', padding: '16px' }}>Error: {error}</div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {treeData.map((node) => (
        <TreeNode key={node.path} node={node} depth={0} />
      ))}
    </div>
  );
}

// --- Helper to convert flat fs:list into a nested hierarchy ---
function buildTreeHierarchy(flatList) {
  const rootObj = { path: '', name: 'root', type: 'dir', children: [] };

  // Sort: directories first, then alphabetical
  const sorted = [...flatList].sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  sorted.forEach((item) => {
    // Determine the type: if it's a directory, ensure it has a children array
    const node = {
      name: item.name,
      path: item.path,
      type: item.isDirectory ? 'dir' : 'file',
    };
    if (item.isDirectory) node.children = [];

    const segments = item.path.split('/').filter(Boolean);

    // Find where this node belongs
    let currentLevel = rootObj.children;
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      const existingDir = currentLevel.find((n) => n.name === seg && n.type === 'dir');

      // This shouldn't normally happen if flatList is complete, but just in case
      if (existingDir) {
        currentLevel = existingDir.children;
      }
    }

    // Check if it already exists to prevent duplicates (edge case protection)
    if (!currentLevel.find((n) => n.name === node.name)) {
      currentLevel.push(node);
    }
  });

  return rootObj.children;
}
