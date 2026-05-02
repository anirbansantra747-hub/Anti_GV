import React from 'react';
import { useSettingsStore } from '../../stores/settingsStore.js';

export default function SettingsPage() {
  const {
    showTerminalByDefault,
    setShowTerminalByDefault,
    reducedMotion,
    setReducedMotion,
    compactDensity,
    setCompactDensity,
  } = useSettingsStore();

  return (
    <div style={{ padding: '60px 20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '40px' }}>Settings</h1>

      <div style={{ display: 'grid', gap: '32px' }}>
        <div className="brutal-card" style={{ padding: '24px' }}>
          <h3>Interface</h3>
          <div style={{ display: 'grid', gap: '16px', marginTop: '20px' }}>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={showTerminalByDefault}
                onChange={(e) => setShowTerminalByDefault(e.target.checked)}
              />
              Show Terminal by default
            </label>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={reducedMotion}
                onChange={(e) => setReducedMotion(e.target.checked)}
              />
              Reduced Motion
            </label>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={compactDensity}
                onChange={(e) => setCompactDensity(e.target.checked)}
              />
              Compact Density
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
