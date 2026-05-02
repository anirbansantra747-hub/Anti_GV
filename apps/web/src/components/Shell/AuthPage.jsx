import React from 'react';

export default function AuthPage({ mode = 'login', onToggleMode, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulate auth
    setTimeout(() => {
      onLogin({ name: email.split('@')[0] || 'User', email, role: 'Senior Developer' });
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(400px, 1fr) 1.5fr',
        minHeight: 'calc(100vh - 160px)',
        background: 'var(--app-bg)',
        border: '1px solid var(--panel-border)',
        boxShadow: 'var(--shadow-hard)',
      }}
    >
      {/* Form Side */}
      <div
        style={{
          padding: '60px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
        }}
      >
        <div className="reveal-up stagger-1">
          <span className="site-eyebrow" style={{ marginBottom: '16px' }}>
            {mode === 'login' ? 'Welcome Back' : 'Create Account'}
          </span>
          <h2 style={{ fontSize: '2.5rem', margin: '0 0 40px' }}>
            {mode === 'login' ? 'Identify Yourself.' : 'Join the Resistance.'}
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '24px' }}>
            <div className="field">
              <span>Email Address</span>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <span>Password</span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              className="brutalist-button"
              style={{ marginTop: '12px', height: '52px' }}
              disabled={isLoading}
            >
              {isLoading ? 'Processing...' : mode === 'login' ? 'Login' : 'Signup'}
            </button>
          </form>

          <div style={{ marginTop: '32px', textAlign: 'center' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}
              <button
                onClick={onToggleMode}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent)',
                  fontWeight: 700,
                  marginLeft: '8px',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontSize: '11px',
                }}
              >
                {mode === 'login' ? 'Create one' : 'Login instead'}
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Visual Side */}
      <div
        style={{
          background: 'linear-gradient(135deg, var(--accent) 0%, oklch(0.4 0.1 55) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.1,
            backgroundImage: 'radial-gradient(#000 1px, transparent 1px)',
            backgroundSize: '20px 20px',
          }}
        />

        <div className="reveal-up stagger-2" style={{ position: 'relative', zIndex: 1 }}>
          <div
            className="brand-mark"
            style={{
              width: '120px',
              height: '120px',
              fontSize: '48px',
              margin: '0 auto 40px',
              background: '#000',
              color: 'var(--accent)',
            }}
          >
            N
          </div>
          <div style={{ color: '#000', textAlign: 'center' }}>
            <h3 style={{ fontSize: '2rem', margin: '0 0 16px', letterSpacing: '-0.02em' }}>
              The Future is Local.
            </h3>
            <p style={{ fontSize: '15px', fontWeight: 500, opacity: 0.8, maxWidth: '300px' }}>
              Your workspace, your data, your AI. No cloud lock-in. No compromises.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
