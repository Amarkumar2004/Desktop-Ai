'use client';

import React, { useState, useEffect } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Flame,
  HardDrive,
  Layers,
  MapPin,
  Plus,
  Radio,
  Search,
  Sparkles,
  Terminal,
  Users,
  Zap,
} from 'lucide-react';
import AgentAvatar from '@/components/common/AgentAvatar';
import { Agent, Task, AgentId } from '@/types/dashboard';
import { ROOMS_DATA } from '@/data/initialData';

interface WorkforceAgentsViewProps {
  agents: Agent[];
  tasks: Task[];
  onSelectAgent: (agent: Agent) => void;
  onDispatchTaskToAgent: (agentId: AgentId) => void;
  onBoostTask: (taskId: string) => void;
  onCompleteTask: (taskId: string) => void;
  onNavigateToTown: () => void;
}

// Sample activity templates per agent (not live execution telemetry)
const AGENT_SUB_ACTIVITIES: Record<
  AgentId,
  {
    stepTitle: string;
    stepIndex: number;
    totalSteps: number;
    steps: { text: string; done: boolean; inProgress?: boolean }[];
    liveLogs: { time: string; text: string; type: 'info' | 'success' | 'warn' | 'cmd' }[];
    hardware: { cpu: number; memory: string; temp: string; throughput: string };
  }
