'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Trash2, CornerDownLeft, CheckCircle2, Mic, Bot, Sparkles, AlertTriangle } from 'lucide-react';
import { ApprovalService } from '@/lib/security/approvalService';
import { PermissionRequest } from '@/lib/security/types';

interface ConsoleCardProps {
  logs: string[];
  onClear: () => void;
  onRunCommand: (cmd: string) => void;
}

export default function ConsoleCard({ logs, onClear, onRunCommand }: ConsoleCardProps) {
  const [inputVal, setInputVal] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [pendingPerm, setPendingPerm] = useState<PermissionRequest | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return ApprovalService.onPermissionChange((req) => {
      setPendingPerm(req);
    });
  }, []);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim()) return;

    const cmd = inputVal.trim();
    const cmdLower = cmd.toLowerCase();

    // Check if user is approving/denying active permission via chat
    if (pendingPerm && pendingPerm.status === 'PENDING') {
      if (['allow', 'yes', 'haan', 'ha', 'approve', 'ok'].includes(cmdLower)) {
        ApprovalService.approveByChat(pendingPerm.id);
        setInputVal('');
        return;
      } else if (['deny', 'no', 'nahi', 'na', 'reject', 'cancel'].includes(cmdLower)) {
        ApprovalService.denyByChat(pendingPerm.id);
        setInputVal('');
        return;
      }
    }

    setHistory((prev) => [...prev, cmd]);
    setHistoryIdx(-1);
    onRunCommand(cmd);
    setInputVal('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(nextIdx);
        setInputVal(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx !== -1) {
        const nextIdx = historyIdx + 1;
        if (nextIdx < history.length) {
          setHistoryIdx(nextIdx);
          setInputVal(history[nextIdx]);
        } else {
          setHistoryIdx(-1);
          setInputVal('');
        }
      }
    }
  };

  // Quick Command Chips
  const quickCommands = ['status', 'agents', 'tasks', 'ping'];

  const renderLogLine = (log: string, index: number) => {
    const isVoiceUser = log.includes('[VOICE: USER]') || log.includes('[VOICE: YOU]');
    const isVoiceAssistant = log.includes('[VOICE: SUSI]') || log.includes('[VOICE: AI]');
    const isUserCmd = log.startsWith('>') || log.includes('[COMMAND]');
    const isTaskUpdate = log.includes('[TASK]') || log.includes('task.');
    const isAgent = log.includes('[AGENT]');
    const isError = log.includes('[ERROR]') || log.includes('failed') || log.includes('not recognized');
    const isResult = log.includes('[RESULT]');

    // 1. Voice User Input
    if (isVoiceUser) {
      const cleanText = log.replace(/\[\d{2}:\d{2}:\d{2}\]\s*\[VOICE:\s*(?:USER|YOU)\]/i, '').trim();
      return (
        <div
          key={index}
          className="flex items-start gap-1.5 py-1 px-2 my-1 rounded-lg bg-amber-500/10 border border-amber-500/20 text-stone-900 text-[11px]"
        >
          <span className="flex items-center gap-1 font-bold text-amber-700 shrink-0 select-none text-[10px]">
            <Mic className="w-3 h-3 text-amber-600" /> YOU:
          </span>
          <span className="font-medium break-all leading-snug">{cleanText || log}</span>
        </div>
      );
    }

    // 2. Voice Assistant Output
    if (isVoiceAssistant) {
      const cleanText = log.replace(/\[\d{2}:\d{2}:\d{2}\]\s*\[VOICE:\s*(?:SUSI|AI)[^\]]*\]/i, '').trim();
      return (
        <div
          key={index}
          className="flex items-start gap-1.5 py-1 px-2 my-1 rounded-lg bg-blue-50/80 border border-blue-200/80 text-blue-950 text-[11px]"
        >
          <span className="flex items-center gap-1 font-bold text-blue-700 shrink-0 select-none text-[10px]">
            <Bot className="w-3 h-3 text-blue-600" /> SUSI:
          </span>
          <span className="font-normal break-all leading-relaxed">{cleanText || log}</span>
        </div>
      );
    }

    // 3. Terminal User Commands
    if (isUserCmd) {
      return (
        <div key={index} className="flex items-start gap-1 py-0.5 group">
          <span className="text-amber-500 font-bold select-none text-[10px] mt-0.5">&gt;</span>
          <span className="font-semibold text-stone-900 break-all leading-snug">
            {log.startsWith('>') ? log.slice(1).trim() : log}
          </span>
        </div>
      );
    }

    // 4. Task updates
    if (isTaskUpdate) {
      return (
        <div
          key={index}
          className="flex items-start gap-1.5 py-0.5 px-1.5 my-0.5 rounded-md bg-emerald-50/60 border border-emerald-100 text-emerald-800 text-[10.5px]"
        >
          <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
          <span className="font-mono leading-snug break-all">{log}</span>
        </div>
      );
    }

    // 5. Agent status updates
    if (isAgent) {
      return (
        <div
          key={index}
          className="flex items-start gap-1.5 py-0.5 px-1.5 my-0.5 rounded-md bg-purple-50/60 border border-purple-100 text-purple-800 text-[10.5px]"
        >
          <span className="font-mono leading-snug break-all">{log}</span>
        </div>
      );
    }

    // 6. Errors
    if (isError) {
      return (
        <div key={index} className="text-rose-600 pl-2 leading-relaxed break-all font-mono text-[10.5px]">
          {log}
        </div>
      );
    }

    // 7. Standard logs
    return (
      <div key={index} className={`pl-2 leading-relaxed break-all whitespace-pre-wrap ${isResult ? 'text-stone-700 font-medium' : 'text-stone-500'}`}>
        {log}
      </div>
    );
  };

  return (
    <div className="bg-white border border-stone-100 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-4 flex flex-col min-h-[340px] justify-between">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-stone-100">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-md bg-amber-50 flex items-center justify-center border border-amber-200/60">
            <Terminal className="w-3.5 h-3.5 text-amber-600" />
          </div>
          <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
            Live System & Voice Console
          </h2>
          <span className="flex items-center gap-1 text-[9.5px] font-mono font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded-full border border-emerald-200/60">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE LOGS
          </span>
        </div>

        <button
          type="button"
          onClick={onClear}
          title="Clear Console Buffer"
          className="text-[10px] font-medium text-stone-400 hover:text-stone-700 hover:bg-stone-100/80 flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
        >
          <Trash2 className="w-3 h-3" /> Clear
        </button>
      </div>

      {/* Terminal Screen Body */}
      <div className="relative my-2 flex-1 flex flex-col justify-between">
        <div
          ref={scrollContainerRef}
          className="flex-1 p-2.5 bg-stone-50/90 border border-stone-100/90 rounded-xl overflow-y-auto font-mono text-[11px] leading-relaxed max-h-[190px] space-y-1 shadow-inner select-text"
        >
          {logs.map((log, index) => renderLogLine(log, index))}
        </div>

        {/* Quick Command Chips */}
        <div className="flex items-center gap-1 pt-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[9.5px] font-mono text-stone-400 shrink-0 select-none">Quick:</span>
          {quickCommands.map((qc) => (
            <button
              key={qc}
              type="button"
              onClick={() => onRunCommand(qc)}
              className="text-[9.5px] font-mono font-medium px-2 py-0.5 rounded-md bg-stone-100 hover:bg-amber-100 hover:text-amber-900 border border-stone-200/60 text-stone-600 transition-colors shrink-0 cursor-pointer"
            >
              {qc}
            </button>
          ))}
        </div>
      </div>

      {/* Interactive Chat Action Approval Card */}
      {pendingPerm && pendingPerm.status === 'PENDING' && (
        <div className="my-2 p-2.5 rounded-xl border border-amber-500/40 bg-amber-50/90 shadow-sm flex flex-col gap-1.5 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-bold text-[11px] text-amber-900">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
              <span>Permission Request: {pendingPerm.actionType.replace(/_/g, ' ')}</span>
            </div>
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border ${
                pendingPerm.riskLevel === 'HIGH'
                  ? 'bg-red-500/10 text-red-700 border-red-300'
                  : 'bg-amber-500/10 text-amber-800 border-amber-300'
              }`}
            >
              {pendingPerm.riskLevel} RISK
            </span>
          </div>
          <div className="text-[10.5px] font-mono text-stone-800 bg-white p-1.5 rounded border border-stone-200 break-all select-all">
            {pendingPerm.target}
          </div>
          {pendingPerm.metadata?.fileSize && (
            <div className="text-[10px] text-stone-600">
              Size: <span className="font-semibold text-stone-800">{String(pendingPerm.metadata.fileSize)}</span>
            </div>
          )}
          <div className="text-[10px] text-stone-600 italic">
            Reason: {pendingPerm.reason}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => ApprovalService.denyByChat(pendingPerm.id)}
              className="flex-1 py-1 px-2 rounded-lg bg-stone-200 hover:bg-red-100 hover:text-red-700 font-semibold text-[10.5px] text-stone-700 border border-stone-300 transition-colors cursor-pointer"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={() => ApprovalService.approveByChat(pendingPerm.id)}
              className="flex-1 py-1 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 font-bold text-[10.5px] text-white shadow-sm transition-colors cursor-pointer"
            >
              Allow
            </button>
          </div>
        </div>
      )}

      {/* Interactive Command Input Form */}
      <form onSubmit={handleSubmit} className="relative flex items-center pt-1">
        <div className="flex items-center w-full bg-stone-50 hover:bg-stone-100/60 focus-within:bg-white border border-stone-200/80 focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100 rounded-xl px-2.5 py-1.5 transition-all">
          <span className="font-mono text-xs font-bold text-amber-500 mr-1.5 select-none">&gt;</span>
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type console command or speak..."
            className="w-full bg-transparent font-mono text-[11px] text-stone-800 focus:outline-none placeholder:text-stone-400"
          />
          <button
            type="submit"
            title="Execute Command (Enter)"
            className="ml-1 text-stone-400 hover:text-amber-600 p-0.5 rounded transition-colors cursor-pointer"
          >
            <CornerDownLeft className="w-3.5 h-3.5" />
          </button>
        </div>
      </form>
    </div>
  );
}
