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
import SiteShell from './components/Shell/SiteShell.jsx';
import ToastViewport from './components/Toast/ToastViewport.jsx';
import { handleDrop } from './services/localFileService.js';
import { useSettingsStore } from './stores/settingsStore.js';

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

function getRouteFromHash() {
  if (typeof window === 'undefined') return '/';
  const raw = window.location.hash.replace(/^#/, '') || '/';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

function ResizeHandle({ direction = 'horizontal', onResize }) {
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
      className="resize-handle"
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
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--resize-handle-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'var(--resize-handle-color)';
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

export default function App({ recoveredFromIDB = false, tabRole = 'unknown' }) {
  const [route, setRoute] = useState(getRouteFromHash);
  const [sidebarW, setSidebarW] = useState(() => {
    const stored = readLS('sidebar-w', SIDEBAR_DEFAULT);
    return stored < 160 ? SIDEBAR_DEFAULT : stored;
  });
  const [aiPanelW, setAiPanelW] = useState(() => {
    const stored = readLS('aipanel-w', AIPANEL_DEFAULT);
    return stored < 200 ? AIPANEL_DEFAULT : stored;
  });
  const [terminalH, setTerminalH] = useState(TERMINAL_DEFAULT);
  const showTerminalByDefault = useSettingsStore((s) => s.showTerminalByDefault);
  const reducedMotion = useSettingsStore((s) => s.reducedMotion);
  const compactDensity = useSettingsStore((s) => s.compactDensity);
  const [terminalOpen, setTerminalOpen] = useState(showTerminalByDefault);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cursorPos, setCursorPos] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [fullDragOver, setFullDragOver] = useState(false);

  const sidebarStartW = useRef(sidebarW);
  const aiPanelStartW = useRef(aiPanelW);
  const termStartH = useRef(terminalH);
  const dragCounterRef = useRef(0);

  const navigate = useCallback((nextRoute) => {
    const normalized = nextRoute.startsWith('/') ? nextRoute : `/${nextRoute}`;
    window.location.hash = normalized;
  }, []);

  const onSidebarResize = useCallback((delta) => {
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

  const onAiPanelResize = useCallback((delta) => {
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

  const onTerminalResize = useCallback((delta) => {
    const newH = clamp(termStartH.current - delta, 80, 500);
    setTerminalH(newH);
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p' && route === '/ide') {
        e.preventDefault();
        setQuickOpen((v) => !v);
      }
      if (e.key === 'Escape') setQuickOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [route]);

  useEffect(() => {
    const handleHashChange = () => setRoute(getRouteFromHash());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    setTerminalOpen(showTerminalByDefault);
  }, [showTerminalByDefault]);

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full';
    document.documentElement.dataset.density = compactDensity ? 'compact' : 'default';
  }, [compactDensity, reducedMotion]);

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

  if (route !== '/ide') {
    return (
      <div style={{ height: '100vh', width: '100vw', overflow: 'hidden' }}>
        <SiteShell route={route} navigate={navigate} />
        <ToastViewport />
      </div>
    );
  }

  return (
    <div
      className="ide-shell"
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
      {fullDragOver && (
        <div className="ide-drop-overlay">
          <div className="ide-drop-box">Drop files to open</div>
        </div>
      )}

      {quickOpen && <QuickOpen onClose={() => setQuickOpen(false)} />}

      <Topbar tabRole={tabRole} recoveredFromIDB={recoveredFromIDB} onNavigate={navigate} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <div
          style={{
            width: 48,
            minWidth: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: 'var(--rail-bg)',
            borderRight: '1px solid var(--panel-border)',
            paddingTop: 10,
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <button
            title="Explorer"
            onClick={() => setSidebarOpen((v) => !v)}
            className="activity-button"
            style={{ color: sidebarOpen ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {sidebarOpen ? <div className="activity-indicator" /> : null}
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
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </button>
        </div>

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

        {sidebarOpen && (
          <div onMouseDown={() => (sidebarStartW.current = sidebarW)}>
            <ResizeHandle direction="horizontal" onResize={onSidebarResize} />
          </div>
        )}

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
              background: 'rgba(10, 14, 18, 0.86)',
            }}
          >
            <MonacoEditor onCursorPositionChange={setCursorPos} />
          </div>

          {terminalOpen && (
            <div onMouseDown={() => (termStartH.current = terminalH)}>
              <ResizeHandle direction="vertical" onResize={onTerminalResize} />
            </div>
          )}

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

          <div className="terminal-strip">
            <button onClick={() => setTerminalOpen((v) => !v)} className="terminal-toggle">
              {terminalOpen ? 'Hide Terminal' : 'Show Terminal'}
            </button>
            <span>Ctrl+P for Quick Open</span>
          </div>
        </div>

        <div onMouseDown={() => (aiPanelStartW.current = aiPanelW)}>
          <ResizeHandle direction="horizontal" onResize={onAiPanelResize} />
        </div>

        <div style={{ width: aiPanelW, minWidth: aiPanelW, overflow: 'hidden' }}>
          <AIPanel />
        </div>
      </div>

      <StatusBar tabRole={tabRole} isConnected={isConnected} cursorPos={cursorPos} />
      <ToastViewport />
    </div>
  );
}
