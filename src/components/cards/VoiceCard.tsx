'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  Users,
  Square,
  Sparkles,
  Wifi,
  WifiOff,
  RotateCcw,
} from 'lucide-react';
import type { ProviderConnectionMetadata } from '@/types/aiProviders';
import { HybridVoiceEngine, VoiceMode, VoiceState, VoiceProcessResult } from '@/lib/voice/HybridVoiceEngine';
import { createTask } from '@/backend/services/taskService';
import { useToast } from '@/lib/toast/ToastContext';
import { ApprovalService } from '@/lib/security/approvalService';
import { PermissionRequest } from '@/lib/security/types';

interface VoiceHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

const SVG_H = 280;
const WIRE_END_Y = 140;

const AGENTS_LIST = [
  {
    id: 'LEX',
    name: 'LEX',
    role: 'Research & Intelligence',
    initials: 'LE',
    color: '#8B5CF6',
    gradient: 'from-purple-500 to-indigo-600',
    cardBorder: 'border-purple-200/70 hover:border-purple-300',
    cardBg: 'bg-purple-50/40 hover:bg-purple-50/70',
    dotBg: 'bg-purple-500',
    barColor: '#A855F7',
  },
  {
    id: 'SUSI',
    name: 'SUSI',
    role: 'Swarm Orchestrator',
    initials: 'SU',
    color: '#3B82F6',
    gradient: 'from-blue-500 to-cyan-500',
    cardBorder: 'border-blue-200/70 hover:border-blue-300',
    cardBg: 'bg-blue-50/40 hover:bg-blue-50/70',
    dotBg: 'bg-blue-500',
    barColor: '#3B82F6',
  },
  {
    id: 'SPY',
    name: 'SPY',
    role: 'Security Recon Ops',
    initials: 'SP',
    color: '#F59E0B',
    gradient: 'from-amber-500 to-orange-500',
    cardBorder: 'border-amber-200/70 hover:border-amber-300',
    cardBg: 'bg-amber-50/40 hover:bg-amber-50/70',
    dotBg: 'bg-amber-500',
    barColor: '#F59E0B',
  },
  {
    id: 'YORU',
    name: 'YORU',
    role: 'Creative Synthesizer',
    initials: 'YO',
    color: '#10B981',
    gradient: 'from-emerald-500 to-teal-500',
    cardBorder: 'border-emerald-200/70 hover:border-emerald-300',
    cardBg: 'bg-emerald-50/40 hover:bg-emerald-50/70',
    dotBg: 'bg-emerald-500',
    barColor: '#10B981',
  },
];

const WIRE_COLORS = [
  { gradientId: 'glex', fillColor: '#C084FC', dur: '2.4s' },
  { gradientId: 'gsusi', fillColor: '#60A5FA', dur: '2.0s' },
  { gradientId: 'gspy', fillColor: '#FCD34D', dur: '2.7s' },
  { gradientId: 'gyoru', fillColor: '#34D399', dur: '2.2s' },
];

interface OracleVoiceCardProps {
  onSelectAgent?: (agentId: string) => void;
  onSelectTab?: (tab: string) => void;
  onCommand?: (cmd: string, reply: string, sourceProvider?: string, modelName?: string) => void;
  activeConnection?: ProviderConnectionMetadata | null;
}

