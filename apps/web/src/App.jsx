import React from 'react';
import AIPanel from './components/AIPanel/AIPanel';

export default function App() {
  return (
    <div
      style={{
        background: '#080c14',
        color: '#e2e8f0',
        minHeight: '100vh',
        display: 'flex',
        fontFamily: 'Outfit, sans-serif',
      }}
    >
      {/* Main IDE area overlay */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h1
            style={{
              fontSize: '2.5rem',
              fontWeight: 800,
              background: 'linear-gradient(120deg, #fff 30%, #22d3ee 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              margin: 0,
            }}
          >
            Anti_GV
          </h1>
          <p style={{ color: '#94a3b8', marginTop: '0.5rem' }}>AI IDE — Ready to build</p>
        </div>
      </div>

      {/* Right Sidebar - AI Panel */}
      <div style={{ width: '400px', minWidth: '300px', height: '100vh' }}>
        <AIPanel />
      </div>
    </div>
  );
}
