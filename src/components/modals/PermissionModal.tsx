'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Check,
  X,
  Trash2,
  Terminal,
  FileCode,
  Clock,
  HardDrive,
  Copy,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { PermissionRequest } from '@/lib/security/types';
import { ApprovalService } from '@/lib/security/approvalService';
import { permissionManager } from '@/lib/security/permissionManager';

export default function PermissionModal() {
  const [activeRequest, setActiveRequest] = useState<PermissionRequest | null>(null);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(45);
  const [copied, setCopied] = useState<boolean>(false);

  // Subscribe to active permission changes
  useEffect(() => {
    const unsub = ApprovalService.onPermissionChange((req) => {
      setActiveRequest(req);
      if (req) {
        const remaining = Math.max(0, Math.ceil((req.expiresAt - Date.now()) / 1000));
        setTimeLeftSec(remaining);
      }
    });
    return unsub;
  }, []);

  // Countdown timer effect
  useEffect(() => {
    if (!activeRequest) return;

    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((activeRequest.expiresAt - Date.now()) / 1000));
      setTimeLeftSec(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [activeRequest]);

  // Keyboard shortcuts: Y/Enter to Allow, N/Esc to Deny
  useEffect(() => {
    if (!activeRequest) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        handleAllow();
      } else if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        handleDeny();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRequest]);

  const handleAllow = useCallback(() => {
    if (!activeRequest) return;
    ApprovalService.approveByGui(activeRequest.id);
  }, [activeRequest]);

  const handleDeny = useCallback(() => {
    if (!activeRequest) return;
    ApprovalService.denyByGui(activeRequest.id);
  }, [activeRequest]);

  const handleCopyPath = () => {
    if (!activeRequest?.target) return;
    navigator.clipboard.writeText(activeRequest.target);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!activeRequest || activeRequest.status !== 'PENDING') {
    return null;
  }

  const isHighRisk = activeRequest.riskLevel === 'HIGH';
  const isMediumRisk = activeRequest.riskLevel === 'MEDIUM';

  const riskBadgeColor = isHighRisk
    ? 'bg-red-500/20 text-red-400 border-red-500/40 shadow-red-500/10'
    : isMediumRisk
    ? 'bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-amber-500/10'
    : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-emerald-500/10';

  const glowBorder = isHighRisk
    ? 'border-red-500/50 shadow-[0_0_50px_rgba(239,68,68,0.25)]'
    : 'border-amber-500/50 shadow-[0_0_50px_rgba(245,158,11,0.2)]';

  const progressPercent = Math.min(100, Math.max(0, (timeLeftSec / 45) * 100));

  // Determine icon
  const ActionIcon = activeRequest.actionType.includes('DELETE')
    ? Trash2
    : activeRequest.actionType.includes('TERMINAL') || activeRequest.actionType.includes('COMMAND')
    ? Terminal
    : activeRequest.actionType.includes('FILE')
    ? FileCode
    : AlertTriangle;

  return (
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-xl rounded-2xl bg-[#0f1117] border ${glowBorder} p-6 sm:p-7 shadow-2xl overflow-hidden flex flex-col gap-5 text-gray-200`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="perm-title"
      >
        {/* Top Glow Accent Bar */}
        <div
          className={`absolute top-0 left-0 right-0 h-1.5 transition-all duration-300 ${
            isHighRisk ? 'bg-gradient-to-r from-red-600 via-rose-500 to-red-600' : 'bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600'
          }`}
          style={{ width: `${progressPercent}%` }}
        />

        {/* Header Row */}
        <div className="flex items-start justify-between gap-4 mt-1">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-xl border ${
                isHighRisk ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}
            >
              <ActionIcon className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-gray-400">
                  Security Gate • Action Authorization
                </span>
              </div>
              <h2 id="perm-title" className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                {activeRequest.actionType.replace(/_/g, ' ')}
              </h2>
            </div>
          </div>

          {/* Risk Level Badge */}
          <div className="flex flex-col items-end gap-1.5">
            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider border shadow-sm ${riskBadgeColor}`}>
              {activeRequest.riskLevel} RISK
            </span>
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Auto-denies in {timeLeftSec}s</span>
            </div>
          </div>
        </div>

        {/* Voice Announcement Banner (Hindi & English Sync) */}
        {activeRequest.voicePromptHi && (
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs">
            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
            <div className="flex-1">
              <span className="font-semibold text-purple-200">Voice Prompt:</span> "{activeRequest.voicePromptHi}"
            </div>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300">
              Voice Active
            </span>
          </div>
        )}

        {/* Detailed Inspection Cards */}
        <div className="flex flex-col gap-3 rounded-xl bg-black/40 border border-gray-800/80 p-4 text-xs font-sans">
          {/* Target Path / Command */}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex items-center justify-between">
              <span>Target Resource / Path</span>
              <button
                type="button"
                onClick={handleCopyPath}
                className="hover:text-amber-400 flex items-center gap-1 transition-colors text-[10px]"
                title="Copy Path"
              >
                {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
            <div className="bg-[#14161f] p-2.5 rounded-lg border border-gray-800 font-mono text-[11px] text-amber-300 break-all select-all">
              {activeRequest.target}
            </div>
          </div>

          {/* File Size & Details if Deletion */}
          {activeRequest.metadata?.fileSize && (
            <div className="flex items-center justify-between py-1 border-b border-gray-800/60">
              <span className="text-gray-400 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-gray-500" />
                File Size:
              </span>
              <span className="font-mono font-bold text-gray-200">
                {String(activeRequest.metadata.fileSize)}
              </span>
            </div>
          )}

          {/* Component Affected */}
          <div className="flex items-center justify-between py-1 border-b border-gray-800/60">
            <span className="text-gray-400">Affected Component:</span>
            <span className="font-medium text-gray-200">{activeRequest.component}</span>
          </div>

          {/* Reason */}
          <div className="flex items-start justify-between py-1 border-b border-gray-800/60 gap-4">
            <span className="text-gray-400 shrink-0">Reason:</span>
            <span className="text-right text-gray-300">{activeRequest.reason}</span>
          </div>

          {/* Reversibility */}
          <div className="flex items-center justify-between py-1 border-b border-gray-800/60">
            <span className="text-gray-400">Reversible:</span>
            <span
              className={`font-semibold flex items-center gap-1 ${
                activeRequest.isReversible ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {activeRequest.isReversible ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Yes (Recycle Bin / Backup)
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  No (Permanent Change)
                </>
              )}
            </span>
          </div>

          {/* Expected Consequences Warning Box */}
          <div
            className={`p-3 rounded-lg border flex items-start gap-2.5 mt-1 ${
              isHighRisk ? 'bg-red-500/10 border-red-500/20 text-red-300' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <span className="font-bold">Expected Consequences: </span>
              <span>{activeRequest.consequences}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons: ALLOW & DENY */}
        <div className="flex items-center gap-3 pt-1">
          <button
            type="button"
            onClick={handleDeny}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gray-800/90 hover:bg-red-950/80 hover:border-red-500/50 border border-gray-700 text-gray-300 hover:text-red-300 font-semibold text-sm transition-all shadow-md active:scale-[0.98]"
          >
            <X className="w-4 h-4 text-red-400" />
            <span>DENY (Esc / N)</span>
          </button>

          <button
            type="button"
            onClick={handleAllow}
            className={`flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-[0.98] ${
              isHighRisk
                ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-600/30'
                : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>ALLOW (Enter / Y)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
