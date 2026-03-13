/* eslint-disable no-unused-vars */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import FileTree from './components/FileTree/FileTree';
import MonacoEditor from './components/Editor/MonacoEditor';
import TabBar from './components/Editor/TabBar';
import AIPanel from './components/AIPanel/AIPanel';
import Terminal from './components/Terminal/TerminalPane';
import Topbar from './components/Topbar/Topbar';
import StatusBar from './components/StatusBar/StatusBar';
import QuickOpen from './components/QuickOpen/QuickOpen';
import { handleDrop } from './services/localFileService.js';
import { useEditorStore } from './stores/editorStore.js';

// ── Defaults stored in localStorage ──────────────────────────────────────────
const SIDEBAR_DEFAULT = 240;
const AIPANEL_DEFAULT = 380;
const TERMINAL_DEFAULT = 220;

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}
function readLS(key, fallback) {
  try {
    const v = Number(localStorage.getItem(key));
    return isNaN(v) ? fallback : v;
  } catch {
    return fallback;
  }
}

// ── Resize handle ─────────────────────────────────────────────────────────────
function ResizeHandle({ direction = 'horizontal', onResize, className }) {
  const isH = direction === 'horizontal';
  const handleRef = useRef(null);

  const onMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      document.body.classList.add(isH ? 'resizing-h' : 'resizing-v');
      const startPos = isH ? e.clientX : e.clientY;

      const move = (mv) => {
        const delta = (isH ? mv.clientX : mv.clientY) - startPos;
        onResize(delta, isH ? mv.clientX : mv.clientY);
      };
      const up = () => {
        document.body.classList.remove('resizing-h', 'resizing-v');
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    },
    [isH, onResize]
  );

  return (
    <div
      ref={handleRef}
      onMouseDown={onMouseDown}
      style={{
        flexShrink: 0,
        width: isH ? 'var(--resize-handle-w)' : '100%',
        height: isH ? '100%' : 'var(--resize-handle-w)',
        cursor: isH ? 'col-resize' : 'row-resize',
        background: 'var(--resize-handle-color)',
        transition: 'background 0.2s',
        zIndex: 10,
        position: 'relative',
      }}
      className="resize-handle"
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--resize-handle-hover)';
        if (isH) e.currentTarget.style.boxShadow = '0 0 8px var(--accent-glow)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--resize-handle-color)';
        if (isH) e.currentTarget.style.boxShadow = 'none';
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: isH ? 0 : -3,
          left: isH ? -3 : 0,
          right: isH ? -3 : 0,
          bottom: isH ? 0 : -3,
          cursor: isH ? 'col-resize' : 'row-resize',
          zIndex: 11,
        }}
      />
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App({ recoveredFromIDB = false, tabRole = 'unknown' }) {
  // Panel sizes (persisted to localStorage)
  const [sidebarW, setSidebarW] = useState(() => {
    const stored = readLS('sidebar-w', SIDEBAR_DEFAULT);
    return stored < 160 ? SIDEBAR_DEFAULT : stored; // Fix: prevent near-zero stored values
  });
  const [aiPanelW, setAiPanelW] = useState(() => {
    const stored = readLS('aipanel-w', AIPANEL_DEFAULT);
    return stored < 200 ? AIPANEL_DEFAULT : stored;
  });
  const [terminalH, setTerminalH] = useState(TERMINAL_DEFAULT);
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Resize origins
  const sidebarStartW = useRef(sidebarW);
  const aiPanelStartW = useRef(aiPanelW);
  const termStartH = useRef(terminalH);

  // StatusBar state
  const [cursorPos, setCursorPos] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // QuickOpen overlay
  const [quickOpen, setQuickOpen] = useState(false);

  // Full-app drag-over
  const [fullDragOver, setFullDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  // ── Resize handlers ─────────────────────────────────────────────────────────
  const onSidebarResize = useCallback((delta, absX) => {
    const newW = clamp(
      sidebarStartW.current + delta,
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-min-w')) ||
        160,
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sidebar-max-w')) ||
        480
    );
    setSidebarW(newW);
    localStorage.setItem('sidebar-w', newW);
  }, []);

  const onAiPanelResize = useCallback((delta, absX) => {
    const newW = clamp(
      aiPanelStartW.current - delta,
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--aipanel-min-w')) ||
        260,
      parseInt(getComputedStyle(document.documentElement).getPropertyValue('--aipanel-max-w')) ||
        580
    );
    setAiPanelW(newW);
    localStorage.setItem('aipanel-w', newW);
  }, []);

  const onTerminalResize = useCallback((delta, absY) => {
    const newH = clamp(termStartH.current - delta, 80, 500);
    setTerminalH(newH);
  }, []);

  // Save resize start on mousedown by listening to ResizeHandle's mousedown
  const handleSidebarResizeStart = () => {
    sidebarStartW.current = sidebarW;
  };
  const handleAiPanelResizeStart = () => {
    aiPanelStartW.current = aiPanelW;
  };
  const handleTerminalResizeStart = () => {
    termStartH.current = terminalH;
  };

  // ── Keyboard shortcut: Ctrl+P → QuickOpen ──────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setQuickOpen((v) => !v);
      }
      if (e.key === 'Escape') setQuickOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Full-app drag-and-drop ──────────────────────────────────────────────────
  const onAppDragEnter = (e) => {
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounterRef.current++;
    setFullDragOver(true);
  };
  const onAppDragLeave = () => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setFullDragOver(false);
    }
  };
  const onAppDragOver = (e) => e.preventDefault();
  const onAppDrop = async (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setFullDragOver(false);
    try {
      await handleDrop(e);
    } catch (err) {
      if (err?.name !== 'AbortError') console.error('[App] Drop failed:', err);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        background: 'var(--app-bg)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-ui)',
        overflow: 'hidden',
        position: 'relative',
      }}
      onDragEnter={onAppDragEnter}
      onDragLeave={onAppDragLeave}
      onDragOver={onAppDragOver}
      onDrop={onAppDrop}
    >
      {/* ── Full-app drop overlay ──────────────────────────────────────────── */}
      {fullDragOver && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 2000,
            background: 'rgba(34,211,238,0.06)',
            border: '2px dashed var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(2px)',
            pointerEvents: 'none',
            animation: 'fadeIn 0.15s ease',
          }}
        >
          <div
            style={{
              background: 'var(--panel-bg)',
              border: '1px solid var(--accent)',
              borderRadius: 0,
              padding: '24px 40px',
              color: 'var(--accent)',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              boxShadow: '8px 8px 0px rgba(0,0,0,1)' /* Hard brutalist shadow */,
            }}
          >
            📂 Drop files to open
          </div>
        </div>
      )}

      {/* ── QuickOpen overlay (Ctrl+P) ─────────────────────────────────────── */}
      {quickOpen && <QuickOpen onClose={() => setQuickOpen(false)} />}

      {/* ── Topbar ────────────────────────────────────────────────────────── */}
      <Topbar tabRole={tabRole} recoveredFromIDB={recoveredFromIDB} />

      {/* ── Main 3-column body ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Activity Bar (Far Left) */}
        <div
          style={{
            width: 48,
            minWidth: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: '#0d1117',
            borderRight: '1px solid #131d2e',
            paddingTop: 10,
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <button
            title="Explorer"
            onClick={() => setSidebarOpen((v) => !v)}
            style={{
              background: 'transparent',
              border: 'none',
              color: sidebarOpen ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '12px 0',
              width: '100%',
              display: 'flex',
              justifyContent: 'center',
              position: 'relative',
              transition: 'color 0.2s',
            }}
          >
            {sidebarOpen && (
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: 3,
                  background: 'var(--accent)',
                }}
              />
            )}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
            </svg>
          </button>
        </div>

        {/* Left: File Tree */}
        {sidebarOpen && (
          <div
            style={{
              width: sidebarW,
              minWidth: sidebarW,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              background: 'var(--app-bg)',
            }}
          >
            <FileTree />
          </div>
        )}

        {/* Resize: sidebar ↔ editor */}
        {sidebarOpen && (
          <div onMouseDown={handleSidebarResizeStart}>
            <ResizeHandle direction="horizontal" onResize={onSidebarResize} />
          </div>
        )}

        {/* Center: Editor + Terminal */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <TabBar />

          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <MonacoEditor onCursorPositionChange={setCursorPos} />
          </div>

          {/* Vertical resize handle for terminal */}
          {terminalOpen && (
            <div onMouseDown={handleTerminalResizeStart}>
              <ResizeHandle direction="vertical" onResize={onTerminalResize} />
            </div>
          )}

          {/* Terminal */}
          {terminalOpen && (
            <div
              style={{
                height: terminalH,
                minHeight: terminalH,
                flexShrink: 0,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <Terminal />
            </div>
          )}

          {/* Terminal toggle strip */}
          <div
            style={{
              height: 24,
              display: 'flex',
              alignItems: 'center',
              paddingLeft: 10,
              gap: 8,
              background: 'var(--panel-bg)',
              borderTop: '1px solid var(--panel-border)',
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => setTerminalOpen((v) => !v)}
              style={{
                background: 'none',
                border: '1px solid transparent',
                color: 'var(--text-muted)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                cursor: 'pointer',
                padding: '4px 10px',
                borderRadius: 0,
                textTransform: 'uppercase',
                transition: 'all 0.15s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = 'var(--text-primary)';
                e.currentTarget.style.borderColor = 'var(--panel-border)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'var(--text-muted)';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              {terminalOpen ? '⌄ Terminal' : '⌃ Terminal'}
            </button>
            <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
              Ctrl+P — Quick Open
            </span>
          </div>
        </div>

        {/* Resize: editor ↔ AI panel */}
        <div onMouseDown={handleAiPanelResizeStart}>
          <ResizeHandle direction="horizontal" onResize={onAiPanelResize} />
        </div>

        {/* Right: AI Panel */}
        <div style={{ width: aiPanelW, minWidth: aiPanelW, overflow: 'hidden' }}>
          <AIPanel />
        </div>
      </div>

      {/* ── Status Bar ────────────────────────────────────────────────────── */}
      <StatusBar tabRole={tabRole} isConnected={isConnected} cursorPos={cursorPos} />
    </div>
  );
}
