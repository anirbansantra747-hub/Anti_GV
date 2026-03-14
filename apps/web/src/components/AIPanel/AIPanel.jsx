/* eslint-disable no-unused-vars */
/**
 * @file AIPanel.jsx
 * @description AI panel with clearer review state and save-target context.
 */

import React, { useEffect, useState, useRef } from 'react';
import { Send, Cpu, Check, X, Orbit, Eye } from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';
import { useEditorStore } from '../../stores/editorStore.js';
import { useWorkspaceAccessStore } from '../../stores/workspaceAccessStore.js';
import { DiffViewer } from '../Editor/DiffViewer';
import { diffService } from '../../services/diffService.js';

function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  const isError = msg.type === 'error';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          background: isUser ? 'var(--accent)' : 'color-mix(in srgb, var(--panel-bg) 72%, black)',
          color: isUser ? '#041014' : isError ? '#fecaca' : 'var(--text-primary)',
          padding: '12px 14px',
          maxWidth: '92%',
          wordBreak: 'break-word',
          fontSize: 13,
          lineHeight: 1.6,
          border: isError
            ? '1px solid rgba(248,113,113,0.35)'
            : isUser
              ? '1px solid var(--accent-dim)'
              : '1px solid var(--panel-border)',
          boxShadow: isUser ? '4px 4px 0px rgba(0,0,0,0.9)' : 'none',
        }}
      >
        {msg.type === 'plan' ? (
          <div>
            <strong style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Plan
            </strong>
            <p style={{ margin: '8px 0' }}>{msg.data.summary}</p>
            <ul style={{ paddingLeft: 18, margin: 0, color: 'var(--text-secondary)' }}>
              {msg.data.steps.map((step) => (
                <li key={step.stepId}>{step.action}</li>
              ))}
            </ul>
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
                  marginTop: 10,
                  paddingTop: 10,
                  borderTop: '1px dashed var(--panel-border)',
                  fontSize: 11,
                  color: msg.criticFeedback.includes('Approved') ? '#86efac' : '#fcd34d',
                }}
              >
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
                  width: 8,
                  height: 14,
                  background: '#cbd5e1',
                  marginLeft: 4,
                  verticalAlign: 'middle',
                  animation: 'blink 1s step-end infinite',
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
    activeTransactionFiles,
    approveTransaction,
    rejectTransaction,
  } = useAgentStore();
  const activeFile = useEditorStore((s) => s.activeFile);
  const source = useWorkspaceAccessStore((s) => s.source);

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
    if (!inputMsg.trim() || isThinking) return;
    sendPrompt(inputMsg);
    setInputMsg('');
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background:
          'linear-gradient(180deg, color-mix(in srgb, var(--panel-bg) 90%, #0b1220) 0%, #090d14 100%)',
      }}
    >
      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes panelSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div
        style={{
          padding: '14px 18px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          borderBottom: '1px solid var(--panel-border)',
          background: 'rgba(8,12,18,0.9)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cpu size={18} color="var(--accent)" strokeWidth={2} />
            <h2
              style={{
                fontSize: 14,
                fontWeight: 700,
                margin: 0,
                color: 'var(--text-primary)',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              AI Agent
            </h2>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {activeFile ? `Focused on ${activeFile}` : 'No active file selected'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{source.description}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4 }}>
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

      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid rgba(148,163,184,0.12)',
          background: 'rgba(7,10,16,0.72)',
          display: 'grid',
          gap: 4,
        }}
      >
        <span style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
          SAVE TARGET
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>{source.label}</span>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {messages.length === 0 && (
          <div
            style={{
              margin: 'auto',
              display: 'grid',
              gap: 12,
              padding: '24px',
              border: '1px solid rgba(148,163,184,0.18)',
              background: 'rgba(15,23,42,0.65)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                display: 'grid',
                placeItems: 'center',
                background: 'rgba(34,211,238,0.12)',
                color: 'var(--accent)',
              }}
            >
              <Orbit size={22} />
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
              Ask for a targeted edit, a refactor, or a patch for the active file. Review stays
              explicit before code is applied.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <Bubble key={msg.id} msg={msg} />
        ))}

        {isThinking && (
          <div
            style={{
              alignSelf: 'flex-start',
              color: 'var(--text-secondary)',
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,255,255,0.03)',
              padding: '8px 12px',
              border: '1px solid var(--panel-border)',
            }}
          >
            <Orbit
              size={14}
              color="var(--accent)"
              style={{ animation: 'panelSpin 2s linear infinite' }}
            />
            {thinkingMessage || 'Thinking...'}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {activeTransactionId && (
        <div
          style={{
            margin: '0 18px 16px',
            padding: '14px',
            background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(96,165,250,0.28)',
            display: 'grid',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, letterSpacing: '0.08em', color: '#bfdbfe' }}>
                PENDING REVIEW
              </span>
              <span style={{ fontSize: 12, color: '#dbeafe' }}>
                Ref {activeTransactionId.substring(0, 6)} with {activeTransactionFiles.length} file
                {activeTransactionFiles.length === 1 ? '' : 's'}
              </span>
            </div>
            <button
              onClick={() => setShowDiff(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid rgba(147,197,253,0.35)',
                background: 'rgba(15,23,42,0.38)',
                color: '#dbeafe',
                padding: '8px 12px',
                cursor: 'pointer',
              }}
            >
              <Eye size={14} strokeWidth={2.5} />
              Review diff
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {activeTransactionFiles.map((file) => (
              <span
                key={file}
                style={{
                  fontSize: 11,
                  padding: '4px 8px',
                  color: '#dbeafe',
                  background: 'rgba(15,23,42,0.48)',
                  border: '1px solid rgba(147,197,253,0.18)',
                }}
              >
                {file}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={approveTransaction}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: '#10b981',
                color: '#041014',
                border: 'none',
                padding: '9px 12px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <Check size={14} strokeWidth={3} />
              Apply and save
            </button>
            <button
              onClick={rejectTransaction}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: 'transparent',
                color: '#e2e8f0',
                border: '1px solid var(--panel-border)',
                padding: '9px 12px',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <X size={14} strokeWidth={2} />
              Discard
            </button>
          </div>
        </div>
      )}

      <div
        style={{
          padding: '14px 18px 18px',
          borderTop: '1px solid var(--panel-border)',
          background: 'rgba(7,10,16,0.92)',
        }}
      >
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            gap: 10,
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid var(--panel-border)',
            padding: '8px 8px 8px 14px',
          }}
        >
          <input
            type="text"
            value={inputMsg}
            onChange={(e) => setInputMsg(e.target.value)}
            disabled={isThinking || !isConnected}
            placeholder={isConnected ? 'Ask for a precise edit...' : 'Connecting...'}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary)',
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
                isThinking || !inputMsg.trim() || !isConnected ? 'var(--text-muted)' : '#041014',
              border: 'none',
              width: 38,
              height: 38,
              display: 'grid',
              placeItems: 'center',
              cursor: isThinking || !inputMsg.trim() || !isConnected ? 'not-allowed' : 'pointer',
            }}
          >
            <Send size={16} strokeWidth={3} />
          </button>
        </form>
      </div>

      {showDiff && activeTransactionId && (
        <DiffViewer
          txId={activeTransactionId}
          patchedPaths={diffService.getTransaction(activeTransactionId)?.patchedPaths || []}
          onClose={() => setShowDiff(false)}
        />
      )}
    </div>
  );
}
