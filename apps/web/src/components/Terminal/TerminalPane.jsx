/* eslint-disable no-unused-vars */
/**
 * @file TerminalPane.jsx
 * @description Terminal panel with integrated code execution.
 * - Real PTY terminal (xterm.js + node-pty) for interactive shell
 * - Code Runner tab: runs active file via WebContainers / Pyodide / Piston
 * - Output tab with stdin input field for feeding input to programs
 * - Problems tab: live error markers parsed from Piston stderr
 *
 * Design: Industrial Avant-Garde (Impeccable Standard)
 * - OKLCH colors via CSS variables
 * - Space Grotesk UI font
 * - Hard edges, sharp borders, no rounding
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useAgentStore } from '../../stores/agentStore.js';
import { useEditorStore } from '../../stores/editorStore.js';
import { executeCode } from '../../services/execution/executionService.js';
import { fileSystemAPI } from '../../services/fileSystemAPI.js';
import { contextService } from '../../services/contextService.js';

const TABS = ['TERMINAL', 'OUTPUT', 'PROBLEMS'];

// ── Severity badge colours (OKLCH-inspired) ────────────────────────────────
const SEVERITY_COLORS = {
  error: { bg: '#2a0a0a', border: '#7f1d1d', text: '#fca5a5', icon: '✗' },
  warning: { bg: '#2a1a00', border: '#78350f', text: '#fcd34d', icon: '⚠' },
};

// ── Shared brutalist styles ────────────────────────────────────────────────
const TAB_BASE = {
  background: 'transparent',
  border: 'none',
  borderBottom: '3px solid transparent',
  color: 'var(--text-muted)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  padding: '0 14px',
  height: '100%',
  cursor: 'pointer',
  transition: 'color 0.1s, border-color 0.1s',
  fontFamily: 'var(--font-ui)',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const TAB_ACTIVE = {
  ...TAB_BASE,
  color: 'var(--accent)',
  borderBottom: '3px solid var(--accent)',
};

export default function TerminalPane() {
  const terminalRef = useRef(null);
  const outputRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const containerRef = useRef(null);
  const socket = useAgentStore((state) => state.socket);
  const activeFile = useEditorStore((state) => state.activeFile);

  const [isSpawned, setIsSpawned] = useState(false);
  const [activeTab, setActiveTab] = useState('TERMINAL');
  const [outputLines, setOutputLines] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [problems, setProblems] = useState([]);
  const [stdin, setStdin] = useState('');
  const [shellType, setShellType] = useState('powershell');

  // ─── xterm.js setup ────────────────────────────────────────────────────────
  const launchTerminal = useCallback(
    (term, fitAddon, type) => {
      socket.emit(
        'terminal:spawn',
        { cols: term.cols, rows: term.rows, shell: type },
        (response) => {
          if (response?.success) setIsSpawned(true);
          else term.write(`\r\n\x1b[31mFailed to spawn terminal: ${response?.error}\x1b[0m\r\n`);
        }
      );
    },
    [socket]
  );

  useEffect(() => {
    if (!terminalRef.current || !socket) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      lineHeight: 1.5,
      letterSpacing: 0.5,
      theme: {
        background: '#0d0f14',
        foreground: 'oklch(90% 0.01 250)',
        cursor: 'oklch(65% 0.18 35)' /* Accent orange */,
        cursorAccent: '#0d0f14',
        selectionBackground: 'oklch(30% 0.01 250)',
        black: '#1e2030',
        brightBlack: '#444b6a',
        red: '#ff5555',
        brightRed: '#ff6e6e',
        green: '#50fa7b',
        brightGreen: '#69ff94',
        yellow: '#f1fa8c',
        brightYellow: '#ffffa5',
        blue: '#bd93f9',
        brightBlue: '#d6acff',
        magenta: '#ff79c6',
        brightMagenta: '#ff92df',
        cyan: '#8be9fd',
        brightCyan: '#a4ffff',
        white: '#f8f8f2',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(terminalRef.current);

    // Defer fit to allow DOM to settle
    requestAnimationFrame(() => fitAddon.fit());

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    launchTerminal(term, fitAddon, shellType);

    const onDataDisposable = term.onData((data) => socket.emit('terminal:input', { input: data }));

    const onOutput = (payload) => {
      term.write(payload.data);
      // Feed terminal output to contextService for AI context
      contextService.appendTerminalOutput(payload.data);
    };
    socket.on('terminal:output', onOutput);

    const handleResize = () => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        socket.emit('terminal:resize', { cols: term.cols, rows: term.rows });
      });
    };
    window.addEventListener('resize', handleResize);

    // Also create a ResizeObserver on the container for panel drags
    let ro;
    if (terminalRef.current) {
      ro = new ResizeObserver(() => handleResize());
      ro.observe(terminalRef.current.parentElement || terminalRef.current);
    }

    return () => {
      onDataDisposable.dispose();
      socket.off('terminal:output', onOutput);
      window.removeEventListener('resize', handleResize);
      ro?.disconnect();
      term.dispose();
    };
  }, [socket]);

  // ─── Shell Re-spawn ───────────────────────────────────────────────────────
  const handleShellChange = (newShell) => {
    setShellType(newShell);
    if (xtermRef.current) {
      xtermRef.current.clear();
      xtermRef.current.write('\r\n\x1b[33mRestarting terminal...\x1b[0m\r\n');
      launchTerminal(xtermRef.current, fitAddonRef.current, newShell);
    }
  };

  // ─── Piston socket output + problems listeners ──────────────────────────────
  useEffect(() => {
    if (!socket) return;

    const onExecOutput = ({ text }) => {
      setOutputLines((prev) => [...prev, { type: 'stdout', text }]);
      contextService.appendTerminalOutput(text);
    };

    const onExecDone = ({ summary }) => {
      setOutputLines((prev) => [...prev, { type: 'info', text: summary + '\r\n' }]);
      contextService.appendTerminalOutput(summary);
      setIsRunning(false);
    };
    const onExecProblems = ({ markers }) => setProblems(markers || []);

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
    setProblems([]);
    setActiveTab('OUTPUT');
    setIsRunning(true);

    const handleOutput = (text) => setOutputLines((p) => [...p, { type: 'stdout', text }]);
    const handleExit = () => setIsRunning(false);

    try {
      const code = await fileSystemAPI.readFile(activeFile);
      await executeCode({
        code,
        filename: activeFile.split('/').pop() || activeFile.split('\\').pop() || '',
        socket,
        stdin,
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
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--app-bg)',
        borderTop: '1px solid var(--panel-border)',
        overflow: 'hidden',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'stretch',
          borderBottom: '1px solid var(--panel-border)',
          padding: '0 8px',
          gap: 2,
          flexShrink: 0,
          height: 38,
          background: 'var(--panel-bg)',
        }}
      >
        {TABS.map((tab) => {
          const hasBadge = tab === 'PROBLEMS' && problems.length > 0;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={isActive ? TAB_ACTIVE : TAB_BASE}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--text-secondary)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              {tab}
              {hasBadge && (
                <span
                  style={{
                    background: SEVERITY_COLORS.error.bg,
                    border: `1px solid ${SEVERITY_COLORS.error.border}`,
                    color: SEVERITY_COLORS.error.text,
                    borderRadius: 0,
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

        {/* Shell Selector */}
        <select
          value={shellType}
          onChange={(e) => handleShellChange(e.target.value)}
          style={{
            background: 'var(--app-bg)',
            color: 'var(--text-secondary)',
            border: '1px solid var(--panel-border)',
            borderRadius: 0,
            padding: '2px 8px',
            fontSize: 10,
            fontFamily: 'var(--font-ui)',
            fontWeight: 700,
            margin: '6px 8px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="powershell">POWERSHELL</option>
          <option value="bash">BASH (WSL)</option>
          <option value="git-bash">GIT BASH</option>
        </select>

        {/* Run Button */}
        <button
          onClick={handleRun}
          disabled={isRunning || !activeFile}
          title={activeFile ? `Run ${activeFile}` : 'Open a file to run'}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: isRunning ? 'transparent' : 'var(--accent)',
            color: isRunning ? 'var(--green)' : '#000000',
            border: isRunning ? '1px solid var(--green)' : '1px solid var(--accent-dim)',
            borderRadius: 0,
            padding: '0 14px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: isRunning || !activeFile ? 'not-allowed' : 'pointer',
            opacity: !activeFile ? 0.4 : 1,
            transition: 'all 0.1s',
            height: '100%',
            margin: '0',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {isRunning ? (
            <>
              <span
                style={{
                  display: 'inline-block',
                  width: 7,
                  height: 7,
                  background: 'var(--green)',
                  animation: 'pulse 1s infinite',
                }}
              />
              RUNNING
            </>
          ) : (
            <>▶ RUN</>
          )}
        </button>
      </div>

      {/* ── TERMINAL TAB (always mounted, hidden when inactive) ── */}
      <div
        style={{
          flex: 1,
          padding: '8px 4px 4px 4px',
          overflow: 'hidden',
          display: activeTab === 'TERMINAL' ? 'block' : 'none',
          minHeight: 0,
        }}
        ref={terminalRef}
      />

      {/* ── OUTPUT TAB ── */}
      {activeTab === 'OUTPUT' && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minHeight: 0,
          }}
        >
          {/* STDIN bar */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              borderBottom: '1px solid var(--panel-border)',
              flexShrink: 0,
              background: 'var(--panel-bg)',
            }}
          >
            <label
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--text-muted)',
                letterSpacing: '0.1em',
                flexShrink: 0,
                fontFamily: 'var(--font-ui)',
                textTransform: 'uppercase',
              }}
            >
              STDIN
            </label>
            <input
              type="text"
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Input to pass to the program…"
              style={{
                flex: 1,
                background: 'var(--app-bg)',
                border: '1px solid var(--panel-border)',
                borderRadius: 0,
                color: 'var(--text-primary)',
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
                padding: '4px 8px',
                outline: 'none',
                transition: 'border-color 0.1s',
              }}
              onFocus={(e) => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={(e) => (e.target.style.borderColor = 'var(--panel-border)')}
            />
          </div>

          {/* Output lines */}
          <div
            ref={outputRef}
            style={{
              flex: 1,
              padding: '12px 16px',
              overflowY: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              lineHeight: 1.7,
              color: 'var(--text-code)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              minHeight: 0,
            }}
          >
            {outputLines.length === 0 && !isRunning && (
              <span style={{ color: 'var(--text-muted)' }}>
                Press ▶ RUN to execute the active file…
              </span>
            )}
            {outputLines.map((line, i) => (
              <AnsiLine key={i} text={line.text} />
            ))}
            {isRunning && <span style={{ color: 'var(--text-muted)' }}>⟳ Running…</span>}
          </div>
        </div>
      )}

      {/* ── PROBLEMS TAB ── */}
      {activeTab === 'PROBLEMS' && (
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            minHeight: 0,
          }}
        >
          {problems.length === 0 ? (
            <div
              style={{
                padding: '24px 16px',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontFamily: 'var(--font-ui)',
              }}
            >
              <span style={{ fontSize: 18, color: 'var(--green)' }}>✓</span>
              <span>No problems detected. Run a file to check for errors.</span>
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  style={{
                    background: 'var(--panel-bg)',
                    borderBottom: '1px solid var(--panel-border)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                  }}
                >
                  {['Severity', 'Line', 'Col', 'Message'].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: '6px 12px',
                        textAlign: 'left',
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        color: 'var(--text-muted)',
                        fontFamily: 'var(--font-ui)',
                        textTransform: 'uppercase',
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
                        background: i % 2 === 0 ? 'transparent' : 'var(--panel-bg)',
                        borderBottom: '1px solid var(--panel-border)',
                      }}
                    >
                      <td style={{ padding: '6px 12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            background: s.bg,
                            border: `1px solid ${s.border}`,
                            color: s.text,
                            borderRadius: 0,
                            padding: '1px 6px',
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                          }}
                        >
                          {s.icon} {p.severity.toUpperCase()}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '6px 12px',
                          color: 'var(--text-secondary)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {p.line}
                      </td>
                      <td
                        style={{
                          padding: '6px 12px',
                          color: 'var(--text-muted)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {p.col > 0 ? p.col : '—'}
                      </td>
                      <td
                        style={{
                          padding: '6px 12px',
                          color: 'var(--text-primary)',
                          wordBreak: 'break-word',
                        }}
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
    35: '#c084fc', // magenta
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
