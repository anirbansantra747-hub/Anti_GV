import React from 'react';
import AIPanel from './components/AIPanel/AIPanel';
import TabBar from './components/Editor/TabBar';
import EditorPane from './components/Editor/EditorPane';
import FileTree from './components/Explorer/FileTree';
import TerminalPane from './components/Terminal/TerminalPane';

export default function App() {
  return (
    <div
      style={{
        background: '#080c14',
        color: '#e2e8f0',
        height: '100vh',
        display: 'flex',
        fontFamily: 'Outfit, sans-serif',
        overflow: 'hidden',
      }}
    >
      {/* Left Sidebar - File Tree (Module 13 Placeholder) */}
      <div
        style={{
          width: '250px',
          background: '#0f172a',
          borderRight: '1px solid #1e293b',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px',
        }}
      >
        <h2
          style={{
            fontSize: '0.875rem',
            fontWeight: 600,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            marginBottom: '8px',
          }}
        >
          Explorer
        </h2>
        <FileTree />
      </div>

      {/* Middle Area - Editor and Terminal */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          background: '#080c14',
        }}
      >
        {/* Editor (70%) */}
        <div style={{ flex: 0.7, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <TabBar />
          <EditorPane />
        </div>

        {/* Terminal (30%) */}
        <div style={{ flex: 0.3, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <TerminalPane />
        </div>
      </div>

      {/* Right Sidebar - AI Panel */}
      <div
        style={{
          width: '400px',
          minWidth: '300px',
          height: '100vh',
          borderLeft: '1px solid #1e293b',
        }}
      >
        <AIPanel />
      </div>
    </div>
  );
}
