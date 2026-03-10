/* eslint-disable no-unused-vars */
import React, { useState } from 'react';
import { useEditorStore } from '../../stores/editorStore';

export default function TreeNode({ node, depth = 0, parentPath = '' }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { openFile, activeFile } = useEditorStore();

  const isDir = node.type === 'dir';
  const currentPath = parentPath
    ? `${parentPath}/${node.name}`
    : node.name === 'root'
      ? ''
      : `/${node.name}`;
  const absolutePath = currentPath.replace('//', '/'); // safety fallback
  const isActive = activeFile === absolutePath;
  const paddingLeft = Math.max(16, depth * 12 + 16);

  const handleClick = () => {
    if (isDir) {
      setIsExpanded(!isExpanded);
    } else {
      openFile(absolutePath);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: `4px 16px 4px ${paddingLeft}px`,
          cursor: 'pointer',
          background: isActive ? '#1e293b' : 'transparent',
          color: isActive ? '#f8fafc' : '#94a3b8',
          fontSize: '0.8125rem',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
        onMouseEnter={(e) => {
          if (!isActive) e.currentTarget.style.background = '#1e293b';
        }}
        onMouseLeave={(e) => {
          if (!isActive) e.currentTarget.style.background = 'transparent';
        }}
        title={node.path}
      >
        {isDir ? (
          <span
            style={{
              marginRight: '6px',
              fontSize: '10px',
              transition: 'transform 0.1s',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              display: 'inline-block',
            }}
          >
            ▶
          </span>
        ) : (
          <span style={{ marginRight: '6px', width: '10px', display: 'inline-block' }}>
            {/* simple invisible spacer so files align with folders */}
          </span>
        )}

        {/* Simple Icons */}
        <span style={{ marginRight: '6px', fontSize: '14px' }}>
          {isDir ? (isExpanded ? '📂' : '📁') : '📄'}
        </span>

        {node.name}
      </div>

      {isDir && isExpanded && node.children && (
        <div>
          {node.children.map((childNode) => (
            <TreeNode
              key={childNode.id || childNode.name}
              node={childNode}
              depth={depth + 1}
              parentPath={absolutePath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