> = {
  lex: {
    stepTitle: 'Multi-Dimensional Cross-Cluster Vectorization',
    stepIndex: 3,
    totalSteps: 5,
    steps: [
      { text: 'Ingest 1,420 raw telemetry documents & PDFs', done: true },
      { text: 'Generate HNSW embeddings across 1536 dimensions', done: true },
      { text: 'Synthesize cross-vector intelligence matrix', done: false, inProgress: true },
      { text: 'Execute semantic clustering & anomaly validation', done: false },
      { text: 'Publish structured summary to Fleet Memory RAG', done: false },
    ],
    liveLogs: [
      { time: '11:58:12', text: '> query_rag_engine(namespace="q3_metrics", dim=1536)', type: 'cmd' },
      { time: '11:58:16', text: '> Batch 48/64 embedded with cosine similarity 0.941', type: 'info' },
      { time: '11:58:20', text: '> Cluster index node #12 rebalanced in 2.1ms', type: 'success' },
      { time: '11:58:24', text: '> Cross-verifying vector weights against baseline v2.1', type: 'info' },
    ],
    hardware: { cpu: 34, memory: '3.4 / 8.0 GB', temp: '19.2°C', throughput: '1.2 GB/s' },
  },
  susi: {
    stepTitle: 'High-Throughput Swarm Routing & Ingestion Pipeline',
    stepIndex: 4,
    totalSteps: 6,
    steps: [
      { text: 'Poll heartbeat from 4 autonomous cluster workers', done: true },
      { text: 'Balance load across 64 active compute shards', done: true },
      { text: 'Ingest multi-region Kafka event streams', done: true },
      { text: 'Synchronize global vector state across edge nodes', done: false, inProgress: true },
      { text: 'Compile executive swarm throughput metrics', done: false },
      { text: 'Deploy low-rank adaptation weights to fleet', done: false },
    ],
    liveLogs: [
      { time: '11:58:10', text: '> cluster_heartbeat::sync(regions=["us-east","eu-central","ap-south"])', type: 'cmd' },
      { time: '11:58:14', text: '> Ingestion rate steady at 1.84 GB/s with 0 dropped frames', type: 'info' },
      { time: '11:58:18', text: '> Swarm task queue rebalanced: 12 active / 4 idle nodes', type: 'success' },
      { time: '11:58:23', text: '> Edge sync verified: Latency delta 1.1ms [Nominal]', type: 'success' },
    ],
    hardware: { cpu: 58, memory: '6.8 / 16.0 GB', temp: '16.5°C', throughput: '2.4 GB/s' },
  },
  spy: {
    stepTitle: 'Zero-Trust Perimeter Intrusion Probe & Cryptographic Audit',
    stepIndex: 2,
    totalSteps: 4,
    steps: [
      { text: 'Scan ingress gateway ports [443, 8443, 9090]', done: true },
      { text: 'Audit TLS 1.3 cryptographic handshakes & certs', done: false, inProgress: true },
      { text: 'Simulate OWASP Top 10 automated penetration vectors', done: false },
      { text: 'Generate zero-trust boundary compliance report', done: false },
    ],
    liveLogs: [
      { time: '11:58:08', text: '> sentry_probe_v4::scan(boundary="ingress_edge_01")', type: 'cmd' },
      { time: '11:58:13', text: '> 0 open vulnerable ports detected. Perimeter secure.', type: 'success' },
      { time: '11:58:17', text: '> TLS Handshake verified: RSA-4096 / SHA-256 [100% Pass]', type: 'info' },
      { time: '11:58:22', text: '> Passive packet sniffer active on eth0 [1.4M pkts/s]', type: 'info' },
    ],
    hardware: { cpu: 22, memory: '2.9 / 8.0 GB', temp: '20.1°C', throughput: '850 MB/s' },
  },
  yoru: {
    stepTitle: 'Research Analysis & Insight Synthesis',
    stepIndex: 1,
    totalSteps: 4,
    steps: [
      { text: 'Review research inputs and source quality', done: true },
      { text: 'Analyze findings and identify patterns', done: false, inProgress: true },
      { text: 'Cross-check evidence and validate conclusions', done: false },
      { text: 'Publish structured analysis report', done: false },
    ],
    liveLogs: [
      { time: '11:58:05', text: '> analysis_pipeline::initialize(mode="evidence-review")', type: 'cmd' },
      { time: '11:58:09', text: '> Research inputs indexed for analysis', type: 'info' },
      { time: '11:58:15', text: '> Evidence validation stage ready', type: 'success' },
      { time: '11:58:21', text: '> Awaiting analysis tasks from the shared queue', type: 'info' },
    ],
    hardware: { cpu: 14, memory: '4.1 / 8.0 GB', temp: '21.0°C', throughput: '420 MB/s' },
  },
  euro: {
    stepTitle: 'Research Analysis & Insight Synthesis',
    stepIndex: 1,
    totalSteps: 4,
    steps: [
      { text: 'Review research inputs and source quality', done: true },
      { text: 'Analyze findings and identify patterns', done: false, inProgress: true },
      { text: 'Cross-check evidence and validate conclusions', done: false },
      { text: 'Publish structured analysis report', done: false },
    ],
    liveLogs: [
      { time: '11:58:05', text: '> analysis_pipeline::initialize(mode="evidence-review")', type: 'cmd' },
      { time: '11:58:09', text: '> Research inputs indexed for analysis', type: 'info' },
      { time: '11:58:15', text: '> Evidence validation stage ready', type: 'success' },
      { time: '11:58:21', text: '> Awaiting analysis tasks from the shared queue', type: 'info' },
    ],
    hardware: { cpu: 14, memory: '4.1 / 8.0 GB', temp: '21.0°C', throughput: '420 MB/s' },
  },
};

const AGENT_SKILLS: Record<AgentId, string[]> = {
  lex: ['Deep Neural Reasoning', 'HNSW Vector Search', 'Document RAG Ingestion', 'Semantic Clustering', 'Protocol Synthesis'],
  susi: ['Swarm Orchestration', 'Multi-Region Sharding', 'Kafka Event Pipelines', 'Task Load Balancing', 'Neural Fine-Tuning'],
  spy: ['Zero-Trust Defense', 'OWASP Penetration Guard', 'TLS 1.3 Cryptography', 'Anomaly Detection', 'Firewall Inspection'],
  euro: ['Data Analysis', 'Pattern Detection', 'Research Synthesis', 'Insight Reporting', 'Decision Support'],
  yoru: ['Data Analysis', 'Pattern Detection', 'Research Synthesis', 'Insight Reporting', 'Decision Support'],
};

