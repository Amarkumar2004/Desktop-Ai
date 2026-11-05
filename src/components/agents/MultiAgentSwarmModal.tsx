'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Shield,
  FileCode,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  Loader2,
  X,
  Copy,
  Check,
  Terminal,
  ArrowRight,
} from 'lucide-react';
import { fetchWithDesktopAuth } from '@/lib/security/desktopAuthClient';
import type { AgentMessage, AgentRun } from '@/backend/types/database';

export interface ExtendedTaskItem {
  id: string;
  title: string;
  description?: string;
  assignedAgent: 'LEX' | 'SUSI' | 'SPY' | 'EURO' | 'lex' | 'susi' | 'spy' | 'euro';
  progress: number;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  category: string;
  status?: 'Active' | 'Scheduled' | 'Completed';
  createdAt?: string;
  eta?: string;
  completed?: boolean;
}

export interface SwarmStageInfo {
  agent: 'SUSI' | 'SPY' | 'EURO' | 'LEX';
  stage: 'PLANNING' | 'RESEARCH' | 'ANALYSIS' | 'EXECUTION' | 'VERIFICATION';
  label: string;
  role: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  summary?: string;
  durationMs?: number;
}

interface MultiAgentSwarmModalProps {
  isOpen: boolean;
  task: ExtendedTaskItem | null;
  onClose: () => void;
  onTaskUpdated?: (updatedTask: ExtendedTaskItem) => void;
}

export default function MultiAgentSwarmModal({
  isOpen,
  task,
  onClose,
  onTaskUpdated,
}: MultiAgentSwarmModalProps) {
  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <SwarmModalContent key={task.id} task={task} onClose={onClose} onTaskUpdated={onTaskUpdated} />
    </div>
  );
}

