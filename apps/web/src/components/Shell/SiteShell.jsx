/* eslint-disable no-unused-vars */
import React, { useEffect, useMemo, useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore.js';
import { useSettingsStore } from '../../stores/settingsStore.js';
import { useWorkspaceAccessStore } from '../../stores/workspaceAccessStore.js';
import { useEditorStore } from '../../stores/editorStore.js';

function NavButton({ active, onClick, children }) {
  return (
    <button className={active ? 'site-nav-link is-active' : 'site-nav-link'} onClick={onClick}>
      {children}
    </button>
  );
}

function SectionFrame({ eyebrow, title, detail, children, aside }) {
  return (
    <section className="site-section">
      <div className="site-section-copy">
        <span className="site-eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{detail}</p>
      </div>
      {aside ? <div className="site-section-aside">{aside}</div> : null}
      <div className="site-section-body">{children}</div>
    </section>
  );
}

function LandingPage({ navigate, isAuthenticated }) {
  return (
    <div className="page-stack">
      <SectionFrame
        eyebrow="Brutalist IDE"
        title="Sharp local coding without the usual clutter."
        detail="Anti_GV now carries a restrained brutalist shell: hard edges, deliberate spacing, no decorative noise. The workspace stays central while navigation, auth, settings, and profile all share the same system."
        aside={
          <div className="hero-matrix">
            <div>
              <span>Pages</span>
              <strong>7</strong>
            </div>
            <div>
              <span>Mode</span>
              <strong>Local</strong>
            </div>
            <div>
              <span>Review</span>
              <strong>Explicit</strong>
            </div>
          </div>
        }
      >
        <div className="cta-row">
          <button className="brutalist-button" onClick={() => navigate('/ide')}>
            Open Workspace
          </button>
          <button className="brutalist-button secondary" onClick={() => navigate('/about')}>
            Read About
          </button>
          <button
            className="brutalist-button ghost"
            onClick={() => navigate(isAuthenticated ? '/dashboard' : '/login')}
          >
            {isAuthenticated ? 'Go To Dashboard' : 'Continue Locally'}
          </button>
        </div>
        <div className="feature-grid">
          <article>
            <span>01</span>
            <h3>Minimal, not empty</h3>
            <p>The layout uses tension and contrast instead of glass or gradients.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Main content first</h3>
            <p>The code surface keeps priority while all supporting pages remain coherent.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Local by default</h3>
            <p>Auth screens work without real credentials so local iteration never blocks.</p>
          </article>
        </div>
      </SectionFrame>
    </div>
  );
}

function DashboardPage({ navigate }) {
  const source = useWorkspaceAccessStore((state) => state.source);
  const activeFile = useEditorStore((state) => state.activeFile);
  const openTabs = useEditorStore((state) => state.openTabs);

  return (
    <div className="page-stack">
      <SectionFrame
        eyebrow="Dashboard"
        title="Everything important stays one click away."
        detail="This is a local launch surface for the workspace, profile, settings, and saved context."
        aside={
          <div className="dashboard-summary">
            <div>
              <span>Active file</span>
              <strong>{activeFile || 'None selected'}</strong>
            </div>
            <div>
              <span>Open tabs</span>
              <strong>{openTabs.length}</strong>
            </div>
            <div>
              <span>Save target</span>
              <strong>{source.label}</strong>
            </div>
          </div>
        }
      >
        <div className="action-grid">
          <button className="action-tile" onClick={() => navigate('/ide')}>
            <strong>Workspace</strong>
            <span>Jump straight into the editor, terminal, AI review, and file tree.</span>
          </button>
          <button className="action-tile" onClick={() => navigate('/profile')}>
            <strong>Profile</strong>
            <span>Update the local operator identity used across the shell.</span>
          </button>
          <button className="action-tile" onClick={() => navigate('/settings')}>
            <strong>Settings</strong>
            <span>Adjust editor sizing, line wrapping, density, and motion.</span>
          </button>
          <button className="action-tile" onClick={() => navigate('/about')}>
            <strong>About</strong>
            <span>Read the positioning, model, and design intent behind the app.</span>
          </button>
        </div>
      </SectionFrame>
    </div>
  );
}

function AuthPage({ mode, navigate }) {
  const signIn = useSessionStore((state) => state.signIn);
  const register = useSessionStore((state) => state.register);
  const [form, setForm] = useState({ name: '', email: '', role: '' });

  const isRegister = mode === 'register';
  const submit = () => {
    if (isRegister) {
      register(form);
    } else {
      signIn(form);
    }
    navigate('/dashboard');
  };

  return (
    <div className="page-stack auth-layout">
      <SectionFrame
        eyebrow={isRegister ? 'Register' : 'Login'}
        title={
          isRegister ? 'Create a local workspace profile.' : 'Enter without credential friction.'
        }
        detail="These forms are intentionally non-blocking in local development. Leave fields blank if you want and continue."
      >
        <div className="form-shell">
          <label className="field">
            <span>Name</span>
            <input
              value={form.name}
              onChange={(e) => setForm((state) => ({ ...state, name: e.target.value }))}
              placeholder={isRegister ? 'Workspace owner' : 'Local Operator'}
            />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              value={form.email}
              onChange={(e) => setForm((state) => ({ ...state, email: e.target.value }))}
              placeholder="local@anti-gv.dev"
            />
          </label>
          {isRegister ? (
            <label className="field">
              <span>Role</span>
              <input
                value={form.role}
                onChange={(e) => setForm((state) => ({ ...state, role: e.target.value }))}
                placeholder="Builder"
              />
            </label>
          ) : null}
          <div className="cta-row">
            <button className="brutalist-button" onClick={submit}>
              {isRegister ? 'Create Profile' : 'Enter Local Mode'}
            </button>
            <button className="brutalist-button ghost" onClick={() => navigate('/ide')}>
              Skip To IDE
            </button>
          </div>
        </div>
      </SectionFrame>
    </div>
  );
}

function AboutPage() {
  return (
    <div className="page-stack">
      <SectionFrame
        eyebrow="About"
        title="A browser IDE designed to feel deliberate."
        detail="The new system leans on a low-noise brutalist language: strong frames, editorial spacing, sharp surfaces, and visible state. The main coding space stays familiar while the surrounding product now feels finished."
      >
        <div className="feature-grid">
          <article>
            <span>A</span>
            <h3>Workspace first</h3>
            <p>Open, edit, review AI patches, and save back to the active file or folder target.</p>
          </article>
          <article>
            <span>B</span>
            <h3>Local auth story</h3>
            <p>
              Login and registration exist as part of the product shell but stay credential-free in
              local runs.
            </p>
          </article>
          <article>
            <span>C</span>
            <h3>Unified language</h3>
            <p>Landing, settings, profile, toasts, and the IDE all share one visual grammar.</p>
          </article>
        </div>
      </SectionFrame>
    </div>
  );
}

function SettingsPage() {
  const settings = useSettingsStore();
  const [draft, setDraft] = useState({
    editorFontSize: settings.editorFontSize,
    wordWrap: settings.wordWrap,
    reducedMotion: settings.reducedMotion,
    compactDensity: settings.compactDensity,
    showTerminalByDefault: settings.showTerminalByDefault,
    showLineNumbers: settings.showLineNumbers,
  });

  return (
    <div className="page-stack">
      <SectionFrame
        eyebrow="Settings"
        title="Tune the shell without changing the workflow."
        detail="These settings are local and immediate. They are meant to adjust readability and surface density, not rebrand the product every time."
      >
        <div className="settings-grid">
          <label className="field">
            <span>Editor font size</span>
            <input
              type="range"
              min="12"
              max="18"
              value={draft.editorFontSize}
              onChange={(e) =>
                setDraft((state) => ({ ...state, editorFontSize: Number(e.target.value) }))
              }
            />
            <small>{draft.editorFontSize}px</small>
          </label>

          <label className="field">
            <span>Word wrap</span>
            <select
              value={draft.wordWrap}
              onChange={(e) => setDraft((state) => ({ ...state, wordWrap: e.target.value }))}
            >
              <option value="on">On</option>
              <option value="off">Off</option>
              <option value="bounded">Bounded</option>
            </select>
          </label>

          {[
            ['Reduced motion', 'reducedMotion'],
            ['Compact density', 'compactDensity'],
            ['Open terminal by default', 'showTerminalByDefault'],
            ['Show line numbers', 'showLineNumbers'],
          ].map(([label, key]) => (
            <label key={key} className="toggle-row">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) => setDraft((state) => ({ ...state, [key]: e.target.checked }))}
              />
            </label>
          ))}
        </div>
        <div className="cta-row">
          <button className="brutalist-button" onClick={() => settings.updateSettings(draft)}>
            Apply Settings
          </button>
        </div>
      </SectionFrame>
    </div>
  );
}

