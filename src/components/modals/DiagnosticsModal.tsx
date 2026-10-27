'use client';

import React, { useState } from 'react';
import { X, ShieldCheck, CheckCircle2, Server, Wifi, RefreshCw } from 'lucide-react';

interface DiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DiagnosticsModal({ isOpen, onClose }: DiagnosticsModalProps) {
  const [runningTest, setRunningTest] = useState(false);
  const [testComplete, setTestComplete] = useState(true);

  if (!isOpen) return null;

  const handleRunDiagnostics = () => {
    setRunningTest(true);
    setTestComplete(false);
    setTimeout(() => {
      setRunningTest(false);
      setTestComplete(true);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-100/80 border border-emerald-200/80 flex items-center justify-center text-emerald-800">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Fleet Health & Network</h3>
              <p className="text-[11px] text-stone-500">Zero-trust handshake & cluster status</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Diagnostics Results */}
        <div className="space-y-2.5 text-xs">
          <div className="p-3 bg-emerald-50/60 border border-emerald-200/80 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <div>
                <div className="font-bold text-stone-800">Swarm Health: 100% Operational</div>
                <div className="text-[10px] text-stone-500">4/4 Agents Connected • All nodes in sync</div>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              OPTIMAL
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 bg-stone-50 border border-stone-200/60 rounded-xl space-y-1">
              <span className="text-[10px] text-stone-400 font-medium flex items-center gap-1">
                <Wifi className="w-3 h-3 text-emerald-500" /> Mesh Latency
              </span>
              <span className="font-bold text-stone-800 text-sm">1.42 ms</span>
            </div>
            <div className="p-2.5 bg-stone-50 border border-stone-200/60 rounded-xl space-y-1">
              <span className="text-[10px] text-stone-400 font-medium flex items-center gap-1">
                <Server className="w-3 h-3 text-blue-500" /> Edge Nodes
              </span>
              <span className="font-bold text-stone-800 text-sm">6 Global Hubs</span>
            </div>
          </div>

          {/* Test Action */}
          <div className="pt-2">
            <button
              onClick={handleRunDiagnostics}
              disabled={runningTest}
              className="w-full py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${runningTest ? 'animate-spin text-amber-600' : ''}`} />
              {runningTest ? 'Auditing Network Nodes...' : 'Run Diagnostics Probe'}
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-2 border-t border-stone-100">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-medium rounded-xl transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