export default function OracleVoiceCard({
  onSelectAgent,
  onSelectTab,
  onCommand,
}: OracleVoiceCardProps = {}) {
  const { success, info, error: errorToast } = useToast();

  // Engine Mode: 'auto' | 'online' | 'offline'
  const [voiceMode, setVoiceMode] = useState<VoiceMode>('auto');
  const [voiceLang, setVoiceLang] = useState<'hi-IN' | 'en-IN'>('hi-IN');
  const [continuousMode, setContinuousMode] = useState<boolean>(true);
  const [sessionState, setSessionState] = useState<VoiceState>('idle');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [pendingPerm, setPendingPerm] = useState<PermissionRequest | null>(null);

  const engineRef = useRef<HybridVoiceEngine | null>(null);
  const stateRef = useRef<VoiceState>('idle');
  stateRef.current = sessionState;

  // Multi-turn memory maintained in background
  const historyRef = useRef<VoiceHistoryItem[]>([]);
  const latestTranscriptRef = useRef<string>('');

  // Dynamic wire positioning
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const receivingDotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const wireContainerRef = useRef<HTMLDivElement>(null);
  const [wireStartYs, setWireStartYs] = useState<number[]>([55, 115, 175, 235]);
  const [wireEndYs, setWireEndYs] = useState<number[]>([85, 120, 155, 190]);
  const animFrameRef = useRef<number>(0);

  const propsRef = useRef({ onCommand, onSelectTab, success, info, errorToast });
  useEffect(() => {
    propsRef.current = { onCommand, onSelectTab, success, info, errorToast };
  });

  // Listen to active permission changes
  useEffect(() => {
    return ApprovalService.onPermissionChange((req) => {
      setPendingPerm(req);
    });
  }, []);

  // Initialize Hybrid Voice Engine (mount only once)
  useEffect(() => {
    const engine = new HybridVoiceEngine();
    engine.setLanguage(voiceLang);
    engine.setContinuousMode(continuousMode);
    engineRef.current = engine;

    const unState = engine.onStateChange((st) => {
      setSessionState(st);
    });

    const unTrans = engine.onTranscript((text, isFinal) => {
      latestTranscriptRef.current = text;
      setLiveTranscript(text);
      if (isFinal && text.trim()) {
        historyRef.current = [
          ...historyRef.current.slice(-10),
          { role: 'user', content: text.trim() },
        ];
      }
    });

    const unResp = engine.onResponse((res: VoiceProcessResult) => {
      historyRef.current = [
        ...historyRef.current.slice(-10),
        { role: 'assistant', content: res.replyText },
      ];

      // Route full log to ConsoleCard
      propsRef.current.onCommand?.(
        latestTranscriptRef.current || 'Voice Command',
        res.replyText,
        res.sourceProvider,
        res.modelName
      );
      latestTranscriptRef.current = '';
      setLiveTranscript('');

      // Execute Action if task creation
      if (res.action?.type === 'CREATE_TASK' && res.action.payload) {
        createTask({
          title: (res.action.payload.title as string) || 'Autonomous Task',
          assignedAgent: (res.action.payload.agent as 'LEX' | 'SUSI' | 'SPY' | 'YORU') || res.assignedAgent || 'SUSI',
          priority: (res.action.payload.priority as 'Critical' | 'High' | 'Medium' | 'Low') || 'High',
          category: 'Operations',
        });
        propsRef.current.success('Task Created', `"${res.action.payload.title}" dispatched.`);
      } else if (res.action?.type === 'CREATE_FILE' && res.action.payload) {
        propsRef.current.success('File Created', `Created ${(res.action.payload.filename as string)} in workspace.`);
      } else if (res.action?.type === 'NAVIGATE_TAB' && res.action.payload?.tab) {
        const targetTab = res.action.payload.tab as string;
        propsRef.current.onSelectTab?.(targetTab);
        try {
          window.dispatchEvent(
            new CustomEvent('dashboard-navigate-tab', { detail: { tab: targetTab } })
          );
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('tab', targetTab);
          window.history.pushState({}, '', currentUrl.toString());
        } catch {}
        propsRef.current.info('Tab Switched', `Opened ${targetTab.toUpperCase()} tab.`);
      } else if (
        res.action?.type &&
        [
          'OPEN_APP',
          'CLOSE_APP',
          'VOLUME_CONTROL',
          'MEDIA_CONTROL',
          'WINDOW_CONTROL',
          'TAKE_SCREENSHOT',
          'POWER_CONTROL',
          'OPEN_SPECIAL_FOLDER',
          'CLIPBOARD_ACTION',
        ].includes(res.action.type)
      ) {
        const actionType = res.action.type;
        const payload = res.action.payload || {};
        fetch('/api/local/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType,
            payload,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.success) {
              propsRef.current.success('Action Executed', data.message || `${actionType} executed successfully.`);
            } else {
              propsRef.current.errorToast('Action Failed', data.error || `Could not execute ${actionType}`);
            }
          })
          .catch((err) => {
            propsRef.current.errorToast('Action Error', err.message);
          });
      }
    });

    const unErr = engine.onError((err) => {
      propsRef.current.errorToast('Voice Assistant Error', err);
    });

    const handleSyncModeEvent = (e: any) => {
      if (e.detail?.mode) {
        setVoiceMode(e.detail.mode);
        engine.setMode(e.detail.mode);
      }
    };
    window.addEventListener('dashboard-set-ai-mode', handleSyncModeEvent);

    return () => {
      unState();
      unTrans();
      unResp();
      unErr();
      window.removeEventListener('dashboard-set-ai-mode', handleSyncModeEvent);
      console.log('[VoiceCard] Component unmounting. Cleaning up VoiceEngine instance.');
      engine.cleanup();
    };
  }, []);

  // Sync language and continuous mode updates to the persistent engine
  useEffect(() => {
    engineRef.current?.setLanguage(voiceLang);
  }, [voiceLang]);

  useEffect(() => {
    engineRef.current?.setContinuousMode(continuousMode);
  }, [continuousMode]);

  // Handle Mode Change
  const handleToggleMode = () => {
    setVoiceMode((prev) => {
      const next: VoiceMode = prev === 'auto' ? 'offline' : prev === 'offline' ? 'online' : 'auto';
      engineRef.current?.setMode(next);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('dashboard-set-ai-mode', { detail: { mode: next } })
        );
      }
      const modeLabels: Record<VoiceMode, string> = {
        auto: 'Auto Hybrid (Cloud + Local Fallback)',
        online: 'Forced Online Cloud AI',
        offline: '100% Offline Local Engine',
      };
      info('Voice Mode Switched', modeLabels[next]);
      return next;
    });
  };

  // Handle Language Toggle
  const handleToggleLang = () => {
    setVoiceLang((prev) => {
      const next = prev === 'hi-IN' ? 'en-IN' : 'hi-IN';
      engineRef.current?.setLanguage(next);
      info('Recognition Language', `Language set to ${next === 'hi-IN' ? 'हिन्दी / Hinglish' : 'English'}.`);
      return next;
    });
  };

  // Handle Continuous Mode Toggle
  const handleToggleContinuous = () => {
    setContinuousMode((prev) => {
      const next = !prev;
      engineRef.current?.setContinuousMode(next);
      info('Hands-Free Mode', next ? 'Continuous Conversation ON' : 'Continuous Conversation OFF');
      return next;
    });
  };

  // Reset conversation history
  const handleResetChat = () => {
    engineRef.current?.stopSpeaking();
    historyRef.current = [];
    info('Conversation Cleared', 'Voice memory reset.');
  };

  // Wire positioning calculation
  const updateWirePositions = useCallback(() => {
    if (!wireContainerRef.current) return;
    const wireRect = wireContainerRef.current.getBoundingClientRect();
    const wireH = wireRect.height;
    if (wireH <= 0) return;

    const newStartYs = dotRefs.current.map((dot) => {
      if (!dot) return 140;
      const r = dot.getBoundingClientRect();
      return Math.round(((r.top + r.height / 2 - wireRect.top) / wireH) * SVG_H);
    });

    const newEndYs = receivingDotRefs.current.map((dot) => {
      if (!dot) return 140;
      const r = dot.getBoundingClientRect();
      return Math.round(((r.top + r.height / 2 - wireRect.top) / wireH) * SVG_H);
    });

    setWireStartYs(newStartYs);
    setWireEndYs(newEndYs);
  }, []);

  useEffect(() => {
    const timer = setTimeout(updateWirePositions, 150);
    window.addEventListener('resize', updateWirePositions);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateWirePositions);
    };
  }, [updateWirePositions]);

  // Mic Click Handler
  const handleMicClick = () => {
    if (sessionState === 'speaking') {
      engineRef.current?.stopSpeaking();
      return;
    }

    if (sessionState === 'listening') {
      engineRef.current?.stopListening();
      return;
    }

    engineRef.current?.startListening();
  };

  const stateLabel: Record<VoiceState, string> = {
    idle: 'Ready to Talk',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking (Tap to interrupt)',
    error: 'Ready (Offline)',
  };

  const stateBadge: Record<VoiceState, string> = {
    idle: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    listening: 'bg-rose-50 text-rose-600 border-rose-200 animate-pulse',
    thinking: 'bg-amber-50 text-amber-600 border-amber-200 animate-pulse',
    speaking: 'bg-purple-50 text-purple-700 border-purple-200 animate-pulse',
    error: 'bg-stone-50 text-stone-700 border-stone-200',
  };

  return (
    <div className="w-full bg-white border border-stone-100 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-4 flex flex-col min-h-[300px] justify-between overflow-hidden">
      <div className="flex flex-col md:flex-row w-full items-stretch gap-3 flex-1">
        {/* ══════════════════════════════════════════ */}
        {/* LEFT PANEL — AGENT STATUS                 */}
        {/* ══════════════════════════════════════════ */}
        <div className="flex flex-col w-full md:w-[36%] border-b md:border-b-0 md:border-r border-stone-100 pr-0 md:pr-3 pb-2.5 md:pb-0 justify-between">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 shrink-0">
            <div className="flex items-center gap-2">
              <div className="w-6.5 h-6.5 rounded-lg flex items-center justify-center bg-purple-100/80 border border-purple-200">
                <Users className="w-3.5 h-3.5 text-purple-600" />
              </div>
              <div>
                <p className="text-[11px] font-extrabold text-stone-800 uppercase tracking-wider leading-none">
                  AGENT WORKFORCE
                </p>
                <p className="text-[9px] font-semibold text-stone-400 mt-0.5 uppercase tracking-wider">
                  4 AGENTS &bull; <span className="text-emerald-600">ONLINE</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </div>
          </div>

          {/* Agent Cards */}
          <div className="flex flex-col gap-2 my-auto py-2 justify-between flex-1">
            {AGENTS_LIST.map((agent, index) => (
              <div
                key={agent.id}
                onClick={() => onSelectAgent?.(agent.id)}
                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-xl border ${agent.cardBorder} ${agent.cardBg} transition-all cursor-pointer group`}
              >
                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-full bg-gradient-to-br ${agent.gradient} text-white font-bold text-[10px] flex items-center justify-center shrink-0 shadow-2xs group-hover:scale-105 transition-transform`}
                >
                  {agent.initials}
                </div>

                {/* Name + Role */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-[11.5px] font-extrabold text-stone-800 leading-tight">
                      {agent.name}
                    </p>
                    <span className="text-[8.5px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/70">
                      Online
                    </span>
                  </div>
                  <p className="text-[9.5px] text-stone-400 font-medium truncate mt-0.5">
                    {agent.role}
                  </p>
                </div>

                {/* Output dot */}
                <div
                  ref={(el) => {
                    dotRefs.current[index] = el;
                  }}
                  className="relative flex items-center justify-center w-2.5 h-2.5 -mr-1"
                >
                  <span className={`w-2 h-2 rounded-full ${agent.dotBg} ring-2 ring-white`} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════════════════════════════════════ */}
        {/* CENTER — SYNAPSE WIRES                     */}
        {/* ══════════════════════════════════════════ */}
        <div
          ref={wireContainerRef}
          className="hidden md:flex items-center justify-center w-8 shrink-0 relative overflow-visible self-stretch"
        >
          <svg
            className="w-full h-full overflow-visible pointer-events-none"
            viewBox={`0 0 32 ${SVG_H}`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="glex" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8B5CF6" />
                <stop offset="100%" stopColor="#C084FC" />
              </linearGradient>
              <linearGradient id="gsusi" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#3B82F6" />
                <stop offset="100%" stopColor="#60A5FA" />
              </linearGradient>
              <linearGradient id="gspy" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#F59E0B" />
                <stop offset="100%" stopColor="#FCD34D" />
              </linearGradient>
              <linearGradient id="gyoru" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10B981" />
                <stop offset="100%" stopColor="#34D399" />
              </linearGradient>
            </defs>

            {wireStartYs.map((startY, i) => {
              const wc = WIRE_COLORS[i];
              const endY = wireEndYs[i] ?? WIRE_END_Y;
              const path = `M 0 ${startY} C 20 ${startY}, 12 ${endY}, 32 ${endY}`;
              return (
                <React.Fragment key={i}>
                  <path
                    d={path}
                    stroke={`url(#${wc.gradientId})`}
                    strokeWidth="2"
                    fill="none"
                    opacity="0.8"
                  />
                  <circle r="2.5" fill={wc.fillColor}>
                    <animateMotion path={path} dur={wc.dur} repeatCount="indefinite" />
                  </circle>
                </React.Fragment>
              );
            })}
          </svg>
        </div>

        {/* ══════════════════════════════════════════ */}
        {/* RIGHT PANEL — CLEAN CHATGPT VOICE ORB      */}
        {/* ══════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col justify-between min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between pb-2 border-b border-stone-100 shrink-0 gap-1.5 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6.5 h-6.5 rounded-lg flex items-center justify-center bg-amber-100/80 border border-amber-200 shrink-0">
                <Volume2 className="w-3.5 h-3.5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-extrabold text-stone-800 uppercase tracking-wider leading-none">
                  SUSI VOICE AI
                </p>
                <p className="text-[9px] font-semibold text-stone-400 mt-0.5 truncate">
                  {voiceMode === 'offline' ? (
                    <span className="text-amber-600 font-bold">⚡ Offline Local Engine</span>
                  ) : (
                    <span className="text-emerald-600 font-bold">🟢 Cloud AI Connected</span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              {/* Language Switch Button */}
              <button
                type="button"
                onClick={handleToggleLang}
                title="Switch speech recognition between Hindi and English"
                className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200/80 transition-colors cursor-pointer"
              >
                <span>{voiceLang === 'hi-IN' ? '🇮🇳 हिन्दी / Hinglish' : '🇬🇧 English'}</span>
              </button>

              {/* Continuous Hands-Free Mode Toggle */}
              <button
                type="button"
                onClick={handleToggleContinuous}
                title="Continuous Mode: Auto-re-listen when Assistant finishes speaking"
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border transition-colors cursor-pointer ${
                  continuousMode
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                    : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                }`}
              >
                <Sparkles className="w-2.5 h-2.5" />
                <span>Hands-free: {continuousMode ? 'ON' : 'OFF'}</span>
              </button>

              {/* Mode Toggle Button */}
              <button
                type="button"
                onClick={handleToggleMode}
                title="Click to toggle: Auto Hybrid ↔ 100% Offline ↔ Forced Online"
                className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9.5px] font-extrabold border transition-all cursor-pointer shadow-2xs ${
                  voiceMode === 'offline'
                    ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                    : 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                }`}
              >
                {voiceMode === 'offline' ? (
                  <>
                    <WifiOff className="w-3 h-3 text-amber-700" />
                    <span>OFFLINE</span>
                  </>
                ) : (
                  <>
                    <Wifi className="w-3 h-3 text-emerald-700" />
                    <span>ONLINE AI</span>
                  </>
                )}
              </button>

              {/* Reset Voice Memory */}
              <button
                type="button"
                onClick={handleResetChat}
                title="Reset Voice Memory"
                className="p-1 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 border border-transparent transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Body: Glowing Fluid Voice Orb + Equalizer */}
          <div className="flex items-center justify-between gap-3 my-auto py-3 px-4 bg-gradient-to-r from-stone-50/60 via-amber-50/30 to-purple-50/40 rounded-xl border border-stone-100">
            {/* Receiving nodes */}
            <div className="hidden md:flex flex-col gap-2.5 shrink-0">
              {[
                { bg: 'bg-purple-500' },
                { bg: 'bg-blue-500' },
                { bg: 'bg-amber-500' },
                { bg: 'bg-emerald-500' },
              ].map((dot, i) => (
                <div
                  key={i}
                  ref={(el) => {
                    receivingDotRefs.current[i] = el;
                  }}
                  className="relative flex items-center justify-center w-2 h-2"
                >
                  <span className={`w-2 h-2 rounded-full ${dot.bg} ring-2 ring-white`} />
                </div>
              ))}
            </div>

            {/* Glowing Fluid Orb */}
            <div className="flex flex-col items-center justify-center flex-1">
              <div className="relative flex items-center justify-center py-1">
                {/* Outer animated fluid aura */}
                <div
                  className={`absolute w-24 h-24 rounded-full transition-all duration-700 blur-xl opacity-50 ${
                    sessionState === 'listening'
                      ? 'bg-rose-400 animate-pulse'
                      : sessionState === 'thinking'
                        ? 'bg-amber-400 animate-pulse'
                        : sessionState === 'speaking'
                          ? 'bg-purple-400 animate-pulse'
                          : 'bg-indigo-300'
                  }`}
                />

                {/* Pulsing Ripple Rings */}
                {sessionState !== 'idle' && sessionState !== 'error' && (
                  <span
                    className={`absolute w-20 h-20 rounded-full animate-ping opacity-30 ${
                      sessionState === 'listening'
                        ? 'bg-rose-500'
                        : sessionState === 'thinking'
                          ? 'bg-amber-500'
                          : 'bg-purple-500'
                    }`}
                  />
                )}

                {/* Interactive Mic Button */}
                <button
                  type="button"
                  onClick={handleMicClick}
                  aria-label={sessionState === 'listening' ? 'Stop listening' : 'Start voice'}
                  className="relative rounded-full flex items-center justify-center transition-all duration-300 shadow-xl cursor-pointer hover:scale-105 active:scale-95"
                  style={{
                    width: 74,
                    height: 74,
                    background:
                      sessionState === 'listening'
                        ? 'linear-gradient(135deg, #F43F5E, #FB7185)'
                        : sessionState === 'thinking'
                          ? 'linear-gradient(135deg, #F59E0B, #FB923C)'
                          : sessionState === 'speaking'
                            ? 'linear-gradient(135deg, #8B5CF6, #6366F1)'
                            : 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
                    boxShadow:
                      sessionState === 'listening'
                        ? '0 8px 30px rgba(244, 63, 94, 0.5)'
                        : sessionState === 'thinking'
                          ? '0 8px 30px rgba(245, 158, 11, 0.5)'
                          : sessionState === 'speaking'
                            ? '0 8px 30px rgba(139, 92, 246, 0.5)'
                            : '0 8px 25px rgba(59, 130, 246, 0.35)',
                  }}
                >
                  {sessionState === 'listening' ? (
                    <MicOff className="w-7 h-7 text-white drop-shadow" />
                  ) : sessionState === 'speaking' ? (
                    <Square className="w-5 h-5 text-white drop-shadow fill-white" />
                  ) : (
                    <Mic className="w-7 h-7 text-white drop-shadow" />
                  )}
                </button>
              </div>

              {/* Status Indicator & Live Transcript Display */}
              <div className="mt-1.5 flex flex-col items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${stateBadge[sessionState]}`}>
                  {stateLabel[sessionState]}
                </span>
                {pendingPerm && pendingPerm.status === 'PENDING' && (
                  <div className="mt-1 flex flex-col items-center gap-0.5 px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-400 text-center animate-pulse">
                    <span className="text-[10px] font-bold text-amber-900">
                      ⚡ Awaiting Voice Approval
                    </span>
                    <span className="text-[9.5px] text-amber-800 font-medium">
                      Say "Haan / Allow" or "Nahi / Deny"
                    </span>
                  </div>
                )}
                {liveTranscript && (
                  <p className="mt-1 text-[11px] font-semibold text-stone-700 bg-white/90 border border-stone-200 px-3 py-1 rounded-lg max-w-[280px] truncate text-center shadow-2xs">
                    "{liveTranscript}"
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
