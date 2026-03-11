/* eslint-disable no-unused-vars */
/**
 * @file TerminalPane.jsx
 * @description Terminal panel with integrated code execution.
 * - Real PTY terminal (xterm.js + node-pty) for interactive shell
 * - Code Runner tab: runs active file via WebContainers / Pyodide / Piston
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useAgentStore } from '../../stores/agentStore.js';
import { useEditorStore } from '../../stores/editorStore.js';
import { executeCode } from '../../services/execution/executionService.js';
import { fileSystemAPI } from '../../services/fileSystemAPI.js';

const TABS = ['TERMINAL', 'OUTPUT', 'PROBLEMS'];

export default function TerminalPane() {
  const terminalRef = useRef(null);
  const outputRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const socket = useAgentStore((state) => state.socket);
  const activeFile = useEditorStore((state) => state.activeFile);
  const [isSpawned, setIsSpawned] = useState(false);
  const [activeTab, setActiveTab] = useState('TERMINAL');
  const [outputLines, setOutputLines] = useState([]);
  const [isRunning, setIsRunning] = useState(false);

  // ─── xterm.js setup ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!terminalRef.current || !socket) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      theme: {
        background: '#080c14',
        foreground: '#e2e8f0',
        cursor: '#cbd5e1',
        selectionBackground: '#334155',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    socket.emit('terminal:spawn', { cols: term.cols, rows: term.rows }, (response) => {
      if (response?.success) setIsSpawned(true);
      else term.write(`\r\n\x1b[31mFailed to spawn terminal: ${response?.error}\x1b[0m\r\n`);
    });

    const onDataDisposable = term.onData((data) => socket.emit('terminal:input', { input: data }));

    const onOutput = (payload) => term.write(payload.data);
    socket.on('terminal:output', onOutput);

    const handleResize = () => {
      fitAddon.fit();
      socket.emit('terminal:resize', { cols: term.cols, rows: term.rows });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      onDataDisposable.dispose();
      socket.off('terminal:output', onOutput);
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [socket]);

  // ─── Piston socket output listeners ────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onExecOutput = ({ text }) => {
      setOutputLines((prev) => [...prev, { type: 'stdout', text }]);
    };

    const onExecDone = ({ summary }) => {
      setOutputLines((prev) => [...prev, { type: 'info', text: summary + '\r\n' }]);
      setIsRunning(false);
    };

    socket.on('exec:output', onExecOutput);
    socket.on('exec:done', onExecDone);
    return () => {
      socket.off('exec:output', onExecOutput);
      socket.off('exec:done', onExecDone);
    };
  }, [socket]);

  // auto-scroll output panel
  useEffect(() => {
    if (outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
  }, [outputLines]);

  // ─── Run code ──────────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (isRunning || !activeFile) return;

    setOutputLines([]);
    setActiveTab('OUTPUT');
    setIsRunning(true);

    const handleOutput = (text) => {
      setOutputLines((prev) => [...prev, { type: 'stdout', text }]);
    };

    const handleExit = (code) => {
      setIsRunning(false);
    };

    try {
      const code = await fileSystemAPI.readFile(activeFile);
      await executeCode({
        code,
        filename: activeFile.split('/').pop() || activeFile.split('\\').pop() || '',
        socket,
        onOutput: handleOutput,
        onExit: handleExit,
      });
    } catch (err) {
      handleOutput(`\x1b[31m[Error] Could not read file: ${err.message}\x1b[0m\r\n`);
      setIsRunning(false);
    }
  }, [activeFile, isRunning, socket]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#080c14',
        borderTop: '1px solid #1e293b',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid #1e293b',
          padding: '0 8px',
          gap: 2,
          flexShrink: 0,
          height: 34,
        }}
      >
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? '#0f172a' : 'transparent',
              border: 'none',
              borderBottom: activeTab === tab ? '2px solid #22d3ee' : '2px solid transparent',
              color: activeTab === tab ? '#e2e8f0' : '#475569',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              padding: '6px 12px',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {tab}
          </button>
        ))}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Run Button */}
        <button
          onClick={handleRun}
          disabled={isRunning || !activeFile}
          title={activeFile ? `Run ${activeFile}` : 'Open a file to run'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: isRunning ? '#1e3a2f' : '#14532d',
            color: isRunning ? '#86efac' : '#4ade80',
            border: '1px solid #166534',
            borderRadius: 4,
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 600,
            cursor: isRunning || !activeFile ? 'not-allowed' : 'pointer',
            opacity: !activeFile ? 0.5 : 1,
            transition: 'all 0.15s',
          }}
        >
          {isRunning ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#86efac',
                  animation: 'pulse 1s infinite',
                }}
              />
              Running...
            </>
          ) : (
            <>▶ Run</>
          )}
        </button>
      </div>

      {/* Terminal panel (always mounted, hidden when not on TERMINAL tab) */}
      <div
        style={{
          flex: 1,
          padding: '8px',
          overflow: 'hidden',
          display: activeTab === 'TERMINAL' ? 'block' : 'none',
        }}
        ref={terminalRef}
      />

      {/* Output panel */}
      {activeTab === 'OUTPUT' && (
        <div
          ref={outputRef}
          style={{
            flex: 1,
            padding: '12px 16px',
            overflowY: 'auto',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
            lineHeight: 1.6,
            color: '#e2e8f0',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {outputLines.length === 0 && !isRunning && (
            <span style={{ color: '#475569' }}>Press ▶ Run to execute the active file...</span>
          )}
          {outputLines.map((line, i) => (
            <AnsiLine key={i} text={line.text} />
          ))}
          {isRunning && <span style={{ color: '#64748b' }}>⟳ Running...</span>}
        </div>
      )}

      {/* Problems panel (stub) */}
      {activeTab === 'PROBLEMS' && (
        <div style={{ flex: 1, padding: '12px 16px', color: '#475569', fontSize: 13 }}>
          No problems detected.
        </div>
      )}
    </div>
  );
}

/**
 * Renders a string with basic ANSI color codes converted to styled spans.
 */
function AnsiLine({ text }) {
  // Convert ANSI escape codes to span elements
  const parts = [];
  const ansiRegex = /\x1b\[(\d+)m/g;
  const colorMap = {
    31: '#f87171', // red
    32: '#4ade80', // green
    33: '#facc15', // yellow
    34: '#60a5fa', // blue
    36: '#22d3ee', // cyan
    0: null, // reset
  };

  let lastIndex = 0;
  let currentColor = null;
  let match;

  while ((match = ansiRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), color: currentColor });
    }
    currentColor = colorMap[match[1]] ?? null;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), color: currentColor });
  }

  if (parts.length === 0) parts.push({ text, color: null });

  return (
    <span>
      {parts.map((p, i) => (
        <span key={i} style={p.color ? { color: p.color } : undefined}>
          {p.text}
        </span>
      ))}
    </span>
  );
}
