/* eslint-disable no-unused-vars */
/**
 * @file AIPanel.jsx
 * @description Sleek, modern AI chat interface with glassmorphism chat bubbles.
 */

import React, { useEffect, useState, useRef } from 'react';
import { Send, Cpu, Check, X, Orbit, Eye } from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';
import { DiffViewer } from '../Editor/DiffViewer';
import { diffService } from '../../services/diffService.js';

export default function AIPanel() {
  const {
    connect,
    disconnect,
    isConnected,
    messages,
    isThinking,
    thinkingMessage,
    sendPrompt,
    activeTransactionId,
    approveTransaction,
    rejectTransaction,
    currentPlan,
    approvePlan,
    rejectPlan,
  } = useAgentStore();

  const [inputMsg, setInputMsg] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputMsg.trim() && !isThinking) {
      sendPrompt(inputMsg);
      setInputMsg('');
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'transparent',
      }}
    >
      {/* Header */}
      <div
        className="glass-header"
        style={{
          padding: '14px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--panel-bg)',
          borderBottom: '1px solid var(--panel-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Cpu size={18} color="var(--accent)" strokeWidth={2} />
          <h2
            style={{
              fontSize: 14,
              fontWeight: 700,
              margin: 0,
              color: 'var(--text-primary)',
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
            }}
          >
            AI Agent
          </h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: isConnected ? '#10b981' : '#ef4444',
              boxShadow: `0 0 8px ${isConnected ? '#10b981' : '#ef4444'}`,
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Messages Area */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {messages.length === 0 && (
          <div
            className="animate-in"
            style={{
              margin: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 12,
              opacity: 0.6,
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 16,
                background: 'var(--panel-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Orbit size={24} color="var(--accent)" />
            </div>
            <p
              style={{
                color: 'var(--text-secondary)',
                fontSize: 13,
                margin: 0,
                textAlign: 'center',
                maxWidth: 220,
                lineHeight: 1.5,
              }}
            >
              Hello! I'm Anti_GV. Ask me to build something or refactor your code.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className="animate-in"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--app-bg)',
                color: msg.role === 'user' ? '#000000' : 'var(--text-primary)',
                padding: '12px 16px',
                borderRadius: 0,
                maxWidth: '90%',
                wordBreak: 'break-word',
                fontSize: 13.5,
                lineHeight: 1.6,
                border:
                  msg.role === 'user'
                    ? '1px solid var(--accent-dim)'
                    : '1px solid var(--panel-border)',
                borderLeft:
                  msg.role === 'user' ? '1px solid var(--accent-dim)' : '4px solid var(--accent)',
                boxShadow: msg.role === 'user' ? '4px 4px 0px rgba(0,0,0,1)' : 'none',
                ...(msg.type === 'error' && {
                  color: 'var(--red)',
                  border: '1px solid var(--red)',
                  borderLeft: '4px solid var(--red)',
                  background: 'var(--app-bg)',
                }),
              }}
            >
              {msg.type === 'plan' ? (
                <div>
                  <strong
                    style={{
                      opacity: 0.8,
                      fontSize: 12,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    Proposed Plan
                  </strong>
                  <p style={{ margin: '8px 0' }}>{msg.data.summary}</p>
                  <ul style={{ paddingLeft: 20, margin: 0, color: 'var(--text-secondary)' }}>
                    {msg.data.steps.map((s) => (
                      <li key={s.stepId} style={{ marginBottom: 4 }}>
                        <span style={{ color: 'var(--accent)' }}>{s.action}</span>{' '}
                        <code
                          style={{ background: '#00000044', padding: '2px 4px', borderRadius: 4 }}
                        >
                          {s.filePath}
                        </code>
                      </li>
                    ))}
                  </ul>

                  {/* If this is the active pending plan, show approval buttons */}
                  {currentPlan && currentPlan.summary === msg.data.summary && (
                    <div
                      style={{
                        marginTop: 16,
                        display: 'flex',
                        gap: 8,
                        background: 'rgba(0,0,0,0.1)',
                        padding: 10,
                        borderRadius: 8,
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <button
                        onClick={approvePlan}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          background: '#10b981',
                          color: '#fff',
                          border: 'none',
                          padding: '8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 600,
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#059669')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
                      >
                        <Check size={14} strokeWidth={3} /> Approve Plan
                      </button>
                      <button
                        onClick={rejectPlan}
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          background: 'rgba(255,255,255,0.05)',
                          color: '#cbd5e1',
                          border: '1px solid var(--panel-border)',
                          padding: '8px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: 12,
                          fontWeight: 500,
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = '#ef444455')}
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')
                        }
                      >
                        <X size={14} strokeWidth={2} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              ) : msg.type === 'code' ? (
                <div>
                  <div
                    style={{
                      fontFamily: '"JetBrains Mono", monospace',
                      fontSize: 12.5,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {msg.content}
                  </div>
                  {msg.criticFeedback && (
                    <div
                      style={{
                        marginTop: 12,
                        paddingTop: 12,
                        borderTop: '1px dashed var(--panel-border)',
                        fontSize: 11,
                        color: msg.criticFeedback.includes('Approved') ? '#4ade80' : '#fbbf24',
                      }}
                    >
                      <strong style={{ opacity: 0.7 }}>Semantic Verifier:</strong>
                      <br />
                      {msg.criticFeedback}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ position: 'relative' }}>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  {msg.isStreaming && (
                    <span
                      style={{
                        display: 'inline-block',
                        width: '8px',
                        height: '14px',
                        background: '#cbd5e1',
                        marginLeft: '4px',
                        verticalAlign: 'middle',
                        animation: 'blink 1s step-end infinite',
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div
            className="animate-in"
            style={{
              alignSelf: 'flex-start',
              color: 'var(--text-secondary)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.02)',
              padding: '8px 14px',
              borderRadius: 20,
              border: '1px solid var(--panel-border)',
            }}
          >
            <Orbit
              size={14}
              color="var(--accent)"
              style={{ animation: 'spin 2s linear infinite' }}
            />
            {thinkingMessage || 'Thinking...'}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Transaction Approval Banner */}
      {activeTransactionId && (
        <div
          className="animate-in"
          style={{
            margin: '0 20px',
            padding: '12px 14px',
            background: 'rgba(59,130,246,0.1)',
            border: '1px solid rgba(59,130,246,0.3)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <span style={{ fontSize: 12, color: '#93c5fd' }}>
            <strong style={{ color: '#bfdbfe' }}>Pending Edits</strong> (Ref:{' '}
            {activeTransactionId.substring(0, 6)})
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setShowDiff(true)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                padding: '8px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                boxShadow: '0 4px 12px rgba(59,130,246,0.3)',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#2563eb')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#3b82f6')}
            >
              <Eye size={14} strokeWidth={3} /> Review Code
            </button>
            <button
              onClick={approveTransaction}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: '#10b981',
                color: '#fff',
                border: 'none',
                padding: '8px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#059669')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
            >
              <Check size={14} strokeWidth={3} /> Quick Accept
            </button>
            <button
              onClick={rejectTransaction}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: 'rgba(255,255,255,0.05)',
                color: '#cbd5e1',
                border: '1px solid var(--panel-border)',
                padding: '8px',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 500,
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.1)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
            >
              <X size={14} strokeWidth={2} /> Discard
            </button>
          </div>
        </div>
      )}

      {/* Input Area */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid var(--panel-border)',
          borderBottom: 'none',
          background: 'var(--panel-bg)',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            gap: 10,
            background: 'var(--app-bg)',
            border: '1px solid var(--panel-border)',
            borderRadius: 0,
            padding: '8px 8px 8px 16px',
            transition: 'border-color 0s, box-shadow 0s',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--panel-border)';
          }}
        >
          <input
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            disabled={isThinking || !isConnected}
            placeholder={isConnected ? 'Message Anti_GV...' : 'Connecting...'}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
              padding: '0 8px',
              outline: 'none',
              fontSize: 14,
            }}
          />
          <button
            type="submit"
            disabled={isThinking || !inputMsg.trim() || !isConnected}
            style={{
              background:
                isThinking || !inputMsg.trim() || !isConnected
                  ? 'var(--panel-border)'
                  : 'var(--accent)',
              color:
                isThinking || !inputMsg.trim() || !isConnected ? 'var(--text-muted)' : '#000000',
              border: 'none',
              borderRadius: 0,
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isThinking || !inputMsg.trim() || !isConnected ? 'not-allowed' : 'pointer',
              transition: 'background 0.1s',
            }}
          >
            <Send size={16} strokeWidth={3} style={{ transform: 'translateX(1px)' }} />
          </button>
        </form>
      </div>

      {/* Diff Viewer portal */}
      {showDiff && activeTransactionId && (
        <DiffViewer
          txId={activeTransactionId}
          patchedPaths={diffService.getTransaction(activeTransactionId)?.patchedPaths || []}
          onClose={() => {
            setShowDiff(false);
            useAgentStore.setState({ activeTransactionId: null });
          }}
        />
      )}
    </div>
  );
}
