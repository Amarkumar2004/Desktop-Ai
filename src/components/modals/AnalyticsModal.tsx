'use client';

import React from 'react';
import { X, Activity, Cpu, HardDrive, Server, Zap, Layers, Thermometer } from 'lucide-react';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: {
    cpu: number;
    memory: number;
    gpu?: number;
    vram?: number;
    gpuTemp?: number;
    uptime: string;
    ramDetails?: { used: number; total: number } | null;
    vramDetails?: { used: number; total: number } | null;
  };
}

export default function AnalyticsModal({ isOpen, onClose, metrics }: AnalyticsModalProps) {
  if (!isOpen) return null;

  const gpuVal = metrics.gpu ?? 0;
  const vramVal = metrics.vram ?? 0;
  const tempVal = metrics.gpuTemp ?? 0;

  return (
    <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-xl rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100/80 border border-amber-200/80 flex items-center justify-center text-amber-800">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Fleet Analytics & Hardware Telemetry</h3>
              <p className="text-[11px] text-stone-500">Real-time CPU, RAM, GPU & VRAM compute status</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Top KPIs Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
          <div className="p-2.5 bg-stone-50 border border-stone-200/70 rounded-xl text-center">
            <span className="text-[9.5px] text-stone-400 font-medium block">CPU Load</span>
            <span className="text-base font-bold text-stone-900">{metrics.cpu}%</span>
            <span className="text-[8.5px] text-emerald-600 block mt-0.5">Optimal</span>
          </div>
          <div className="p-2.5 bg-stone-50 border border-stone-200/70 rounded-xl text-center">
            <span className="text-[9.5px] text-stone-400 font-medium block">RAM Pool</span>
            <span className="text-base font-bold text-stone-900">{metrics.memory}%</span>
            <span className="text-[8.5px] text-amber-600 block mt-0.5">
              {metrics.ramDetails ? `${metrics.ramDetails.used}G / ${metrics.ramDetails.total}G` : 'Dynamic'}
            </span>
          </div>
          <div className="p-2.5 bg-purple-50/50 border border-purple-200/60 rounded-xl text-center">
            <span className="text-[9.5px] text-purple-600 font-medium block">GPU Load</span>
            <span className="text-base font-bold text-purple-900">{gpuVal}%</span>
            <span className="text-[8.5px] text-purple-600 block mt-0.5">Active</span>
          </div>
          <div className="p-2.5 bg-indigo-50/50 border border-indigo-200/60 rounded-xl text-center">
            <span className="text-[9.5px] text-indigo-600 font-medium block">VRAM</span>
            <span className="text-base font-bold text-indigo-900">{vramVal}%</span>
            <span className="text-[8.5px] text-indigo-600 block mt-0.5">
              {metrics.vramDetails ? `${metrics.vramDetails.used}G / ${metrics.vramDetails.total}G` : 'Allocated'}
            </span>
          </div>
          <div className="p-2.5 bg-rose-50/50 border border-rose-200/60 rounded-xl text-center col-span-3 sm:col-span-1">
            <span className="text-[9.5px] text-rose-600 font-medium block">GPU Temp</span>
            <span className="text-base font-bold text-rose-900">{tempVal}°C</span>
            <span className="text-[8.5px] text-rose-600 block mt-0.5">Normal</span>
          </div>
        </div>

        {/* Micro Telemetry Bars */}
        <div className="space-y-2.5 p-3.5 bg-stone-50/60 rounded-xl border border-stone-200/60 text-xs">
          <div className="flex items-center justify-between text-stone-700 font-semibold">
            <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-stone-400" /> Neural Inference Engine (CPU)</span>
            <span className="text-emerald-600 font-mono">{metrics.cpu}% Load</span>
          </div>
          <div className="w-full h-2 bg-stone-200/70 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(5, metrics.cpu))}%` }} />
          </div>

          <div className="flex items-center justify-between text-stone-700 font-semibold pt-1">
            <span className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-purple-500" /> GPU Acceleration Core</span>
            <span className="text-purple-600 font-mono">{gpuVal}% Utilized</span>
          </div>
          <div className="w-full h-2 bg-purple-100 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(5, gpuVal))}%` }} />
          </div>

          <div className="flex items-center justify-between text-stone-700 font-semibold pt-1">
            <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5 text-indigo-500" /> VRAM Memory Shards</span>
            <span className="text-indigo-600 font-mono">{vramVal}% Reserved</span>
          </div>
          <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(5, vramVal))}%` }} />
          </div>

          <div className="flex items-center justify-between text-stone-700 font-semibold pt-1">
            <span className="flex items-center gap-1.5"><Thermometer className="w-3.5 h-3.5 text-rose-500" /> Thermal Junction Temperature</span>
            <span className="text-rose-600 font-mono">{tempVal}°C</span>
          </div>
          <div className="w-full h-2 bg-rose-100 rounded-full overflow-hidden">
            <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (tempVal / 100) * 100)}%` }} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-stone-100">
          <span className="text-[11px] text-stone-400 font-mono">Uptime: {metrics.uptime}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

