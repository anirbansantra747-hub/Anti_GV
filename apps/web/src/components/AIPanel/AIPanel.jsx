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
import { diffService } from '../../services/diffService.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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
    currentPlan,
    approvePlan,
    rejectPlan,
    chats,
    activeChatId,
    loadChats,
    createChat,
    switchChat,
    isChatLoading,
  } = useAgentStore();
  const activeFile = useEditorStore((s) => s.activeFile);
  const source = useWorkspaceAccessStore((s) => s.source);

  const [inputMsg, setInputMsg] = useState('');
  const messagesEndRef = useRef(null);
  const [indexStatus, setIndexStatus] = useState({
    chunksStored: 0,
    workspaceId: 'default',
    inventoryCount: 0,
    embeddingOk: false,
    chromaOk: false,
    embeddingInfo: null,
    lastUpdated: '',
    loading: false,
    error: '',
  });

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  useEffect(() => {
    if (isConnected) {
      loadChats();
    }
  }, [isConnected, loadChats]);

  useEffect(() => {
    let timer = null;
    const refresh = async () => {
      try {
        setIndexStatus((s) => ({ ...s, loading: true, error: '' }));
        const res = await fetch(`${API_URL}/api/rag/status`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        setIndexStatus((s) => ({
          ...s,
          chunksStored: data.chunksStored || 0,
          workspaceId: data.workspaceId || 'default',
          inventoryCount: data.inventoryCount || 0,
          embeddingOk: Boolean(data.embeddingOk),
          chromaOk: Boolean(data.chromaOk),
          embeddingInfo: data.embeddingInfo || null,
          lastUpdated: new Date().toLocaleTimeString(),
          loading: false,
          error: '',
        }));
      } catch (err) {
        setIndexStatus((s) => ({
          ...s,
          loading: false,
          error: err.message || 'Failed to load status',
        }));
      }
    };

    if (isConnected) {
      refresh();
      timer = setInterval(refresh, 15000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isConnected]);

  const handleReindex = async () => {
    try {
      setIndexStatus((s) => ({ ...s, loading: true, error: '' }));
      const res = await fetch(`${API_URL}/api/rag/index`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incremental: true }),
      });
      if (!res.ok) throw new Error(`Index failed (${res.status})`);
      const data = await res.json();
      setIndexStatus((s) => ({
        ...s,
        chunksStored: data?.result?.newChunks
          ? s.chunksStored + data.result.newChunks
          : s.chunksStored,
        workspaceId: data.workspaceId || s.workspaceId,
        lastUpdated: new Date().toLocaleTimeString(),
        loading: false,
        error: '',
      }));
    } catch (err) {
      setIndexStatus((s) => ({
        ...s,
        loading: false,
        error: err.message || 'Index failed',
      }));
    }
  };

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

      {/* Chat selector */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--panel-border)',
          background: 'rgba(0,0,0,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <select
          value={activeChatId || ''}
          onChange={(e) => switchChat(e.target.value)}
          disabled={isChatLoading || !isConnected}
          style={{
            flex: 1,
            background: 'var(--app-bg)',
            border: '1px solid var(--panel-border)',
            color: 'var(--text-primary)',
            padding: '6px 8px',
            fontSize: 12,
          }}
        >
          {chats.length === 0 && <option value="">No chats</option>}
          {chats.map((c) => (
            <option key={c.chatId} value={c.chatId}>
              {c.title || 'Untitled'}
            </option>
          ))}
        </select>
        <button
          onClick={createChat}
          disabled={!isConnected || isChatLoading}
          style={{
            background: 'var(--accent)',
            color: '#000',
            border: 'none',
            padding: '6px 10px',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            cursor: !isConnected || isChatLoading ? 'not-allowed' : 'pointer',
          }}
        >
          New
        </button>
      </div>

      {/* Index Status */}
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--panel-border)',
          background: 'rgba(0,0,0,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
            }}
          >
            Index Status
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {indexStatus.chunksStored} chunks / {indexStatus.inventoryCount} files -{' '}
            {indexStatus.workspaceId}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            Embed: {indexStatus.embeddingOk ? 'OK' : 'Down'} | Chroma:{' '}
            {indexStatus.chromaOk ? 'OK' : 'Down'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
            {indexStatus.error
              ? `Error: ${indexStatus.error}`
              : indexStatus.lastUpdated
                ? `Updated ${indexStatus.lastUpdated}`
                : 'Not loaded'}
          </span>
        </div>
        <button
          onClick={handleReindex}
          disabled={indexStatus.loading || !isConnected}
          style={{
            background:
              indexStatus.loading || !isConnected ? 'var(--panel-border)' : 'var(--accent)',
            color: indexStatus.loading || !isConnected ? 'var(--text-muted)' : '#000',
            border: 'none',
            borderRadius: 0,
            padding: '6px 10px',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.06em',
            cursor: indexStatus.loading || !isConnected ? 'not-allowed' : 'pointer',
          }}
        >
          {indexStatus.loading ? 'Indexing...' : 'Reindex'}
        </button>
      </div>

      {/* Messages Area */}
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
              onClick={() => {
                const tx = diffService.getTransaction(activeTransactionId);
                const first = tx?.patchedPaths?.[0];
                if (first) {
                  useEditorStore.getState().openFile(first);
                }
              }}
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
              <Eye size={14} strokeWidth={3} /> Review in Editor
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
    </div>
  );
}
