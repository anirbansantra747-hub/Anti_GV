import React, { useMemo } from 'react';
import { useSessionStore } from '../../stores/sessionStore.js';
import { Layers } from 'lucide-react';
import LandingPage from './LandingPage.jsx';
import AuthPage from './AuthPage.jsx';
import SettingsPage from './SettingsPage.jsx';

function NavButton({ active, onClick, children }) {
  return (
    <button className={active ? 'site-nav-link is-active' : 'site-nav-link'} onClick={onClick}>
      {children}
    </button>
  );
}

// LandingPage component moved to separate file
// Dashboard, Auth, Settings, Profile removed for better focus

export default function SiteShell({ route, navigate }) {
  const { isAuthenticated, profile, localMode, signIn } = useSessionStore();
  const page = useMemo(() => {
    switch (route) {
      case '/login':
        return (
          <AuthPage
            mode="login"
            onToggleMode={() => navigate('/signup')}
            onLogin={(profile) => {
              signIn(profile);
              navigate('/ide');
            }}
          />
        );
      case '/signup':
        return (
          <AuthPage
            mode="signup"
            onToggleMode={() => navigate('/login')}
            onLogin={(profile) => {
              useSessionStore.getState().signIn(profile);
              navigate('/ide');
            }}
          />
        );
      case '/settings':
        return <SettingsPage />;
      case '/':
      default:
        return <LandingPage navigate={navigate} isAuthenticated={isAuthenticated} />;
    }
  }, [isAuthenticated, navigate, route, signIn]);

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="brand-lockup" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <div className="brand-mark">
            <Layers size={22} strokeWidth={2.5} />
          </div>
          <div style={{ marginLeft: '4px' }}>
            <strong style={{ fontSize: '16px', letterSpacing: '-0.02em', fontWeight: 800 }}>
              NEBULA
            </strong>
            <span style={{ fontSize: '10px', opacity: 0.6 }}>
              {localMode ? 'Local Engine' : 'Cloud Sync'}
            </span>
          </div>
        </div>

        <nav className="site-nav">
          {[
            ['/', 'Home'],
            ['/login', 'Login'],
            ['/signup', 'Signup'],
          ].map(([target, label]) => (
            <NavButton key={target} active={route === target} onClick={() => navigate(target)}>
              {label}
            </NavButton>
          ))}
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <div className="profile-chip">
            <strong style={{ fontSize: '12px', fontWeight: 700 }}>{profile.name}</strong>
            <span style={{ fontSize: '10px', opacity: 0.6 }}>
              {isAuthenticated ? profile.role : 'Guest'}
            </span>
          </div>
          <button
            className="brutalist-button"
            onClick={() => navigate('/ide')}
            style={{
              padding: '10px 20px',
              fontSize: '12px',
              borderRadius: '6px',
              boxShadow: 'none',
              background: 'var(--accent)',
              color: '#000',
              border: 'none',
            }}
          >
            Launch IDE
          </button>
        </div>
      </header>

      <main className="site-main">{page}</main>
    </div>
  );
}
