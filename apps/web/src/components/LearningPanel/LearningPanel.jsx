import React, { useState } from 'react';
import { BookOpen, Code, Play, CheckCircle, Lock, Unlock, ArrowRight, X } from 'lucide-react';

const MOCK_ROADMAP = [
  {
    id: 1,
    type: 'READ',
    title: 'What is this topic?',
    status: 'completed',
    content:
      'WebSockets provide a persistent connection between client and server. The client establishes a WebSocket connection through a process known as the WebSocket handshake.',
  },
  {
    id: 2,
    type: 'STUDY',
    title: 'Study existing usage',
    status: 'unlocked',
    file: 'server.js',
    lines: '12-18',
  },
  { id: 3, type: 'GUIDED', title: 'Write your first handler', status: 'locked' },
  { id: 4, type: 'PRACTICE', title: 'Build the feature alone', status: 'locked' },
  { id: 5, type: 'APPLY', title: 'Apply to your project', status: 'locked' },
];

function StepIcon({ type, status }) {
  if (status === 'locked') return <Lock size={16} color="var(--text-muted)" />;
  if (status === 'completed') return <CheckCircle size={16} color="var(--green)" />;

  switch (type) {
    case 'READ':
      return <BookOpen size={16} color="var(--blue)" />;
    case 'STUDY':
      return <Code size={16} color="var(--amber)" />;
    case 'GUIDED':
      return <Play size={16} color="var(--purple)" />;
    default:
      return <Unlock size={16} color="var(--accent)" />;
  }
}

export default function LearningPanel({ onClose }) {
  const [activeStep, setActiveStep] = useState(2);
  const [searchTopic, setSearchTopic] = useState('');

  const currentStepData = MOCK_ROADMAP.find((s) => s.id === activeStep);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--panel-bg)',
        color: 'var(--text-primary)',
        borderLeft: '1px solid var(--panel-border)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <div
        style={{
          padding: '20px',
          borderBottom: '1px solid var(--panel-border)',
          background: 'rgba(14, 18, 24, 0.96)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: 28,
                height: 28,
                background: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '3px 3px 0 #000',
              }}
            >
              <BookOpen size={14} color="#000" strokeWidth={2.5} />
            </div>
            <h2
              style={{
                fontSize: '14px',
                margin: 0,
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Learning Mode
            </h2>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            placeholder="Topic to learn..."
            value={searchTopic}
            onChange={(e) => setSearchTopic(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 12px',
              fontSize: '12px',
            }}
          />
          <button className="brutalist-button tiny">Generate</button>
        </div>
      </div>

      <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
        <h3
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: '16px',
            letterSpacing: '0.12em',
            fontWeight: 700,
          }}
        >
          Your Roadmap
        </h3>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {MOCK_ROADMAP.map((step, idx) => {
            const isActive = step.id === activeStep;

            return (
              <div
                key={step.id}
                onClick={() => step.status !== 'locked' && setActiveStep(step.id)}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '16px',
                  background: isActive ? 'rgba(255, 184, 77, 0.08)' : 'rgba(255,255,255,0.02)',
                  border: isActive ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.06)',
                  cursor: step.status === 'locked' ? 'not-allowed' : 'pointer',
                  opacity: step.status === 'locked' ? 0.5 : 1,
                  transition: 'all 0.2s',
                  boxShadow: isActive ? '4px 4px 0 rgba(0,0,0,0.6)' : 'none',
                }}
              >
                <div style={{ marginTop: '2px' }}>
                  <StepIcon type={step.type} status={isActive ? 'unlocked' : step.status} />
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                      }}
                    >
                      {step.id}. {step.type}
                    </span>
                    {isActive && <ArrowRight size={14} color="var(--accent)" />}
                  </div>
                  <div
                    style={{
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                      marginTop: '6px',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    {step.title}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {currentStepData && (
          <div
            style={{
              marginTop: '32px',
              padding: '20px',
              background: 'rgba(0,0,0,0.4)',
              border: '1px solid var(--panel-border-strong)',
            }}
          >
            <h4
              style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '12px',
                color: 'var(--text-muted)',
              }}
            >
              Current Exercise
            </h4>
            <p
              style={{
                fontSize: '14px',
                color: 'var(--text-primary)',
                lineHeight: '1.6',
                margin: '0 0 20px 0',
              }}
            >
              {currentStepData.content ||
                `We will open ${currentStepData.file || 'a file'} to study how it's done in the codebase.`}
            </p>

            <button className="brutalist-button" style={{ width: '100%' }}>
              {currentStepData.type === 'READ' ? 'Complete Reading' : 'Open Exercise'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
