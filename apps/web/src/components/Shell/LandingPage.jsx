import React from 'react';
import { Shield, Cpu, Terminal as TerminalIcon, Layers, ArrowRight } from 'lucide-react';

const FeatureBlock = ({ icon: Icon, title, description, delayClass }) => (
  <div
    className={`brutal-card reveal-up ${delayClass}`}
    style={{
      padding: '32px',
      background: 'var(--panel-bg)',
      position: 'relative',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        width: '48px',
        height: '48px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid var(--panel-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '24px',
      }}
    >
      <Icon size={24} color="var(--accent)" />
    </div>
    <h3 style={{ fontSize: '1.5rem', marginBottom: '16px', letterSpacing: '-0.02em' }}>{title}</h3>
    <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.6 }}>
      {description}
    </p>
    <div style={{ position: 'absolute', bottom: '-20px', right: '-20px', opacity: 0.03 }}>
      <Icon size={120} />
    </div>
  </div>
);

const StepRow = ({ number, title, detail, delayClass }) => (
  <div
    className={`reveal-up ${delayClass}`}
    style={{
      display: 'grid',
      gridTemplateColumns: '80px 1fr 2fr',
      gap: '32px',
      padding: '32px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      alignItems: 'center',
    }}
  >
    <span style={{ fontSize: '24px', fontWeight: 800, color: 'rgba(255,255,255,0.1)' }}>
      {number}
    </span>
    <h4 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>{title}</h4>
    <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: 0 }}>{detail}</p>
  </div>
);

