/* eslint-disable no-unused-vars */
/**
 * @file Terminal.jsx
 * @description Terminal panel stub — shows a placeholder until the code runner is implemented.
 */

import React from 'react';

export default function Terminal() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#080c14',
        fontFamily: '"JetBrains Mono", "Cascadia Code", monospace',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #1e293b',
          padding: '0 12px',
          gap: 2,
          flexShrink: 0,
          height: 34,
        }}
      >
        {['TERMINAL', 'OUTPUT', 'PROBLEMS'].map((label) => (
          <button
            key={label}
            style={{
              background: label === 'TERMINAL' ? '#0f172a' : 'transparent',
              border: 'none',
              borderBottom: label === 'TERMINAL' ? '2px solid #22d3ee' : '2px solid transparent',
              color: label === 'TERMINAL' ? '#e2e8f0' : '#475569',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              padding: '6px 12px',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Terminal body */}
      <div
        style={{
          flex: 1,
          padding: '12px 16px',
          color: '#475569',
          fontSize: 13,
          overflowY: 'auto',
        }}
      >
        <span style={{ color: '#22d3ee' }}>~ Anti_GV</span>
        <span style={{ color: '#334155' }}> $ </span>
        <span style={{ color: '#94a3b8' }}>
          Code runner not yet connected. Click ▶ Run to execute your code.
        </span>
        <br />
        <span style={{ display: 'inline-block', marginTop: 8, color: '#1e293b' }}>
          ─── Powered by WebContainers · Pyodide · Judge0 CE ───
        </span>
      </div>
    </div>
  );
}
