/* eslint-disable no-unused-vars */
/**
 * @file AIPanel.jsx
 * @description Enhanced AI Agent panel with live pipeline timeline, structured plan cards,
 *              file change badges, and rich thinking indicators.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  Send, Cpu, Check, X, Orbit, Eye, Square,
  FileCode, FilePlus, FileX, Zap, Shield, AlertTriangle,
  Clock, ChevronDown, ChevronRight, Activity
} from 'lucide-react';
import { useAgentStore } from '../../stores/agentStore';
import { useEditorStore } from '../../stores/editorStore.js';
import { useWorkspaceAccessStore } from '../../stores/workspaceAccessStore.js';
import { diffService } from '../../services/diffService.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

/* ────────────────────────── Sub-components ────────────────────────── */

const PHASE_ORDER = ['health', 'brief', 'intent', 'context', 'plan', 'validate', 'codegen', 'verification', 'done'];
const PHASE_LABELS = {
  health: 'Health Check', brief: 'Task Brief', intent: 'Intent', context: 'Context',
  plan: 'Planning', validate: 'Validation', codegen: 'Code Gen', verification: 'Verify', done: 'Complete'
};

function PipelineTimeline({ phases }) {
  if (!phases || phases.length === 0) return null;

  const phaseMap = {};
  phases.forEach(p => { phaseMap[p.phase] = p; });

  return (
    <div style={{
      padding: '10px 14px', borderBottom: '1px solid var(--panel-border)',
      background: 'rgba(3,7,18,0.85)',
    }}>
      <div style={{
        fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em',
        color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6
      }}>
        <Activity size={12} /> Pipeline
      </div>
      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        {PHASE_ORDER.map((key, i) => {
          const phase = phaseMap[key];
          const status = phase?.status || 'pending';
          const isActive = status === 'running' || status === 'streaming';
          const isDone = status === 'done';
          const isError = status === 'blocked' || status === 'error';

          const dotColor = isActive ? 'var(--accent)' : isDone ? '#10b981' : isError ? '#ef4444' : 'rgba(148,163,184,0.3)';
          const labelColor = isActive ? 'var(--accent)' : isDone ? '#4ade80' : isError ? '#f87171' : 'var(--text-muted)';

          return (
            <React.Fragment key={key}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minWidth: 48 }}
                title={phase ? `${phase.message || ''}\n${phase.provider || ''}:${phase.model || ''}` : 'Pending'}>
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', background: dotColor,
                  boxShadow: isActive ? `0 0 8px ${dotColor}` : 'none',
                  transition: 'all 0.3s ease',
                  animation: isActive ? 'panelSpin 2s linear infinite' : 'none',
                }} />
                <span style={{ fontSize: 9, color: labelColor, fontWeight: isActive ? 700 : 500, textAlign: 'center' }}>
                  {PHASE_LABELS[key] || key}
                </span>
                {phase?.model && (
                  <span style={{ fontSize: 8, color: 'var(--text-muted)', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {phase.model.split('/').pop()}
                  </span>
                )}
              </div>
              {i < PHASE_ORDER.length - 1 && (
                <div style={{
                  flex: '0 0 auto', width: 12, height: 1,
                  background: isDone ? '#10b981' : 'rgba(148,163,184,0.2)',
                  marginBottom: 18,
                }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

function RiskBadge({ level }) {
  const config = {
    low: { bg: 'rgba(16,185,129,0.15)', color: '#4ade80', border: 'rgba(16,185,129,0.3)', icon: Shield },
    medium: { bg: 'rgba(251,191,36,0.15)', color: '#fbbf24', border: 'rgba(251,191,36,0.3)', icon: AlertTriangle },
    high: { bg: 'rgba(239,68,68,0.15)', color: '#f87171', border: 'rgba(239,68,68,0.3)', icon: AlertTriangle },
  };
  const c = config[level] || config.low;
  const Icon = c.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
      padding: '3px 8px', background: c.bg, color: c.color, border: `1px solid ${c.border}`,
    }}>
      <Icon size={10} /> {level}
    </span>
  );
}

function ActionIcon({ action }) {
  const size = 12;
  switch ((action || '').toUpperCase()) {
    case 'CREATE': return <FilePlus size={size} color="#4ade80" />;
    case 'DELETE': return <FileX size={size} color="#f87171" />;
    case 'RUN_COMMAND': return <Zap size={size} color="#fbbf24" />;
    default: return <FileCode size={size} color="var(--accent)" />;
  }
}

function PlanCard({ data, currentPlan, approvePlan, rejectPlan }) {
  const [expanded, setExpanded] = useState(true);
  const isActive = currentPlan && currentPlan.summary === data.summary;

  return (
    <div style={{
      background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(148,163,184,0.18)',
      borderLeft: '3px solid var(--accent)',
    }}>
      {/* Header */}
      <div onClick={() => setExpanded(!expanded)} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', cursor: 'pointer', userSelect: 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {expanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent)' }}>
            Implementation Plan
          </span>
          {data.risk_level && <RiskBadge level={data.risk_level} />}
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {data.steps?.length || 0} steps
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 14px 14px' }}>
          {/* Summary */}
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {data.summary}
          </p>

          {/* Steps */}
          <div style={{ display: 'grid', gap: 6 }}>
            {(data.steps || []).map((s, i) => (
              <div key={s.stepId || i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '8px 10px',
                background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(148,163,184,0.1)',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: 'var(--text-muted)',
                  minWidth: 20, textAlign: 'right', paddingTop: 2,
                }}>
                  {i + 1}.
                </span>
                <ActionIcon action={s.action} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                      padding: '1px 5px',
                      background: s.action === 'CREATE' ? 'rgba(16,185,129,0.15)' : s.action === 'DELETE' ? 'rgba(239,68,68,0.15)' : 'rgba(34,211,238,0.1)',
                      color: s.action === 'CREATE' ? '#4ade80' : s.action === 'DELETE' ? '#f87171' : 'var(--accent)',
                    }}>
                      {s.action || 'EDIT'}
                    </span>
                    {(s.files?.length ? s.files : [s.filePath]).filter(Boolean).map(f => (
                      <code key={f} style={{
                        fontSize: 11, background: 'rgba(0,0,0,0.4)', padding: '1px 5px',
                        color: 'var(--text-primary)', maxWidth: 200, overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {f}
                      </code>
                    ))}
                  </div>
                  {s.description && (
                    <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {s.description}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Validation */}
          {data.validation && (
            <div style={{
              marginTop: 10, padding: '8px 10px', fontSize: 11,
              background: data.validation.valid ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${data.validation.valid ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
              color: data.validation.valid ? '#4ade80' : '#f87171',
            }}>
              <strong>{data.validation.valid ? '✓ Validation Passed' : '✗ Validation Blocked'}</strong>
              {data.validation.warnings?.length > 0 && (
                <div style={{ marginTop: 4, color: '#fbbf24' }}>
                  ⚠ {data.validation.warnings.join(' | ')}
                </div>
              )}
            </div>
          )}

          {/* Approval Buttons */}
          {isActive && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={approvePlan} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: '#10b981', color: '#fff', border: 'none', padding: '9px',
                cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'background 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#059669'}
                onMouseLeave={e => e.currentTarget.style.background = '#10b981'}>
                <Check size={14} strokeWidth={3} /> Approve Plan
              </button>
              <button onClick={rejectPlan} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: 'rgba(255,255,255,0.05)', color: '#cbd5e1',
                border: '1px solid var(--panel-border)', padding: '9px',
                cursor: 'pointer', fontSize: 12, fontWeight: 500, transition: 'background 0.2s',
              }}
                onMouseEnter={e => e.currentTarget.style.background = '#ef444455'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}>
                <X size={14} strokeWidth={2} /> Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FileChangeBadge({ msg }) {
  const file = msg.content?.match(/Staged edits for (.+?) in/)?.[1] || 'file';
  const isApproved = msg.criticFeedback?.includes('Approved') || msg.criticFeedback?.includes('verified');

  return (
    <div style={{
      background: 'var(--app-bg)', border: '1px solid var(--panel-border)',
      borderLeft: `3px solid ${isApproved ? '#10b981' : '#fbbf24'}`,
      padding: '10px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <FileCode size={14} color="var(--accent)" />
        <code style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 600 }}>{file}</code>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          padding: '2px 6px',
          background: isApproved ? 'rgba(16,185,129,0.15)' : 'rgba(251,191,36,0.15)',
          color: isApproved ? '#4ade80' : '#fbbf24',
        }}>
          {isApproved ? 'Verified' : 'Needs Review'}
        </span>
      </div>
      {msg.criticFeedback && (
        <div style={{
          fontSize: 11, color: isApproved ? '#4ade80' : '#fbbf24',
          padding: '6px 8px', background: 'rgba(0,0,0,0.2)',
          borderTop: '1px dashed var(--panel-border)',
          lineHeight: 1.5,
        }}>
          <strong style={{ opacity: 0.7, fontSize: 10 }}>Critic:</strong> {msg.criticFeedback}
        </div>
      )}
    </div>
  );
}

function ThinkingIndicator({ message, latestRunState, activeStep, onTerminate }) {
  return (
    <div style={{
      alignSelf: 'flex-start', color: 'var(--text-secondary)', fontSize: 12,
      display: 'flex', flexDirection: 'column', gap: 6,
      background: 'rgba(255,255,255,0.03)', padding: '10px 14px',
      border: '1px solid var(--panel-border)', width: '100%', boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Orbit size={14} color="var(--accent)" style={{ animation: 'panelSpin 2s linear infinite', flexShrink: 0 }} />
          <span style={{ fontWeight: 600 }}>{message || 'Thinking...'}</span>
        </div>
        <button onClick={onTerminate} title="Terminate pipeline" style={{
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
          color: '#f87171', padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600, flexShrink: 0,
        }}>
          <Square size={10} fill="#f87171" strokeWidth={0} /> Stop
        </button>
      </div>
      {latestRunState && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {latestRunState.provider && (
            <span style={{
              fontSize: 9, padding: '2px 6px', background: 'rgba(34,211,238,0.1)',
              color: 'var(--accent)', border: '1px solid rgba(34,211,238,0.2)',
            }}>
              {latestRunState.provider}:{latestRunState.model?.split('/').pop() || '?'}
            </span>
          )}
          {latestRunState.phase && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              Phase: {latestRunState.phase}
            </span>
          )}
          {activeStep?.stepId && (
            <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>
              Step: {activeStep.stepId}
            </span>
          )}
        </div>
      )}
    </div>
  );
}


/* ────────────────────────── Main Panel ────────────────────────── */

export default function AIPanel() {
  const {
    connect, disconnect, isConnected, messages, isThinking, thinkingMessage,
    sendPrompt, terminate, activeTransactionId, activeTransactionFiles,
    approveTransaction, rejectTransaction, currentPlan, approvePlan, rejectPlan,
    chats, activeChatId, loadChats, createChat, switchChat, isChatLoading,
    latestRunState, controlPlane, loadControlPlane, activeTransactionMeta,
    pipelinePhases, activeStep,
  } = useAgentStore();
  const activeFile = useEditorStore((s) => s.activeFile);
  const source = useWorkspaceAccessStore((s) => s.source);

  const [inputMsg, setInputMsg] = useState('');
  const messagesEndRef = useRef(null);
  const [indexStatus, setIndexStatus] = useState({
    chunksStored: 0, workspaceId: 'default', inventoryCount: 0,
    embeddingOk: false, chromaOk: false, embeddingInfo: null,
    lastUpdated: '', loading: false, error: '',
  });

  useEffect(() => { connect(); return () => disconnect(); }, [connect, disconnect]);
  useEffect(() => {
    if (isConnected) { loadChats(); loadControlPlane(); }
  }, [isConnected, loadChats, loadControlPlane]);

  useEffect(() => {
    let timer = null;
    const refresh = async () => {
      try {
        setIndexStatus(s => ({ ...s, loading: true, error: '' }));
        const res = await fetch(`${API_URL}/api/rag/status`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        setIndexStatus(s => ({
          ...s, chunksStored: data.chunksStored || 0, workspaceId: data.workspaceId || 'default',
          inventoryCount: data.inventoryCount || 0, embeddingOk: Boolean(data.embeddingOk),
          chromaOk: Boolean(data.chromaOk), embeddingInfo: data.embeddingInfo || null,
          lastUpdated: new Date().toLocaleTimeString(), loading: false, error: '',
        }));
      } catch (err) {
        setIndexStatus(s => ({ ...s, loading: false, error: err.message || 'Failed to load status' }));
      }
    };
    if (isConnected) { refresh(); timer = setInterval(refresh, 15000); }
    return () => { if (timer) clearInterval(timer); };
  }, [isConnected]);

  const handleReindex = async () => {
    try {
      setIndexStatus(s => ({ ...s, loading: true, error: '' }));
      const res = await fetch(`${API_URL}/api/rag/index`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ incremental: true }),
      });
      if (!res.ok) throw new Error(`Index failed (${res.status})`);
      const data = await res.json();
      setIndexStatus(s => ({
        ...s, chunksStored: data?.result?.newChunks ? s.chunksStored + data.result.newChunks : s.chunksStored,
        workspaceId: data.workspaceId || s.workspaceId,
        lastUpdated: new Date().toLocaleTimeString(), loading: false, error: '',
      }));
    } catch (err) {
      setIndexStatus(s => ({ ...s, loading: false, error: err.message || 'Index failed' }));
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
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'linear-gradient(180deg, color-mix(in srgb, var(--panel-bg) 90%, #0b1220) 0%, #090d14 100%)',
    }}>
      <style>{`
        @keyframes blink { 50% { opacity: 0; } }
        @keyframes panelSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{
        padding: '14px 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        borderBottom: '1px solid var(--panel-border)', background: 'rgba(8,12,18,0.9)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Cpu size={18} color="var(--accent)" strokeWidth={2} />
            <h2 style={{
              fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              AI Agent
            </h2>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
            {activeFile ? `Focused on ${activeFile}` : 'No active file selected'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{source.description}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 4 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isConnected ? '#10b981' : '#ef4444',
            boxShadow: `0 0 8px ${isConnected ? '#10b981' : '#ef4444'}`,
          }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>
            {isConnected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* Chat selector */}
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.2)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <select value={activeChatId || ''} onChange={e => switchChat(e.target.value)}
          disabled={isChatLoading || !isConnected} style={{
            flex: 1, background: 'var(--app-bg)', border: '1px solid var(--panel-border)',
            color: 'var(--text-primary)', padding: '6px 8px', fontSize: 12,
          }}>
          {chats.length === 0 && <option value="">No chats</option>}
          {chats.map(c => <option key={c.chatId} value={c.chatId}>{c.title || 'Untitled'}</option>)}
        </select>
        <button onClick={createChat} disabled={!isConnected || isChatLoading} style={{
          background: 'var(--accent)', color: '#000', border: 'none', padding: '6px 10px',
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          cursor: !isConnected || isChatLoading ? 'not-allowed' : 'pointer',
        }}>
          New
        </button>
      </div>

      {/* Pipeline Timeline */}
      <PipelineTimeline phases={pipelinePhases} />

      {/* Provider Health */}
      {controlPlane?.health && (
        <div style={{
          padding: '8px 14px', borderBottom: '1px solid var(--panel-border)', background: 'rgba(3,7,18,0.6)',
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          {Object.entries(controlPlane.health).map(([provider, state]) => (
            <span key={provider} style={{
              fontSize: 9, padding: '3px 6px',
              color: state.availabilityState === 'healthy' ? '#4ade80' : '#fbbf24',
              border: `1px solid ${state.availabilityState === 'healthy' ? 'rgba(16,185,129,0.2)' : 'rgba(251,191,36,0.2)'}`,
              background: 'rgba(15,23,42,0.5)',
            }}>
              {provider}: {state.availabilityState}
            </span>
          ))}
        </div>
      )}

      {/* Index Status */}
      <div style={{
        padding: '8px 14px', borderBottom: '1px solid var(--panel-border)', background: 'rgba(0,0,0,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            Index
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-primary)' }}>
            {indexStatus.chunksStored} chunks / {indexStatus.inventoryCount} files
          </span>
        </div>
        <button onClick={handleReindex} disabled={indexStatus.loading || !isConnected} style={{
          background: indexStatus.loading || !isConnected ? 'var(--panel-border)' : 'var(--accent)',
          color: indexStatus.loading || !isConnected ? 'var(--text-muted)' : '#000',
          border: 'none', padding: '4px 10px', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
          cursor: indexStatus.loading || !isConnected ? 'not-allowed' : 'pointer',
        }}>
          {indexStatus.loading ? '...' : 'Reindex'}
        </button>
      </div>

      {/* Messages Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.length === 0 && (
          <div style={{
            margin: 'auto', display: 'grid', gap: 12, padding: '24px',
            border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(15,23,42,0.65)',
          }}>
            <div style={{
              width: 44, height: 44, display: 'grid', placeItems: 'center',
              background: 'rgba(34,211,238,0.12)', color: 'var(--accent)',
            }}>
              <Orbit size={22} />
            </div>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
              Ask for a targeted edit, a refactor, or a patch. Review stays explicit before code is applied.
            </p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className="animate-in" style={{
            display: 'flex', flexDirection: 'column',
            alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
          }}>
            {/* Plan message */}
            {msg.type === 'plan' ? (
              <div style={{ width: '100%' }}>
                <PlanCard data={msg.data} currentPlan={currentPlan} approvePlan={approvePlan} rejectPlan={rejectPlan} />
              </div>
            ) : msg.type === 'code' ? (
              <div style={{ width: '100%' }}>
                <FileChangeBadge msg={msg} />
              </div>
            ) : (
              <div style={{
                background: msg.role === 'user' ? 'var(--accent)' : 'var(--app-bg)',
                color: msg.role === 'user' ? '#000000' : 'var(--text-primary)',
                padding: '12px 16px', maxWidth: '90%', wordBreak: 'break-word',
                fontSize: 13.5, lineHeight: 1.6,
                border: msg.role === 'user' ? '1px solid var(--accent-dim)' : '1px solid var(--panel-border)',
                borderLeft: msg.role === 'user' ? '1px solid var(--accent-dim)' : '4px solid var(--accent)',
                boxShadow: msg.role === 'user' ? '4px 4px 0px rgba(0,0,0,1)' : 'none',
                ...(msg.type === 'error' && {
                  color: 'var(--red)', border: '1px solid var(--red)',
                  borderLeft: '4px solid var(--red)', background: 'var(--app-bg)',
                }),
              }}>
                <div style={{ position: 'relative' }}>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</span>
                  {msg.isStreaming && (
                    <span style={{
                      display: 'inline-block', width: '8px', height: '14px',
                      background: '#cbd5e1', marginLeft: '4px', verticalAlign: 'middle',
                      animation: 'blink 1s step-end infinite',
                    }} />
                  )}
                </div>
              </div>
            )}
          </div>
        ))}

        {isThinking && (
          <ThinkingIndicator message={thinkingMessage} latestRunState={latestRunState}
            activeStep={activeStep} onTerminate={terminate} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Transaction Review */}
      {activeTransactionId && (
        <div style={{
          margin: '0 18px 16px', padding: '14px', background: 'rgba(59,130,246,0.12)',
          border: '1px solid rgba(96,165,250,0.28)', display: 'grid', gap: 10,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 11, letterSpacing: '0.08em', color: '#bfdbfe' }}>PENDING REVIEW</span>
              <span style={{ fontSize: 12, color: '#dbeafe' }}>
                Ref {activeTransactionId.substring(0, 6)} with {activeTransactionFiles.length} file
                {activeTransactionFiles.length === 1 ? '' : 's'}
              </span>
            </div>
            <button onClick={() => {
              const tx = diffService.getTransaction(activeTransactionId);
              const first = tx?.patchedPaths?.[0];
              if (first) useEditorStore.getState().openFile(first);
            }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              border: '1px solid rgba(147,197,253,0.35)', background: 'rgba(15,23,42,0.38)',
              color: '#dbeafe', padding: '8px 12px', cursor: 'pointer',
            }}>
              <Eye size={14} strokeWidth={3} /> Review
            </button>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {activeTransactionFiles.map(file => (
              <span key={file} style={{
                fontSize: 11, padding: '3px 8px', color: '#dbeafe',
                background: 'rgba(15,23,42,0.48)', border: '1px solid rgba(147,197,253,0.18)',
              }}>
                {file}
                {activeTransactionMeta[file]?.model && (
                  <span style={{ opacity: 0.6, marginLeft: 4, fontSize: 9 }}>
                    via {activeTransactionMeta[file].model}
                  </span>
                )}
              </span>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={approveTransaction} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: '#10b981', color: '#041014', border: 'none', padding: '9px 12px',
              cursor: 'pointer', fontSize: 12, fontWeight: 700,
            }}>
              <Check size={14} strokeWidth={3} /> Apply & Save
            </button>
            <button onClick={rejectTransaction} style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: 'transparent', color: '#e2e8f0', border: '1px solid var(--panel-border)',
              padding: '9px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600,
            }}>
              <X size={14} strokeWidth={2} /> Discard
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '14px 18px 18px', borderTop: '1px solid var(--panel-border)',
        background: 'rgba(7,10,16,0.92)',
      }}>
        <form onSubmit={handleSubmit} style={{
          display: 'flex', gap: 10, background: 'rgba(15,23,42,0.9)',
          border: '1px solid var(--panel-border)', padding: '8px 8px 8px 14px',
        }}>
          <input type="text" value={inputMsg} onChange={e => setInputMsg(e.target.value)}
            disabled={isThinking || !isConnected}
            placeholder={isConnected ? 'Ask for a precise edit...' : 'Connecting...'}
            style={{
              flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)',
              outline: 'none', fontSize: 14,
            }} />
          <button type="submit" disabled={isThinking || !inputMsg.trim() || !isConnected} style={{
            background: isThinking || !inputMsg.trim() || !isConnected ? 'var(--panel-border)' : 'var(--accent)',
            color: isThinking || !inputMsg.trim() || !isConnected ? 'var(--text-muted)' : '#041014',
            border: 'none', width: 38, height: 38, display: 'grid', placeItems: 'center',
            cursor: isThinking || !inputMsg.trim() || !isConnected ? 'not-allowed' : 'pointer',
          }}>
            <Send size={16} strokeWidth={3} />
          </button>
        </form>
      </div>
    </div>
  );
}