export default function WorkforceAgentsView({
  agents,
  tasks,
  onSelectAgent,
  onDispatchTaskToAgent,
  onBoostTask,
  onCompleteTask,
  onNavigateToTown,
}: WorkforceAgentsViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Online' | 'Busy' | 'Idle'>('All');
  const [selectedStation, setSelectedStation] = useState<string>('All');
  const [activeTabPerAgent, setActiveTabPerAgent] = useState<Record<string, 'activity' | 'tasks' | 'logs' | 'specs'>>({
    lex: 'activity',
    susi: 'activity',
    spy: 'activity',
    euro: 'activity',
    yoru: 'activity',
  });

  const [realAgentLogs, setRealAgentLogs] = useState<Record<string, Array<{ time: string; text: string; from: string; to: string; type: string }>>>({});

  useEffect(() => {
    const handleMsg = (e: Event) => {
      const custom = e as CustomEvent<{
        runId: string;
        message: {
          from_agent?: string;
          fromAgent?: string;
          to_agent?: string;
          toAgent?: string;
          content: string;
          type?: string;
          created_at?: string;
        };
      }>;
      const msg = custom.detail?.message;
      if (!msg) return;
      const fromKey = String(msg.from_agent || msg.fromAgent || '').toLowerCase();
      const toKey = String(msg.to_agent || msg.toAgent || '').toLowerCase();
      const time = new Date(msg.created_at || Date.now()).toLocaleTimeString();
      const entry = {
        time,
        text: `[${msg.from_agent || msg.fromAgent} → ${msg.to_agent || msg.toAgent}] ${msg.content}`,
        from: String(msg.from_agent || msg.fromAgent || 'UNKNOWN'),
        to: String(msg.to_agent || msg.toAgent || 'ALL'),
        type: msg.type || 'info',
      };

      setRealAgentLogs((prev) => {
        const next = { ...prev };
        if (fromKey) {
          next[fromKey] = [entry, ...(next[fromKey] || []).slice(0, 19)];
        }
        if (toKey && toKey !== fromKey && toKey !== 'all') {
          next[toKey] = [entry, ...(next[toKey] || []).slice(0, 19)];
        }
        return next;
      });
    };

    window.addEventListener('susi-agent-message-added', handleMsg);
    return () => {
      window.removeEventListener('susi-agent-message-added', handleMsg);
    };
  }, []);

  // Filtered agents
  const filteredAgents = agents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.specialty.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.currentTask.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || agent.status === statusFilter;
    const matchesStation = selectedStation === 'All' || agent.room === selectedStation;

    return matchesSearch && matchesStatus && matchesStation;
  });

  const setAgentTab = (agentId: string, tab: 'activity' | 'tasks' | 'logs' | 'specs') => {
    setActiveTabPerAgent((prev) => ({ ...prev, [agentId]: tab }));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* 1. FLEET COMMAND MASTER HERO HEADER                                       */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-stone-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <Users className="w-5 h-5" />
              </div>
              <h1 className="text-xl lg:text-2xl font-black text-stone-900 tracking-tight">
                Autonomous Workforce Fleet
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300/80 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                4 Active Neural Swarm Nodes
              </span>
            </div>
            <p className="text-xs lg:text-sm text-stone-500 max-w-2xl">
              Real-time deep telemetry, active sub-task execution, neural memory allocation, and operational logs for all autonomous agents.
            </p>
          </div>

          {/* Quick Global Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={onNavigateToTown}
              className="px-3.5 py-2 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-xl flex items-center gap-2 transition-all shadow-2xs cursor-pointer active:scale-95"
            >
              <MapPin className="w-4 h-4 text-amber-500" />
              View Agent Town Map
            </button>
            <button
              onClick={() => onDispatchTaskToAgent('susi')}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl flex items-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Dispatch Fleet Task
            </button>
          </div>
        </div>

        {/* Fleet KPI Quick Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="p-3 rounded-xl bg-stone-50/80 border border-stone-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-stone-500">Collective Efficiency</div>
              <div className="text-base font-black text-stone-900 font-mono">98.2%</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50/80 border border-stone-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-stone-500">Active Workflows</div>
              <div className="text-base font-black text-stone-900 font-mono">
                {tasks.filter((t) => t.status === 'Active').length} In-Flight
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50/80 border border-stone-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-stone-500">Memory Shards</div>
              <div className="text-base font-black text-stone-900 font-mono">17.2 GB Active</div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50/80 border border-stone-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-stone-500">Consensus Health</div>
              <div className="text-base font-black text-emerald-700 font-mono">100% Nominal</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SEARCH & FILTER TOOLBAR                                                */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-stone-200/70 shadow-xs">
        {/* Search Bar */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search agents by name, specialty, current task, or station..."
            className="w-full pl-9 pr-3.5 py-2 rounded-xl text-xs bg-stone-50 border border-stone-200/80 focus:bg-white focus:outline-none focus:border-amber-400 text-stone-800 placeholder-stone-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-400 hover:text-stone-700"
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200/60 text-xs">
            {(['All', 'Online', 'Busy', 'Idle'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 font-bold rounded-lg transition-all ${
                  statusFilter === st
                    ? 'bg-white text-stone-900 shadow-2xs'
                    : 'text-stone-500 hover:text-stone-800'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Station dropdown */}
          <select
            value={selectedStation}
            onChange={(e) => setSelectedStation(e.target.value)}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-stone-50 border border-stone-200/80 text-stone-700 focus:outline-none focus:border-amber-400"
          >
            <option value="All">All Stations</option>
            <option value="research-lab">Research Lab (SEC-A1)</option>
            <option value="data-center">Data Center (SEC-B2)</option>
            <option value="strategy-room">Strategy Room (SEC-C3)</option>
            <option value="creative-studio">Creative Studio (SEC-D4)</option>
          </select>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. FULL AGENT CARDS GRID (Deep Detail & Sub-Activity Breakdown)            */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {filteredAgents.map((agent) => {
          const room = ROOMS_DATA[agent.room];
          const sub = AGENT_SUB_ACTIVITIES[agent.id] || {
            stepTitle: agent.currentTask,
            stepIndex: 1,
            totalSteps: 3,
            steps: [],
            liveLogs: [],
            hardware: { cpu: 20, memory: agent.memoryUsage, temp: '20°C', throughput: '1.0 GB/s' },
          };
          const skills = AGENT_SKILLS[agent.id] || [];
          const agentTasks = tasks.filter(
            (t) => String(t.assignedAgent).toLowerCase() === agent.id.toLowerCase()
          );
          const activeTab = activeTabPerAgent[agent.id] || 'activity';

          return (
            <div
              key={agent.id}
              className="bg-white rounded-2xl border border-stone-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden flex flex-col justify-between transition-all hover:border-amber-300 hover:shadow-md"
            >
              {/* Card Header: Agent Identity */}
              <div className="p-5 border-b border-stone-100 bg-gradient-to-r from-stone-50/80 via-white to-stone-50/30">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    {/* Large Avatar */}
                    <div className="relative cursor-pointer" onClick={() => onSelectAgent(agent)}>
                      <AgentAvatar id={agent.id} size="xl" showStatus status={agent.status} />
                      <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-md bg-stone-900 text-white font-mono text-[9px] font-bold border border-white">
                        LVL {agent.level}
                      </span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <h3
                          onClick={() => onSelectAgent(agent)}
                          className="text-lg font-black text-stone-900 hover:text-amber-600 transition-colors cursor-pointer"
                        >
                          {agent.name}
                        </h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-600 font-semibold border border-stone-200">
                          OP-{agent.id.toUpperCase()}-0{agent.level}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-stone-600 mt-0.5">{agent.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-[11px] font-medium text-stone-500">
                          Station: <b className="text-stone-800">{room?.name || 'Central Plaza'}</b>
                        </span>
                        <span className="text-stone-300">•</span>
                        <span className="text-[11px] font-mono text-stone-500">{room?.code || 'SEC-00'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Pill & Inspector Trigger */}
                  <div className="flex flex-col items-end gap-1.5">
                    <span
                      className={`text-xs font-bold px-2.5 py-1 rounded-full border flex items-center gap-1.5 ${
                        agent.status === 'Online'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : agent.status === 'Busy'
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          agent.status === 'Online'
                            ? 'bg-emerald-500 animate-pulse'
                            : agent.status === 'Busy'
                            ? 'bg-blue-500 animate-spin'
                            : 'bg-amber-500'
                        }`}
                      />
                      {agent.status}
                    </span>
                    <span className="text-[10px] font-mono text-stone-400">99.8% Uptime</span>
                  </div>
                </div>

                {/* Sub-navigation Tabs for this Agent */}
                <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-stone-100">
                  {[
                    { key: 'activity', label: '⚡ Live Activity (Kya kr rha h)', icon: Flame },
                    { key: 'tasks', label: `📋 Tasks (${agentTasks.length})`, icon: CheckCircle2 },
                    { key: 'logs', label: '💻 Action Logs', icon: Terminal },
                    { key: 'specs', label: '📊 Specs & Skills', icon: BarChart3 },
                  ].map((tab) => {
                    const isActive = activeTab === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setAgentTab(agent.id, tab.key as 'activity' | 'tasks' | 'logs' | 'specs')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                          isActive
                            ? 'bg-stone-900 text-white shadow-xs'
                            : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                        }`}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Card Body (Dynamic depending on selected sub-tab) */}
              <div className="p-5 flex-1 min-h-[260px] flex flex-col justify-between space-y-4">
                {/* ── TAB 1: LIVE ACTIVITY (KYA KAAM KAR RAHA HAI) ── */}
                {activeTab === 'activity' && (
                  <div className="space-y-3.5 animate-in fade-in duration-150">
                    {/* Primary Active Task Banner */}
                    <div className="p-3.5 rounded-xl bg-amber-50/50 border border-amber-200/80 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                          <Zap className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                          <span>CURRENT ACTIVE TASK</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono font-semibold bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded border border-stone-200">
                            BASELINE PROFILE
                          </span>
                          <span className="text-[10px] font-mono font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                            Step {sub.stepIndex} of {sub.totalSteps}
                          </span>
                        </div>
                      </div>

                      <div className="text-sm font-black text-stone-900 leading-snug">
                        {agent.currentTask}
                      </div>

                      <div className="text-xs text-stone-600 font-medium">
                        <span className="font-semibold text-stone-700">Sub-Goal:</span> {sub.stepTitle}
                      </div>

                      {/* Animated Progress Bar */}
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-stone-500">
                          <span>Execution Progress</span>
                          <span className="font-bold text-stone-800">{agent.efficiency}%</span>
                        </div>
                        <div className="w-full h-2 bg-amber-200/60 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all duration-700 animate-pulse"
                            style={{ width: `${agent.efficiency}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Step-by-Step Micro Pipeline */}
                    <div className="space-y-1.5 text-xs">
                      <div className="text-[11px] font-bold text-stone-700 uppercase tracking-wider">
                        Execution Pipeline Stages
                      </div>
                      <div className="space-y-1.5 bg-stone-50/80 p-2.5 rounded-xl border border-stone-100">
                        {sub.steps.map((st, sidx) => (
                          <div key={sidx} className="flex items-start gap-2 text-[11.5px]">
                            {st.done ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                            ) : st.inProgress ? (
                              <span className="w-3.5 h-3.5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin mt-0.5 shrink-0" />
                            ) : (
                              <span className="w-3.5 h-3.5 rounded-full border border-stone-300 mt-0.5 shrink-0" />
                            )}
                            <span
                              className={`${
                                st.done
                                  ? 'line-through text-stone-400'
                                  : st.inProgress
                                  ? 'font-bold text-stone-900 bg-amber-100/50 px-1 rounded'
                                  : 'text-stone-500'
                              }`}
                            >
                              {st.text}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── TAB 2: TASKS QUEUE FOR THIS AGENT ── */}
                {activeTab === 'tasks' && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                        Assigned Tasks Queue
                      </div>
                      <button
                        onClick={() => onDispatchTaskToAgent(agent.id)}
                        className="text-[10.5px] font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" /> Add Task
                      </button>
                    </div>

                    <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                      {agentTasks.length === 0 ? (
                        <div className="text-center py-8 text-stone-400 text-xs">
                          No tasks currently queued for {agent.name}.
                        </div>
                      ) : (
                        agentTasks.map((t) => {
                          const isDone = t.progress >= 100 || t.status === 'Completed';
                          return (
                            <div
                              key={t.id}
                              className={`p-2.5 rounded-xl border transition-all ${
                                isDone
                                  ? 'bg-emerald-50/40 border-emerald-200'
                                  : 'bg-stone-50/60 border-stone-200/80 hover:bg-white'
                              } space-y-1.5`}
                            >
                              <div className="flex items-center justify-between text-xs gap-2">
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <button
                                    onClick={() => onCompleteTask(t.id)}
                                    className={`w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0 ${
                                      isDone
                                        ? 'bg-emerald-500 text-white'
                                        : 'border border-stone-300 hover:border-emerald-500 text-transparent'
                                    }`}
                                  >
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <span
                                    className={`font-bold text-[12px] truncate ${
                                      isDone ? 'line-through text-stone-400' : 'text-stone-900'
                                    }`}
                                  >
                                    {t.title}
                                  </span>
                                </div>
                                <span
                                  className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                                    t.priority === 'Critical'
                                      ? 'bg-rose-100 text-rose-700'
                                      : t.priority === 'High'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-stone-100 text-stone-700'
                                  }`}
                                >
                                  {t.priority}
                                </span>
                              </div>

                              <p className="text-[11px] text-stone-500 line-clamp-1">{t.description}</p>

                              <div className="flex items-center justify-between gap-2 pt-1">
                                <div
                                  onClick={() => onBoostTask(t.id)}
                                  title="Click to boost progress +15%"
                                  className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden cursor-pointer"
                                >
                                  <div
                                    className={`h-full rounded-full transition-all ${
                                      isDone ? 'bg-emerald-500' : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${t.progress}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono font-bold text-stone-600">
                                  {t.progress}%
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                {/* ── TAB 3: LIVE TERMINAL EXECUTION LOGS ── */}
                {activeTab === 'logs' && (
                  <div className="space-y-2 animate-in fade-in duration-150">
                    {(() => {
                      const agentRealLogs = realAgentLogs[agent.id.toLowerCase()] || [];
                      const hasRealLogs = agentRealLogs.length > 0;
                      return (
                        <>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-stone-800 uppercase tracking-wider flex items-center gap-1.5">
                              <Terminal className="w-3.5 h-3.5 text-stone-600" />
                              {hasRealLogs ? 'Live Swarm Inter-Agent Stream' : 'Node Execution Stream'}
                            </span>
                            {hasRealLogs ? (
                              <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-300 animate-pulse">
                                REAL AGENT RUN ACTIVE
                              </span>
                            ) : (
                              <span className="text-[10px] font-mono text-stone-500 font-semibold bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                                BASELINE PROFILE LOGS
                              </span>
                            )}
                          </div>

                          <div className="bg-stone-900 text-stone-200 font-mono text-[11px] p-3 rounded-xl border border-stone-800 space-y-1.5 max-h-[220px] overflow-y-auto">
                            {!hasRealLogs && (
                              <div className="text-[10px] text-stone-400 bg-stone-800/80 px-2.5 py-1.5 rounded mb-2 border border-stone-700/50">
                                ℹ️ Displaying baseline profile sample logs. Real runtime messages stream here when this agent executes an autonomous task.
                              </div>
                            )}
                            {hasRealLogs ? (
                              agentRealLogs.map((log, lidx) => (
                                <div key={lidx} className="flex items-start gap-2 leading-relaxed">
                                  <span className="text-stone-500 select-none">[{log.time}]</span>
                                  <span className="text-amber-300 font-bold">{log.text}</span>
                                </div>
                              ))
                            ) : (
                              sub.liveLogs.map((log, lidx) => (
                                <div key={lidx} className="flex items-start gap-2 leading-relaxed">
                                  <span className="text-stone-500 select-none">[{log.time}]</span>
                                  <span
                                    className={
                                      log.type === 'cmd'
                                        ? 'text-amber-300 font-bold'
                                        : log.type === 'success'
                                        ? 'text-emerald-400'
                                        : log.type === 'warn'
                                        ? 'text-rose-400'
                                        : 'text-stone-300'
                                    }
                                  >
                                    {log.text}
                                  </span>
                                </div>
                              ))
                            )}
                            <div className="flex items-center gap-1 text-stone-500 pt-1">
                              <span className="w-1.5 h-3 bg-amber-400 animate-pulse" />
                              <span className="text-[10px]">Listening for incoming cluster instructions...</span>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}

                {/* ── TAB 4: SPECS & NEURAL CAPABILITIES ── */}
                {activeTab === 'specs' && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    <div className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                      Neural Domain & Specialized Capabilities
                    </div>

                    {/* Skill Pills */}
                    <div className="flex flex-wrap gap-1.5">
                      {skills.map((sk, skidx) => (
                        <span
                          key={skidx}
                          className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 text-xs font-semibold border border-stone-200 flex items-center gap-1"
                        >
                          <Sparkles className="w-3 h-3 text-amber-500" />
                          {sk}
                        </span>
                      ))}
                    </div>

                    {/* Hardware Telemetry Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                      <div className="p-2 rounded-lg bg-stone-50 border border-stone-200/60 text-center">
                        <div className="text-[10px] text-stone-500 font-medium">CPU Core Load</div>
                        <div className="text-xs font-bold text-stone-900 font-mono mt-0.5">
                          {sub.hardware.cpu}%
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-stone-50 border border-stone-200/60 text-center">
                        <div className="text-[10px] text-stone-500 font-medium">RAM Allocation</div>
                        <div className="text-xs font-bold text-stone-900 font-mono mt-0.5">
                          {sub.hardware.memory}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-stone-50 border border-stone-200/60 text-center">
                        <div className="text-[10px] text-stone-500 font-medium">Node Temp</div>
                        <div className="text-xs font-bold text-stone-900 font-mono mt-0.5">
                          {sub.hardware.temp}
                        </div>
                      </div>
                      <div className="p-2 rounded-lg bg-stone-50 border border-stone-200/60 text-center">
                        <div className="text-[10px] text-stone-500 font-medium">Throughput</div>
                        <div className="text-xs font-bold text-emerald-700 font-mono mt-0.5">
                          {sub.hardware.throughput}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer Action Strip */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-stone-100">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-stone-500">Efficiency:</span>
                    <span className="text-xs font-black text-emerald-700 font-mono">
                      {agent.efficiency}%
                    </span>
                    <span className="text-stone-300">•</span>
                    <span className="text-[11px] font-semibold text-stone-500">RAM:</span>
                    <span className="text-xs font-bold text-stone-800 font-mono">{agent.memoryUsage}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onDispatchTaskToAgent(agent.id)}
                      className="px-3 py-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-xl border border-amber-300/80 flex items-center gap-1 transition-all cursor-pointer active:scale-95 shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" /> Dispatch
                    </button>
                    <button
                      onClick={() => onSelectAgent(agent)}
                      className="px-3 py-1.5 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-xl border border-stone-200 flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                    >
                      Inspect <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* 4. WORKFORCE STATIONS & FACILITY OVERVIEW                                  */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-5 lg:p-6 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-stone-900">Workforce Stations & Specialized Rooms</h3>
              <p className="text-[11px] text-stone-500">
                Spatial rooms allocated for high-concurrency research, security, routing, and design
              </p>
            </div>
          </div>
          <button
            onClick={onNavigateToTown}
            className="text-xs font-bold text-amber-600 hover:text-amber-800 flex items-center gap-1"
          >
            Enter 2D Agent Town <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {Object.entries(ROOMS_DATA).map(([roomId, room]) => {
            const assignedAgent = agents.find((a) => a.id === room.assignedAgentId);
            return (
              <div
                key={roomId}
                className="p-3.5 rounded-xl border border-stone-200/80 bg-stone-50/50 hover:bg-white hover:border-amber-300 transition-all space-y-2.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-stone-200 text-stone-700">
                      {room.code}
                    </span>
                    <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Active
                    </span>
                  </div>
                  <div className="font-bold text-stone-900 text-xs mt-2">{room.name}</div>
                  <p className="text-[11px] text-stone-500 leading-snug mt-1 line-clamp-2">
                    {room.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-stone-200/60 space-y-1 text-[11px]">
                  <div className="flex items-center justify-between text-stone-600">
                    <span>Assigned Lead:</span>
                    <span className="font-bold text-stone-900">{assignedAgent?.name || 'Unassigned'}</span>
                  </div>
                  <div className="flex items-center justify-between text-stone-500 text-[10px]">
                    <span>Ambient Temp:</span>
                    <span className="font-mono font-semibold text-stone-700">{room.ambientTemp}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
