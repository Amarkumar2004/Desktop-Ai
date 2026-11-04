'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, BarChart3, CheckCircle2, Clock3, Layers, Users, Zap } from 'lucide-react';
import { getTasks } from '@/backend/services/taskService';
import { getAgents } from '@/backend/services/agentService';
import type { TaskItem, Agent } from '@/types/dashboard';

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
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'available' | 'unavailable'>('unavailable');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [taskRows, agentRows] = await Promise.all([getTasks(), getAgents()]);
        if (cancelled) return;
        setTasks(taskRows);
        setAgents(agentRows);
        setSource(taskRows.length || agentRows.length ? 'available' : 'unavailable');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load analytics data.');
          setSource('unavailable');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const refresh = () => void load();
    window.addEventListener('susi-tasks-updated', refresh);
    window.addEventListener('susi-agents-updated', refresh);
    return () => {
      cancelled = true;
      window.removeEventListener('susi-tasks-updated', refresh);
      window.removeEventListener('susi-agents-updated', refresh);
    };
  }, []);

  const completedTasks = useMemo(() => tasks.filter((task) => task.completed || task.progress >= 100).length, [tasks]);
  const activeTasks = Math.max(0, tasks.length - completedTasks);
  const completionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : null;
  const agentRows = useMemo(() => agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    role: agent.role,
    assigned: tasks.filter((task) => task.assignedAgent.toLowerCase() === agent.id.toLowerCase()).length,
    completed: tasks.filter((task) => task.assignedAgent.toLowerCase() === agent.id.toLowerCase() && (task.completed || task.progress >= 100)).length,
  })), [agents, tasks]);

  const value = (n: number | null) => n === null ? '—' : n.toLocaleString();

  return (
    <div className="w-full max-w-[1600px] mx-auto space-y-5 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white border border-stone-200/80 rounded-2xl p-5 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center"><BarChart3 className="w-5 h-5" /></div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-stone-900 tracking-tight">Workforce Analysis & Telemetry</h1>
            <p className="text-xs text-stone-500">Metrics calculated from persisted task and agent records. Unsupported metrics are not fabricated.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] rounded-lg border border-stone-200 px-2 py-1 text-stone-500">
            {loading ? 'Loading data…' : source === 'available' ? 'Records available' : 'No analytics data'}
          </span>
          {onNavigateToDashboard && <button onClick={onNavigateToDashboard} className="px-3 py-1.5 text-xs font-semibold text-stone-600 bg-stone-50 border border-stone-200 rounded-xl">Back to Dashboard</button>}
        </div>
      </div>

      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button onClick={onNavigateToTasks} className="text-left bg-white border border-stone-200 rounded-2xl p-4">
          <span className="text-xs text-stone-500 flex items-center gap-2"><Layers className="w-4 h-4" /> Total tasks</span>
          <strong className="block text-2xl mt-2">{loading ? '…' : value(tasks.length)}</strong>
          <span className="text-[11px] text-stone-400">Available task records</span>
        </button>
        <button onClick={onNavigateToTasks} className="text-left bg-white border border-stone-200 rounded-2xl p-4">
          <span className="text-xs text-stone-500 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Completed tasks</span>
          <strong className="block text-2xl mt-2">{loading ? '…' : value(completedTasks)}</strong>
          <span className="text-[11px] text-stone-400">{completionRate === null ? 'Insufficient data' : `${completionRate}% completion rate`}</span>
        </button>
        <button onClick={onNavigateToTasks} className="text-left bg-white border border-stone-200 rounded-2xl p-4">
          <span className="text-xs text-stone-500 flex items-center gap-2"><Activity className="w-4 h-4" /> Active tasks</span>
          <strong className="block text-2xl mt-2">{loading ? '…' : value(activeTasks)}</strong>
          <span className="text-[11px] text-stone-400">Not completed</span>
        </button>
        <button onClick={onNavigateToAgents} className="text-left bg-white border border-stone-200 rounded-2xl p-4">
          <span className="text-xs text-stone-500 flex items-center gap-2"><Users className="w-4 h-4" /> Registered agents</span>
          <strong className="block text-2xl mt-2">{loading ? '…' : value(agents.length)}</strong>
          <span className="text-[11px] text-stone-400">Returned by agent service</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Users className="w-4 h-4" /> Agent task summary</h2>
          {loading ? <p className="text-xs text-stone-400">Loading…</p> : agentRows.length ? (
            <div className="divide-y divide-stone-100">
              {agentRows.map((agent) => <div key={agent.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                <div><strong>{agent.name}</strong><p className="text-stone-400">{agent.role}</p></div>
                <div className="text-right"><strong>{agent.completed} / {agent.assigned}</strong><p className="text-stone-400">completed / assigned</p></div>
              </div>)}
            </div>
          ) : <p className="text-xs text-stone-500">No agent records are available from the configured data source.</p>}
        </section>

        <section className="bg-white border border-stone-200 rounded-2xl p-5 space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2"><Zap className="w-4 h-4" /> Provider utilization</h2>
          <p className="text-sm font-semibold text-stone-700">Unavailable</p>
          <p className="text-xs text-stone-500">The application does not currently expose a verified provider-usage ledger with token counts. Provider percentages and token totals are intentionally hidden until real usage events are recorded.</p>
          <div className="pt-2 border-t border-stone-100 flex items-center gap-2 text-[11px] text-stone-400"><Clock3 className="w-3.5 h-3.5" /> Execution duration and uptime analytics: Insufficient data</div>
        </section>
      </div>
    </div>
  );
}