function ProfilePage() {
  const profile = useSessionStore((state) => state.profile);
  const updateProfile = useSessionStore((state) => state.updateProfile);
  const [draft, setDraft] = useState(profile);

  useEffect(() => {
    setDraft(profile);
  }, [profile]);

  return (
    <div className="page-stack">
      <SectionFrame
        eyebrow="Profile"
        title="Local identity, visible across the shell."
        detail="This profile is used for the dashboard, shell header, and future collaboration surfaces. It is local-first and intentionally lightweight."
      >
        <div className="form-shell">
          {[
            ['Name', 'name'],
            ['Email', 'email'],
            ['Role', 'role'],
          ].map(([label, key]) => (
            <label key={key} className="field">
              <span>{label}</span>
              <input
                value={draft[key] || ''}
                onChange={(e) => setDraft((state) => ({ ...state, [key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="field">
            <span>Bio</span>
            <textarea
              value={draft.bio || ''}
              onChange={(e) => setDraft((state) => ({ ...state, bio: e.target.value }))}
              rows={4}
            />
          </label>
          <div className="cta-row">
            <button className="brutalist-button" onClick={() => updateProfile(draft)}>
              Save Profile
            </button>
          </div>
        </div>
      </SectionFrame>
    </div>
  );
}

function LogoutPage({ navigate }) {
  const signOut = useSessionStore((state) => state.signOut);

  useEffect(() => {
    signOut();
  }, [signOut]);

  return (
    <div className="page-stack">
      <SectionFrame
        eyebrow="Logout"
        title="The remote session is gone. Local mode remains."
        detail="You can return to the landing page, sign back in with a local profile, or go straight into the IDE as a guest."
      >
        <div className="cta-row">
          <button className="brutalist-button" onClick={() => navigate('/')}>
            Back To Landing
          </button>
          <button className="brutalist-button secondary" onClick={() => navigate('/login')}>
            Login Again
          </button>
          <button className="brutalist-button ghost" onClick={() => navigate('/ide')}>
            Open IDE As Guest
          </button>
        </div>
      </SectionFrame>
    </div>
  );
}

export default function SiteShell({ route, navigate }) {
  const { isAuthenticated, profile, localMode } = useSessionStore();
  const page = useMemo(() => {
    switch (route) {
      case '/dashboard':
        return <DashboardPage navigate={navigate} />;
      case '/about':
        return <AboutPage />;
      case '/login':
        return <AuthPage mode="login" navigate={navigate} />;
      case '/register':
        return <AuthPage mode="register" navigate={navigate} />;
      case '/settings':
        return <SettingsPage />;
      case '/profile':
        return <ProfilePage />;
      case '/logout':
        return <LogoutPage navigate={navigate} />;
      default:
        return <LandingPage navigate={navigate} isAuthenticated={isAuthenticated} />;
    }
  }, [isAuthenticated, navigate, route]);

  return (
    <div className="site-shell">
      <header className="site-header">
        <div className="brand-lockup">
          <span className="brand-mark">AG</span>
          <div>
            <strong>Anti_GV</strong>
            <span>{localMode ? 'Local Mode Enabled' : 'Remote Mode'}</span>
          </div>
        </div>

        <nav className="site-nav">
          {[
            ['/', 'Landing'],
            ['/dashboard', 'Dashboard'],
            ['/about', 'About'],
            ['/settings', 'Settings'],
            ['/profile', 'Profile'],
          ].map(([target, label]) => (
            <NavButton key={target} active={route === target} onClick={() => navigate(target)}>
              {label}
            </NavButton>
          ))}
          <NavButton active={route === '/login'} onClick={() => navigate('/login')}>
            Login
          </NavButton>
          <NavButton active={route === '/register'} onClick={() => navigate('/register')}>
            Register
          </NavButton>
          <NavButton active={route === '/logout'} onClick={() => navigate('/logout')}>
            Logout
          </NavButton>
          <button className="brutalist-button tiny" onClick={() => navigate('/ide')}>
            IDE
          </button>
        </nav>

        <div className="profile-chip">
          <strong>{profile.name}</strong>
          <span>{isAuthenticated ? profile.role : 'Guest mode'}</span>
        </div>
      </header>

      <main className="site-main">{page}</main>
    </div>
  );
}
