import React, { useEffect, useState, useRef } from 'react';
import { useAgentStore } from '../../stores/agentStore';

export default function AIPanel() {
  const { connect, disconnect, isConnected, messages, isThinking, thinkingMessage, sendPrompt } =
    useAgentStore();

  const [inputMsg, setInputMsg] = useState('');
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
    if (inputMsg.trim()) {
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
        background: '#0f172a',
        borderLeft: '1px solid #1e293b',
      }}
    >
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <h2 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: '#f8fafc' }}>AI Agent</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isConnected ? '#10b981' : '#ef4444',
            }}
          />
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {isConnected ? 'Connected' : 'Offline'}
          </span>
        </div>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              color: '#64748b',
              textAlign: 'center',
              marginTop: '32px',
              fontSize: '0.875rem',
            }}
          >
            Hello! I'm Anti_GV. Ask me to build something or refactor your code.
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div
              style={{
                background: msg.role === 'user' ? '#3b82f6' : '#1e293b',
                color: msg.type === 'error' ? '#fca5a5' : '#f8fafc',
                padding: '12px 16px',
                borderRadius: '8px',
                maxWidth: '85%',
                wordBreak: 'break-word',
                fontSize: '0.875rem',
                lineHeight: 1.5,
                border: msg.type === 'error' ? '1px solid #7f1d1d' : 'none',
              }}
            >
              {msg.type === 'plan' ? (
                <div>
                  <strong>Proposed Plan:</strong>
                  <p style={{ margin: '8px 0' }}>{msg.data.summary}</p>
                  <ul style={{ paddingLeft: '20px', margin: 0 }}>
                    {msg.data.steps.map((s) => (
                      <li key={s.stepId}>
                        {s.action} {s.filePath}
                      </li>
                    ))}
                  </ul>
                  {/* Future: Add Approve button here */}
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}

        {isThinking && (
          <div
            style={{
              alignSelf: 'flex-start',
              background: 'transparent',
              color: '#cbd5e1',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span className="spinner" style={{ animation: 'spin 1s linear infinite' }}>
              ⟳
            </span>
            {thinkingMessage || 'Thinking...'}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div style={{ padding: '16px', borderTop: '1px solid #1e293b' }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            disabled={isThinking || !isConnected}
            placeholder={isConnected ? 'Describe what you want...' : 'Connecting...'}
            style={{
              flex: 1,
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '10px 14px',
              color: '#f8fafc',
              outline: 'none',
              fontSize: '0.875rem',
            }}
          />
          <button
            type="submit"
            disabled={isThinking || !inputMsg.trim() || !isConnected}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '0 16px',
              fontWeight: 600,
              cursor: isThinking || !inputMsg.trim() || !isConnected ? 'not-allowed' : 'pointer',
              opacity: isThinking || !inputMsg.trim() || !isConnected ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
