/* eslint-disable no-unused-vars */
import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useAgentStore } from '../../stores/agentStore';

export default function TerminalPane() {
  const terminalRef = useRef(null);
  const xtermRef = useRef(null);
  const fitAddonRef = useRef(null);
  const socket = useAgentStore((state) => state.socket);
  const [isSpawned, setIsSpawned] = useState(false);

  useEffect(() => {
    if (!terminalRef.current || !socket) return;

    // 1. Initialize xterm.js
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

    // 2. Spawn PTY on backend
    socket.emit('terminal:spawn', { cols: term.cols, rows: term.rows }, (response) => {
      if (response?.success) {
        setIsSpawned(true);
      } else {
        term.write(`\r\n\x1b[31mFailed to spawn terminal: ${response?.error}\x1b[0m\r\n`);
      }
    });

    // 3. User types -> send to backend
    const onDataDisposable = term.onData((data) => {
      socket.emit('terminal:input', { input: data });
    });

    // 4. Backend outputs -> write to frontend
    const onOutput = (payload) => {
      term.write(payload.data);
    };
    socket.on('terminal:output', onOutput);

    // 5. Handle Resize
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
      <div
        style={{
          padding: '4px 16px',
          fontSize: '0.75rem',
          color: '#64748b',
          background: '#0f172a',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          fontWeight: 600,
        }}
      >
        Terminal
      </div>
      <div style={{ flex: 1, padding: '8px', overflow: 'hidden' }} ref={terminalRef} />
    </div>
  );
}