export default function LandingPage({ navigate }) {
  return (
    <div
      className="landing-container"
      style={{ width: '100%', maxWidth: '1400px', margin: '0 auto', padding: '0 40px' }}
    >
      {/* Hero Section */}
      <section style={{ padding: '120px 0 80px', textAlign: 'center' }}>
        <div className="reveal-up stagger-1">
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 12px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid var(--panel-border)',
              borderRadius: '20px',
              marginBottom: '32px',
            }}
          >
            <Sparkles size={14} color="var(--accent)" />
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Nebula v1.0 is here
            </span>
          </div>
          <h1
            style={{
              fontSize: 'clamp(3.5rem, 10vw, 8rem)',
              lineHeight: 0.8,
              letterSpacing: '-0.06em',
              margin: '0 0 40px',
              fontWeight: 800,
            }}
          >
            CODE AT THE <br />
            <span style={{ color: 'var(--accent)' }}>SPEED OF THOUGHT</span>.
          </h1>
          <p
            style={{
              fontSize: '20px',
              color: 'var(--text-secondary)',
              maxWidth: '650px',
              margin: '0 auto 56px',
              lineHeight: 1.5,
            }}
          >
            Nebula is the next-generation AI IDE built for speed, privacy, and absolute control. An
            intelligent agent pipeline that doesn't just suggest code—it builds products.
          </p>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <button
              className="brutalist-button"
              onClick={() => navigate('/ide')}
              style={{
                padding: '18px 40px',
                fontSize: '15px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              Launch Workspace <ArrowRight size={18} />
            </button>
            <button
              className="brutalist-button secondary"
              onClick={() => navigate('/login')}
              style={{ padding: '18px 40px', fontSize: '15px' }}
            >
              Cloud Sync
            </button>
          </div>
        </div>
      </section>

      {/* Feature Showcase */}
      <section style={{ padding: '100px 0' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: '80px',
          }}
        >
          <div className="reveal-up">
            <span className="site-eyebrow">Capabilities</span>
            <h2 style={{ fontSize: '3.5rem', marginTop: '16px', letterSpacing: '-0.04em' }}>
              Engineered for <br /> Power Users.
            </h2>
          </div>
          <p
            className="reveal-up stagger-1"
            style={{
              maxWidth: '400px',
              color: 'var(--text-muted)',
              fontSize: '16px',
              marginBottom: '10px',
            }}
          >
            We've stripped away the fluff to give you a raw, industrial-grade development
            environment powered by local-first AI.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
            gap: '32px',
          }}
        >
          <FeatureBlock
            icon={Cpu}
            title="Multi-Agent Pipeline"
            description="Parallel agents handle complex refactoring, planning, and verification while you focus on the architecture."
            delayClass="stagger-1"
          />
          <FeatureBlock
            icon={Shield}
            title="Privacy First"
            description="Your code never leaves your machine unless you explicitly allow it. Local models and private context are the default."
            delayClass="stagger-2"
          />
          <FeatureBlock
            icon={TerminalIcon}
            title="Universal Runtime"
            description="A seamless bridge between browser execution and local containers. Build, test, and deploy in one unified flow."
            delayClass="stagger-3"
          />
        </div>
      </section>

      {/* "What it does" Section */}
      <section style={{ padding: '100px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr', gap: '100px' }}>
          <div className="reveal-up">
            <span className="site-eyebrow">The Workflow</span>
            <h2 style={{ fontSize: '3rem', marginTop: '16px', marginBottom: '32px' }}>
              What it does.
            </h2>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: '17px',
                lineHeight: 1.6,
                marginBottom: '40px',
              }}
            >
              Nebula automates the tedious parts of development through a structured, multi-step
              intelligence loop.
            </p>
            <div
              className="brutal-card"
              style={{ padding: '32px', background: 'var(--accent)', color: '#000' }}
            >
              <h4 style={{ margin: '0 0 16px', fontWeight: 800 }}>PRO TIP</h4>
              <p style={{ margin: 0, fontWeight: 500, fontSize: '14px' }}>
                Use <code>Cmd+K</code> to summon the agent anywhere in the codebase for instant
                edits.
              </p>
            </div>
          </div>
          <div>
            <StepRow
              number="01"
              title="Intent Analysis"
              detail="The agent decodes your natural language requests and maps them to concrete file-system operations."
              delayClass="stagger-1"
            />
            <StepRow
              number="02"
              title="Context Assembly"
              detail="Using RAG and semantic search, Nebula finds the exact snippets needed to fulfill your request."
              delayClass="stagger-2"
            />
            <StepRow
              number="03"
              title="Execution & Verification"
              detail="Code is generated and immediately executed in a sandbox to verify correctness before you see it."
              delayClass="stagger-3"
            />
            <StepRow
              number="04"
              title="Self-Healing"
              detail="If tests fail, the agent analyzes the stack trace and loops back to fix the issues automatically."
              delayClass="stagger-4"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '120px 0 60px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '60px' }}>
          <div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}
            >
              <div
                className="brand-mark"
                style={{ width: '32px', height: '32px', fontSize: '16px' }}
              >
                <Layers size={18} strokeWidth={2.5} />
              </div>
              <h3 style={{ fontSize: '20px', fontWeight: 800, margin: 0 }}>NEBULA</h3>
            </div>
            <p
              style={{
                color: 'var(--text-muted)',
                fontSize: '14px',
                maxWidth: '300px',
                lineHeight: 1.6,
              }}
            >
              The industrial-grade AI IDE for the modern developer. Built by Anirban for those who
              demand precision and speed.
            </p>
          </div>
          <div>
            <h4
              style={{
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '24px',
              }}
            >
              Product
            </h4>
            <div
              style={{
                display: 'grid',
                gap: '12px',
                fontSize: '14px',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ cursor: 'pointer' }}>Features</span>
              <span style={{ cursor: 'pointer' }}>Architecture</span>
              <span style={{ cursor: 'pointer' }}>Security</span>
            </div>
          </div>
          <div>
            <h4
              style={{
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '24px',
              }}
            >
              Resources
            </h4>
            <div
              style={{
                display: 'grid',
                gap: '12px',
                fontSize: '14px',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ cursor: 'pointer' }}>Docs</span>
              <span style={{ cursor: 'pointer' }}>API</span>
              <span style={{ cursor: 'pointer' }}>Community</span>
            </div>
          </div>
          <div>
            <h4
              style={{
                fontSize: '12px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                marginBottom: '24px',
              }}
            >
              Social
            </h4>
            <div
              style={{
                display: 'grid',
                gap: '12px',
                fontSize: '14px',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ cursor: 'pointer' }}>Twitter</span>
              <span style={{ cursor: 'pointer' }}>GitHub</span>
              <span style={{ cursor: 'pointer' }}>Discord</span>
            </div>
          </div>
        </div>
        <div
          style={{
            marginTop: '100px',
            paddingTop: '40px',
            borderTop: '1px solid rgba(255,255,255,0.03)',
            textAlign: 'center',
          }}
        >
          <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
            &copy; 2026 Nebula IDE. Created by Anirban. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