function SwarmModalContent({
  task,
  onClose,
  onTaskUpdated,
}: {
  task: ExtendedTaskItem;
  onClose: () => void;
  onTaskUpdated?: (updatedTask: ExtendedTaskItem) => void;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pipeline' | 'messages' | 'artifacts' | 'verification'>('pipeline');
  const [stages, setStages] = useState<SwarmStageInfo[]>([
    { agent: 'SUSI', stage: 'PLANNING', label: '1. SUSI — Manager', role: 'Decomposes task & issues directives', status: 'pending' },
    { agent: 'SPY', stage: 'RESEARCH', label: '2. SPY — Research', role: 'Real technical intelligence & evidence', status: 'pending' },
    { agent: 'EURO', stage: 'ANALYSIS', label: '3. EURO — Analysis', role: 'Risk analysis & architecture blueprint', status: 'pending' },
    { agent: 'LEX', stage: 'EXECUTION', label: '4. LEX — Execution', role: 'Concrete implementation & code deliverables', status: 'pending' },
    { agent: 'SUSI', stage: 'VERIFICATION', label: '5. SUSI — Verification', role: 'Audit & final executive sign-off', status: 'pending' },
  ]);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [artifacts, setArtifacts] = useState<{ filename: string; content: string; language?: string }[]>([]);
  const [verificationSummary, setVerificationSummary] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedArtifact, setCopiedArtifact] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Fetch past run & messages on mount
  useEffect(() => {
    let isMounted = true;
    fetchWithDesktopAuth(`/api/agents/orchestrate?taskId=${task.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted || !data) return;
        if (data.runs && data.runs.length > 0) {
          const latestRun: AgentRun = data.runs[0];
          setRunId(latestRun.id);
          if (latestRun.status === 'completed') {
            setIsVerified(true);
            setStages((prev) => prev.map((s) => ({ ...s, status: 'completed' })));
          } else if (latestRun.status === 'failed') {
            setIsVerified(false);
          }
        }
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        }
        if (Array.isArray(data.steps)) {
          const stageByIndex: Record<number, SwarmStageInfo['stage']> = {
            1: 'PLANNING',
            2: 'RESEARCH',
            3: 'ANALYSIS',
            4: 'EXECUTION',
            5: 'VERIFICATION',
          };
          const statusMap: Record<string, SwarmStageInfo['status']> = {
            pending: 'pending',
            running: 'running',
            completed: 'completed',
            failed: 'failed',
            cancelled: 'cancelled',
            blocked: 'failed',
            requires_approval: 'pending',
          };
          setStages((previous) => previous.map((stage) => {
            const persisted = (data.steps as Array<{ step_index: number; status: string; error?: string | null }>)
              .find((step) => stageByIndex[step.step_index] === stage.stage);
            return persisted
              ? { ...stage, status: statusMap[persisted.status] || stage.status, summary: persisted.error || stage.summary }
              : stage;
          }));
        }
      })
      .catch((err) => {
        console.warn('[MultiAgentSwarmModal] Past run fetch failed:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [task.id]);

  // Real-time custom event listeners from AgentRuntimeService
  useEffect(() => {
    const handleMessageAdded = (e: Event) => {
      const custom = e as CustomEvent<{ runId: string; message: AgentMessage }>;
      if (custom.detail?.message) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === custom.detail.message.id)) return prev;
          return [...prev, custom.detail.message];
        });
      }
    };

    const handleRunUpdated = (e: Event) => {
      const custom = e as CustomEvent<AgentRun>;
      if (custom.detail) {
        const run = custom.detail;
        if (run.id && (!runId || runId === run.id)) {
          setRunId(run.id);
          if (run.status === 'completed') {
            setIsVerified(true);
            setStages((prev) => prev.map((s) => ({ ...s, status: 'completed' })));
          } else if (run.status === 'failed') {
            setIsVerified(false);
          }
        }
      }
    };

    window.addEventListener('susi-agent-message-added', handleMessageAdded);
    window.addEventListener('susi-agent-run-updated', handleRunUpdated);
    return () => {
      window.removeEventListener('susi-agent-message-added', handleMessageAdded);
      window.removeEventListener('susi-agent-run-updated', handleRunUpdated);
    };
  }, [runId]);

  // Poll persisted backend state while the server-side pipeline is running.
  // Browser custom events cannot observe events emitted inside the Next.js server process.
  useEffect(() => {
    if (!isRunning) return;

    let disposed = false;
    const syncRuntimeState = async () => {
      try {
        const response = await fetchWithDesktopAuth(`/api/agents/orchestrate?taskId=${encodeURIComponent(task.id)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (disposed) return;

        if (Array.isArray(data.runs) && data.runs.length > 0) {
          const latestRun = data.runs[0] as AgentRun;
          setRunId(latestRun.id);
          if (latestRun.status === 'completed') setIsVerified(true);
          if (latestRun.status === 'failed' || latestRun.status === 'cancelled') setIsVerified(false);
        }

        if (Array.isArray(data.messages)) {
          setMessages((previous) => {
            const byId = new Map(previous.map((message) => [message.id, message]));
            for (const message of data.messages as AgentMessage[]) byId.set(message.id, message);
            return Array.from(byId.values()).sort(
              (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
            );
          });
        }

        if (Array.isArray(data.steps)) {
          const stageByIndex: Record<number, SwarmStageInfo['stage']> = {
            1: 'PLANNING',
            2: 'RESEARCH',
            3: 'ANALYSIS',
            4: 'EXECUTION',
            5: 'VERIFICATION',
          };
          const statusMap: Record<string, SwarmStageInfo['status']> = {
            pending: 'pending',
            running: 'running',
            completed: 'completed',
            failed: 'failed',
            cancelled: 'cancelled',
            blocked: 'failed',
            requires_approval: 'pending',
          };
          setStages((previous) => previous.map((stage) => {
            const persisted = (data.steps as Array<{ step_index: number; status: string; title?: string | null; error?: string | null }>)
              .find((step) => stageByIndex[step.step_index] === stage.stage);
            if (!persisted) return stage;
            return {
              ...stage,
              status: statusMap[persisted.status] || stage.status,
              summary: persisted.error || stage.summary,
            };
          }));
        }
      } catch (pollError) {
        console.warn('[MultiAgentSwarmModal] Runtime state sync failed:', pollError);
      }
    };

    void syncRuntimeState();
    const timer = window.setInterval(() => void syncRuntimeState(), 1200);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [isRunning, task.id]);

  // Auto-scroll messages
  useEffect(() => {
    if (activeTab === 'messages') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, activeTab]);

  const handleStartSwarm = async () => {
    if (isRunning) return;
    setError(null);
    setIsRunning(true);
    setVerificationSummary(null);
    setIsVerified(null);
    setArtifacts([]);
    setMessages([]);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setStages([
      { agent: 'SUSI', stage: 'PLANNING', label: '1. SUSI — Manager', role: 'Decomposes task & issues directives', status: 'running' },
      { agent: 'SPY', stage: 'RESEARCH', label: '2. SPY — Research', role: 'Real technical intelligence & evidence', status: 'pending' },
      { agent: 'EURO', stage: 'ANALYSIS', label: '3. EURO — Analysis', role: 'Risk analysis & architecture blueprint', status: 'pending' },
      { agent: 'LEX', stage: 'EXECUTION', label: '4. LEX — Execution', role: 'Concrete implementation & code deliverables', status: 'pending' },
      { agent: 'SUSI', stage: 'VERIFICATION', label: '5. SUSI — Verification', role: 'Audit & final executive sign-off', status: 'pending' },
    ]);

    try {
      const res = await fetchWithDesktopAuth('/api/agents/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: task.id,
          title: task.title,
          objective: task.description || task.title,
          context: {
            priority: task.priority,
            category: task.category,
          },
        }),
        signal: controller.signal,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Pipeline execution failed.');
      }

      setRunId(data.runId);
      setIsVerified(data.susiVerification?.verified ?? true);
      setVerificationSummary(data.susiVerification?.executiveSummary || data.finalOutput || null);

      if (data.lexExecution?.artifacts) {
        setArtifacts(data.lexExecution.artifacts);
      }

      setStages((prev) =>
        prev.map((s) => ({
          ...s,
          status: 'completed',
        }))
      );

      onTaskUpdated?.({
        ...task,
        progress: 100,
        completed: true,
        status: 'Completed',
      });
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        setError('Pipeline execution aborted by user.');
        setStages((prev) =>
          prev.map((s) => (s.status === 'running' ? { ...s, status: 'cancelled' } : s))
        );
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setStages((prev) =>
          prev.map((s) => (s.status === 'running' ? { ...s, status: 'failed', summary: msg } : s))
        );
      }
    } finally {
      setIsRunning(false);
      abortControllerRef.current = null;
    }
  };

  const handleAbortSwarm = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleCopyCode = (filename: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedArtifact(filename);
    setTimeout(() => setCopiedArtifact(null), 2000);
  };

  return (
    <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="px-6 py-4 bg-stone-900 text-white flex items-center justify-between border-b border-stone-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 text-stone-950 flex items-center justify-center font-black shadow-sm">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base tracking-tight">SUSI Multi-Agent Autonomous Swarm</h3>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                SUSI → SPY → EURO → LEX → VERIFIED
              </span>
            </div>
            <p className="text-xs text-stone-400 truncate max-w-xl">
              Task: <span className="text-stone-200 font-semibold">{task.title}</span>
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Pipeline Stepper Visualization */}
      <div className="bg-stone-50 px-6 py-3 border-b border-stone-200">
        <div className="grid grid-cols-5 gap-2">
          {stages.map((st, idx) => {
            const isCurrent = st.status === 'running';
            const isDone = st.status === 'completed';
            const isFailed = st.status === 'failed';
            const isCancelled = st.status === 'cancelled';

            return (
              <div
                key={idx}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  isCurrent
                    ? 'bg-amber-50 border-amber-400 shadow-xs'
                    : isDone
                    ? 'bg-emerald-50/70 border-emerald-300'
                    : isFailed
                    ? 'bg-rose-50 border-rose-300'
                    : isCancelled
                    ? 'bg-stone-100 border-stone-300 opacity-60'
                    : 'bg-white border-stone-200'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] font-bold">
                  <span
                    className={`${
                      isCurrent
                        ? 'text-amber-900'
                        : isDone
                        ? 'text-emerald-800'
                        : isFailed
                        ? 'text-rose-800'
                        : 'text-stone-700'
                    }`}
                  >
                    {st.agent}
                  </span>
                  {isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                  ) : isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : isFailed ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-stone-300" />
                  )}
                </div>
                <div className="text-[10px] font-semibold text-stone-800 mt-1 truncate">
                  {st.stage}
                </div>
                <div className="text-[9px] text-stone-500 line-clamp-1 mt-0.5">{st.role}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="px-6 pt-3 bg-white border-b border-stone-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {[
            { id: 'pipeline' as const, label: 'Pipeline Stages', icon: ArrowRight },
            { id: 'messages' as const, label: `Inter-Agent Messages (${messages.length})`, icon: Terminal },
            { id: 'artifacts' as const, label: `Deliverables & Code (${artifacts.length})`, icon: FileCode },
            { id: 'verification' as const, label: 'Executive Verification', icon: Shield },
          ].map((tab) => {
            const active = activeTab === tab.id;
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  active
                    ? 'border-amber-500 text-stone-900'
                    : 'border-transparent text-stone-500 hover:text-stone-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Swarm Controls */}
        <div className="flex items-center gap-2 pb-2">
          {isRunning ? (
            <button
              onClick={handleAbortSwarm}
              className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Abort Pipeline
            </button>
          ) : (
            <button
              onClick={handleStartSwarm}
              className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer active:scale-95"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {runId ? 'Re-Run Multi-Agent Swarm' : 'Launch Multi-Agent Pipeline'}
            </button>
          )}
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-stone-50/50">
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Execution Error</div>
              <div>{error}</div>
            </div>
          </div>
        )}

        {/* TAB 1: PIPELINE STAGES DETAIL */}
        {activeTab === 'pipeline' && (
          <div className="space-y-3">
            {stages.map((st, idx) => (
              <div
                key={idx}
                className="p-4 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-stone-900">{st.label}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-600 font-semibold">
                      STAGE: {st.stage}
                    </span>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      st.status === 'completed'
                        ? 'bg-emerald-100 text-emerald-800'
                        : st.status === 'running'
                        ? 'bg-amber-100 text-amber-800 animate-pulse'
                        : st.status === 'failed'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {st.status.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-stone-600">{st.role}</p>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: INTER-AGENT MESSAGES STREAM */}
        {activeTab === 'messages' && (
          <div className="space-y-3">
            {messages.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs">
                No inter-agent messages recorded yet. Launch the swarm to begin communication.
              </div>
            ) : (
              messages.map((msg, idx) => {
                const timeString = msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : '';
                return (
                  <div
                    key={idx}
                    className="p-3.5 bg-white rounded-xl border border-stone-200/80 shadow-2xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-stone-900">{msg.from_agent}</span>
                        <ArrowRight className="w-3 h-3 text-stone-400" />
                        <span className="font-semibold text-stone-600">{msg.to_agent}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 uppercase">
                          {msg.message_type}
                        </span>
                      </div>
                      {timeString && (
                        <span className="text-[10px] font-mono text-stone-400">
                          {timeString}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-stone-700 whitespace-pre-wrap font-sans leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* TAB 3: DELIVERABLES & ARTIFACTS */}
        {activeTab === 'artifacts' && (
          <div className="space-y-4">
            {artifacts.length === 0 ? (
              <div className="text-center py-12 text-stone-400 text-xs">
                No concrete implementation deliverables produced yet. Launch LEX execution stage to generate code and config.
              </div>
            ) : (
              artifacts.map((art, idx) => (
                <div key={idx} className="bg-white rounded-xl border border-stone-200 overflow-hidden shadow-2xs">
                  <div className="px-4 py-2.5 bg-stone-100 flex items-center justify-between border-b border-stone-200">
                    <div className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-purple-600" />
                      <span className="text-xs font-mono font-bold text-stone-800">{art.filename}</span>
                      {art.language && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-200 text-stone-600">
                          {art.language}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleCopyCode(art.filename, art.content)}
                      className="px-2 py-1 text-xs font-medium text-stone-600 hover:text-stone-900 bg-white border border-stone-300 rounded-lg flex items-center gap-1 transition-colors"
                    >
                      {copiedArtifact === art.filename ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" /> Copied
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copy
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-4 text-xs font-mono bg-stone-950 text-stone-200 overflow-x-auto max-h-80 leading-relaxed">
                    <code>{art.content}</code>
                  </pre>
                </div>
              ))
            )}
          </div>
        )}

        {/* TAB 4: EXECUTIVE VERIFICATION */}
        {activeTab === 'verification' && (
          <div className="space-y-4">
            <div
              className={`p-4 rounded-xl border flex items-start gap-3 ${
                isVerified
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                  : isVerified === false
                  ? 'bg-rose-50 border-rose-300 text-rose-900'
                  : 'bg-stone-100 border-stone-200 text-stone-700'
              }`}
            >
              {isVerified ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : isVerified === false ? (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <Shield className="w-5 h-5 text-stone-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold text-sm">
                  {isVerified
                    ? 'SUSI Executive Verification Passed'
                    : isVerified === false
                    ? 'SUSI Executive Verification Rejected'
                    : 'Verification Pending'}
                </div>
                <p className="text-xs mt-1">
                  {isVerified
                    ? 'All research evidence, architectural blueprints, and implementation deliverables were audited and meet project criteria.'
                    : isVerified === false
                    ? 'Deliverables failed to satisfy criteria or required security constraints.'
                    : 'Launch the multi-agent pipeline to generate and verify deliverables.'}
                </p>
              </div>
            </div>

            {verificationSummary && (
              <div className="p-5 bg-white rounded-xl border border-stone-200 shadow-2xs space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-stone-700">
                  Executive Summary & Audit Notes
                </div>
                <div className="text-xs text-stone-800 whitespace-pre-wrap font-sans leading-relaxed">
                  {verificationSummary}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-stone-100 border-t border-stone-200 flex items-center justify-between text-xs text-stone-500">
        <span>Backend Persistence: Supabase agent_runs, agent_messages, task_steps</span>
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-xs font-bold text-stone-700 hover:text-stone-900 bg-white border border-stone-300 rounded-xl hover:bg-stone-50 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
