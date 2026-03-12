/* eslint-disable no-unused-vars */
/**
 * @file TerminalPane.jsx
 * @description Terminal panel with integrated code execution.
 * - Real PTY terminal (xterm.js + node-pty) for interactive shell
 * - Code Runner tab: runs active file via WebContainers / Pyodide / Piston
 * - Output tab with stdin input field for feeding input to programs
 * - Problems tab: live error markers parsed from Piston stderr
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

// ── Severity badge colours ────────────────────────────────────
const SEVERITY_COLORS = {
  error: { bg: '#3f1010', border: '#7f1d1d', text: '#fca5a5', icon: '✗' },
  warning: { bg: '#3b2900', border: '#78350f', text: '#fcd34d', icon: '⚠' },
};

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
  const [problems, setProblems] = useState([]); // ErrorMarker[]
  const [stdin, setStdin] = useState(''); // stdin text area content

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

  // ─── Piston socket output + problems listeners ──────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onExecOutput = ({ text }) => {
      setOutputLines((prev) => [...prev, { type: 'stdout', text }]);
    };

    const onExecDone = ({ summary }) => {
      setOutputLines((prev) => [...prev, { type: 'info', text: (summary || '') + '\r\n' }]);
      setIsRunning(false);
    };

    // ← NEW: receive structured error markers
    const onExecProblems = ({ markers }) => {
      setProblems(markers || []);
    };

    socket.on('exec:output', onExecOutput);
    socket.on('exec:done', onExecDone);
    socket.on('exec:problems', onExecProblems);

    return () => {
      socket.off('exec:output', onExecOutput);
      socket.off('exec:done', onExecDone);
      socket.off('exec:problems', onExecProblems);
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
    setProblems([]); // clear previous problems
    setActiveTab('OUTPUT');
    setIsRunning(true);

    const handleOutput = (text) => {
      setOutputLines((prev) => [...prev, { type: 'stdout', text }]);
    };

    const handleExit = (_code) => {
      setIsRunning(false);
    };

    try {
      const code = await fileSystemAPI.readFile(activeFile);
      await executeCode({
        code,
        filename: activeFile.split('/').pop() || activeFile.split('\\').pop() || '',
        socket,
        stdin, // ← pass stdin to execution service
        onOutput: handleOutput,
        onExit: handleExit,
      });
    } catch (err) {
      handleOutput(`\x1b[31m[Error] Could not read file: ${err.message}\x1b[0m\r\n`);
      setIsRunning(false);
    }
  }, [activeFile, isRunning, socket, stdin]);

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
        {TABS.map((tab) => {
          const hasBadge = tab === 'PROBLEMS' && problems.length > 0;
          return (
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
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              {tab}
              {hasBadge && (
                <span
                  style={{
                    background: '#7f1d1d',
                    color: '#fca5a5',
                    borderRadius: 9,
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 5px',
                    lineHeight: 1.5,
                  }}
                >
                  {problems.length}
                </span>
              )}
            </button>
          );
        })}

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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Stdin input bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderBottom: '1px solid #1e293b',
              flexShrink: 0,
              background: '#080c14',
            }}
          >
            <label
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: '#475569',
                letterSpacing: '0.06em',
                flexShrink: 0,
              }}
            >
              STDIN
            </label>
            <input
              type="text"
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Input to pass to the program (newline-separated for multiple inputs)…"
              style={{
                flex: 1,
                background: '#0d1117',
                border: '1px solid #1e293b',
                borderRadius: 4,
                color: '#e2e8f0',
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                padding: '3px 8px',
                outline: 'none',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#22d3ee')}
              onBlur={(e) => (e.target.style.borderColor = '#1e293b')}
            />
          </div>

          {/* Output lines */}
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
        </div>
      )}

      {/* Problems panel */}
      {activeTab === 'PROBLEMS' && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 12,
          }}
        >
          {problems.length === 0 ? (
            <div
              style={{
                padding: '20px 16px',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>✓</span>
              <span>No problems detected. Run a file to check for errors.</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    background: '#0d1117',
                    borderBottom: '1px solid #1e293b',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {['Severity', 'Line', 'Col', 'Message'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '5px 10px',
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.07em',
                        color: '#475569',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {problems.map((p, i) => {
                  const s = SEVERITY_COLORS[p.severity] || SEVERITY_COLORS.error;
                  return (
                    <tr
                      key={i}
                      style={{
                        background: i % 2 === 0 ? 'transparent' : '#0a0f18',
                        borderBottom: '1px solid #131d2e',
                      }}
                    >
                      <td style={{ padding: '5px 10px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            background: s.bg,
                            border: `1px solid ${s.border}`,
                            color: s.text,
                            borderRadius: 4,
                            padding: '1px 6px',
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.04em',
                          }}
                        >
                          {s.icon} {p.severity.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '5px 10px', color: '#94a3b8' }}>{p.line}</td>
                      <td style={{ padding: '5px 10px', color: '#64748b' }}>
                        {p.col > 0 ? p.col : '—'}
                      </td>
                      <td
                        style={{ padding: '5px 10px', color: '#e2e8f0', wordBreak: 'break-word' }}
                      >
                        {p.message}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Renders a string with basic ANSI color codes converted to styled spans.
 */
function AnsiLine({ text }) {
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
