'use client';

import React from 'react';
import {
  BarChart3,
  CheckCircle2,
  Users,
  Clock,
  Zap,
  TrendingUp,
  Cpu,
  ShieldCheck,
  ArrowUpRight,
  Activity,
  Layers,
} from 'lucide-react';

interface AnalysisViewProps {
  onNavigateToDashboard?: () => void;
  onNavigateToTasks?: () => void;
  onNavigateToAgents?: () => void;
}

export default function AnalysisView({
  onNavigateToDashboard,
  onNavigateToTasks,
  onNavigateToAgents,
}: AnalysisViewProps) {
  // Mock Analytics Metrics
  const metrics = {
    totalTasks: 142,
    completedTasks: 128,
    completionRate: 90.1,
    activeAgents: 4,
    totalAgents: 4,
    avgCompletionTime: '1.8s',
    uptime: '99.98%',
    totalTokens: '1.24M',
    providerUsage: [
      { name: 'Google Gemini', usage: 62, count: '88 tasks', color: 'bg-amber-500' },
      { name: 'Groq (Llama 3.3)', usage: 24, count: '34 tasks', color: 'bg-orange-500' },
      { name: 'OpenAI (GPT-4o)', usage: 10, count: '14 tasks', color: 'bg-emerald-500' },
      { name: 'Local / Self-hosted', usage: 4, count: '6 tasks', color: 'bg-stone-400' },
    ],
    agentPerformance: [
      { name: 'LEX', role: 'Architect & Lead', completed: 46, avgSpeed: '1.4s', efficiency: '98%' },
      { name: 'SUSI', role: 'Core Orchestrator', completed: 38, avgSpeed: '1.2s', efficiency: '99%' },
      { name: 'SPY', role: 'Security & QA', completed: 28, avgSpeed: '2.1s', efficiency: '96%' },
      { name: 'YORU', role: 'Autonomous Scout', completed: 16, avgSpeed: '2.6s', efficiency: '94%' },
    ],
  };

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-5 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">
                Workforce Analysis & Telemetry
              </h1>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Sync
              </span>
            </div>
            <p className="text-xs text-stone-500">
              Real-time performance metrics, task throughput, and AI model utilization.
            </p>
          </div>
        </div>

        {onNavigateToDashboard && (
          <button
            onClick={onNavigateToDashboard}
            className="self-start sm:self-center px-3 py-1.5 text-xs font-semibold text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl transition-colors"
          >
            ← Back to Dashboard
          </button>
        )}
      </div>

      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Tasks */}
        <div
          onClick={onNavigateToTasks}
          className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs hover:border-amber-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-stone-500 text-xs mb-2">
            <span className="font-medium flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-500" /> Total Tasks
            </span>
            <ArrowUpRight className="w-3.5 h-3.5 text-stone-300 group-hover:text-amber-600 transition-colors" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-stone-900">{metrics.totalTasks}</span>
            <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              +14 today
            </span>
          </div>
          <p className="text-[10.5px] text-stone-400 mt-1">Total tasks queued & executed</p>
        </div>

        {/* Completed Tasks */}
        <div
          onClick={onNavigateToTasks}
          className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs hover:border-amber-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-stone-500 text-xs mb-2">
            <span className="font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Completed Tasks
            </span>
            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
              {metrics.completionRate}%
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-stone-900">{metrics.completedTasks}</span>
            <span className="text-[11px] text-stone-400">of {metrics.totalTasks} tasks</span>
          </div>
          <div className="w-full h-1.5 bg-stone-100 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full"
              style={{ width: `${metrics.completionRate}%` }}
            />
          </div>
        </div>

        {/* Active Agents */}
        <div
          onClick={onNavigateToAgents}
          className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs hover:border-amber-200 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between text-stone-500 text-xs mb-2">
            <span className="font-medium flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-600" /> Active Agents
            </span>
            <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
              100% Online
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-stone-900">
              {metrics.activeAgents} / {metrics.totalAgents}
            </span>
            <span className="text-[11px] text-stone-400">Fleet synced</span>
          </div>
          <p className="text-[10.5px] text-stone-400 mt-1">Autonomous worker swarm</p>
        </div>

        {/* Avg Completion Time */}
        <div className="bg-white border border-stone-200/80 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-center justify-between text-stone-500 text-xs mb-2">
            <span className="font-medium flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-600" /> Avg Execution Time
            </span>
            <span className="text-[11px] font-bold text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded">
              Latency
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-stone-900">
              {metrics.avgCompletionTime}
            </span>
            <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-0.5">
              <TrendingUp className="w-3 h-3" /> -0.3s
            </span>
          </div>
          <p className="text-[10.5px] text-stone-400 mt-1">Average task turnaround</p>
        </div>
      </div>

      {/* Grid: Provider Usage Breakdown & Agent Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Provider Usage Card (5 cols) */}
        <div className="lg:col-span-5 bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                AI Provider Utilization
              </h2>
            </div>
            <span className="text-[11px] font-mono text-stone-400">{metrics.totalTokens} Tokens</span>
          </div>

          {/* Combined Progress Bar */}
          <div className="w-full h-3 bg-stone-100 rounded-full flex overflow-hidden p-0.5 gap-0.5">
            {metrics.providerUsage.map((p, i) => (
              <div
                key={i}
                className={`h-full ${p.color} rounded-full transition-all`}
                style={{ width: `${p.usage}%` }}
                title={`${p.name}: ${p.usage}%`}
              />
            ))}
          </div>

          {/* Provider List Breakdown */}
          <div className="space-y-3 pt-1">
            {metrics.providerUsage.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${p.color}`} />
                  <span className="font-semibold text-stone-800">{p.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[11px] text-stone-400">{p.count}</span>
                  <span className="font-mono font-bold text-stone-900 w-10 text-right">
                    {p.usage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Performance Matrix Card (7 cols) */}
        <div className="lg:col-span-7 bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-stone-100">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                Agent Efficiency & Throughput
              </h2>
            </div>
            <span className="text-[11px] text-stone-400">All 4 nodes optimal</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="text-[10.5px] uppercase font-bold text-stone-400 border-b border-stone-100 pb-2">
                  <th className="pb-2">Agent</th>
                  <th className="pb-2">Role</th>
                  <th className="pb-2 text-center">Tasks Done</th>
                  <th className="pb-2 text-center">Avg Speed</th>
                  <th className="pb-2 text-right">Efficiency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {metrics.agentPerformance.map((ag, i) => (
                  <tr key={i} className="hover:bg-stone-50/60 transition-colors">
                    <td className="py-2.5 font-bold font-mono text-stone-900">{ag.name}</td>
                    <td className="py-2.5 text-stone-500">{ag.role}</td>
                    <td className="py-2.5 text-center font-semibold text-stone-800">{ag.completed}</td>
                    <td className="py-2.5 text-center font-mono text-stone-600">{ag.avgSpeed}</td>
                    <td className="py-2.5 text-right font-bold text-emerald-600">{ag.efficiency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
