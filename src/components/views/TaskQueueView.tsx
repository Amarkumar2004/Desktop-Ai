'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  Clock,
  Database,
  FileSpreadsheet,
  Filter,
  Globe,
  LayoutGrid,
  List,
  Palette,
  Plus,
  Search,
  Shield,
  Trash2,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import AgentAvatar from '@/components/common/AgentAvatar';
import { Agent } from '@/types/dashboard';
import { INITIAL_AGENTS } from '@/data/initialData';

export interface ExtendedTaskItem {
  id: string;
  title: string;
  description?: string;
  assignedAgent: 'LEX' | 'SUSI' | 'SPY' | 'YORU' | 'lex' | 'susi' | 'spy' | 'yoru';
  progress: number;
  priority: 'Critical' | 'High' | 'Medium' | 'Low';
  category: string;
  status?: 'Active' | 'Scheduled' | 'Completed';
  createdAt?: string;
  eta?: string;
  completed?: boolean;
}

interface TaskQueueViewProps {
  tasks: ExtendedTaskItem[];
  agents?: Agent[];
  onCompleteTask: (taskId: string) => void;
  onBoostTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onReassignTask?: (taskId: string, newAgent: 'LEX' | 'SUSI' | 'SPY' | 'YORU') => void;
  onOpenCreateTask: () => void;
  onNavigateToAgents: () => void;
}

export default function TaskQueueView({
  tasks,
  agents = INITIAL_AGENTS,
  onCompleteTask,
  onBoostTask,
  onDeleteTask,
  onReassignTask,
  onOpenCreateTask,
  onNavigateToAgents,
}: TaskQueueViewProps) {
  const [viewMode, setViewMode] = useState<'board' | 'list' | 'agent-matrix'>('board');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Active' | 'Scheduled' | 'Completed'>('All');
  const [priorityFilter, setPriorityFilter] = useState<string>('All');
  const [agentFilter, setAgentFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  // Compute status helpers
  const getTaskStatus = (t: ExtendedTaskItem): 'Completed' | 'Active' | 'Scheduled' => {
    if (t.progress >= 100 || t.completed || t.status === 'Completed') return 'Completed';
    if (t.progress === 0 || t.status === 'Scheduled') return 'Scheduled';
    return 'Active';
  };

  // Filter tasks
  const filteredTasks = tasks.filter((task) => {
    const status = getTaskStatus(task);
    const matchesSearch =
      task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (task.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(task.assignedAgent).toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === 'All' || status === statusFilter;
    const matchesPriority = priorityFilter === 'All' || task.priority === priorityFilter;
    const matchesAgent =
      agentFilter === 'All' ||
      String(task.assignedAgent).toUpperCase() === agentFilter.toUpperCase();
    const matchesCategory = categoryFilter === 'All' || task.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesPriority && matchesAgent && matchesCategory;
  });

  // Calculate Fleet KPIs
  const totalTasks = tasks.length;
  const activeTasks = tasks.filter((t) => getTaskStatus(t) === 'Active').length;
  const completedTasks = tasks.filter((t) => getTaskStatus(t) === 'Completed').length;
  const criticalTasks = tasks.filter((t) => t.priority === 'Critical' && getTaskStatus(t) !== 'Completed').length;
  const avgProgress = Math.round(
    tasks.reduce((acc, t) => acc + (t.completed ? 100 : t.progress), 0) / (totalTasks || 1)
  );

  const getAgentColorStyles = (agentName: string) => {
    const key = agentName.toLowerCase();
    switch (key) {
      case 'lex':
        return { bg: 'bg-purple-50 text-purple-800 border-purple-200', dot: 'bg-purple-500' };
      case 'susi':
        return { bg: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500' };
      case 'spy':
        return { bg: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' };
      case 'yoru':
        return { bg: 'bg-emerald-50 text-emerald-800 border-emerald-200', dot: 'bg-emerald-500' };
      default:
        return { bg: 'bg-stone-50 text-stone-800 border-stone-200', dot: 'bg-stone-500' };
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'analytics':
      case 'research':
        return <FileSpreadsheet className="w-3.5 h-3.5 text-purple-600" />;
      case 'security':
      case 'stress test':
        return <Shield className="w-3.5 h-3.5 text-amber-600" />;
      case 'design':
        return <Palette className="w-3.5 h-3.5 text-emerald-600" />;
      case 'intelligence':
      case 'operations':
        return <Globe className="w-3.5 h-3.5 text-blue-600" />;
      case 'infrastructure':
      case 'database':
        return <Database className="w-3.5 h-3.5 text-stone-600" />;
      default:
        return <Zap className="w-3.5 h-3.5 text-amber-500" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* ========================================================================= */}
      {/* 1. MASTER HERO & TASK QUEUE TELEMETRY BANNER                              */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-stone-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-stone-100">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <CheckSquare className="w-5 h-5" />
              </div>
              <h1 className="text-xl lg:text-2xl font-black text-stone-900 tracking-tight">
                Fleet Task Queue & Operations
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300/80 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                {activeTasks} Active Workflows
              </span>
            </div>
            <p className="text-xs lg:text-sm text-stone-500 max-w-2xl">
              High-concurrency task scheduling, autonomous agent load balancing, progress boost accelerators, and execution status tracking.
            </p>
          </div>

          {/* Global Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={onNavigateToAgents}
              className="px-3.5 py-2 text-xs font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-xl flex items-center gap-2 transition-all shadow-2xs cursor-pointer active:scale-95"
            >
              <Users className="w-4 h-4 text-amber-500" />
              Workforce Agents Screen
            </button>
            <button
              onClick={onOpenCreateTask}
              className="px-4 py-2 text-xs font-bold text-white bg-amber-500 hover:bg-amber-600 rounded-xl flex items-center gap-2 transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Create New Task
            </button>
          </div>
        </div>

        {/* Fleet KPI Metric Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4">
          <div className="p-3 rounded-xl bg-stone-50/80 border border-stone-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-stone-500">In-Flight Tasks</div>
              <div className="text-base font-black text-stone-900 font-mono">
                {activeTasks} / {totalTasks} Active
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50/80 border border-stone-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-xs">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-stone-500">Critical Priority</div>
              <div className="text-base font-black text-rose-700 font-mono">
                {criticalTasks} Pending
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50/80 border border-stone-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-stone-500">Completed Workflows</div>
              <div className="text-base font-black text-emerald-700 font-mono">
                {completedTasks} Done
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-stone-50/80 border border-stone-100 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-stone-500">Fleet Avg Completion</div>
              <div className="text-base font-black text-purple-700 font-mono">{avgProgress}%</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. CONTROLS, VIEW TOGGLES & ADVANCED SEARCH BAR                            */}
      {/* ========================================================================= */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-stone-200/70 shadow-xs">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks by title, description, category, or agent..."
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

        {/* Filters and View Switcher */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status Filter Pills */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200/60 text-xs">
            {(['All', 'Active', 'Scheduled', 'Completed'] as const).map((st) => (
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

          {/* Agent Filter Dropdown */}
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-stone-50 border border-stone-200/80 text-stone-700 focus:outline-none focus:border-amber-400"
          >
            <option value="All">All Agents</option>
            <option value="LEX">LEX (Research)</option>
            <option value="SUSI">SUSI (Orchestrator)</option>
            <option value="SPY">SPY (Security)</option>
            <option value="YORU">YORU (Creative)</option>
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-stone-50 border border-stone-200/80 text-stone-700 focus:outline-none focus:border-amber-400"
          >
            <option value="All">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* View Mode Toggle: Kanban Board vs List vs Agent Matrix */}
          <div className="flex items-center bg-stone-100 p-0.5 rounded-xl border border-stone-200/60 text-xs">
            <button
              onClick={() => setViewMode('board')}
              title="Kanban Board View"
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'board'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              title="Detailed List View"
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('agent-matrix')}
              title="Agent Allocation Matrix"
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'agent-matrix'
                  ? 'bg-white text-stone-900 shadow-2xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Users className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. VIEW MODE 1: KANBAN BOARD VIEW (3 COLUMNS: SCHEDULED, ACTIVE, DONE)    */}
      {/* ========================================================================= */}
      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
          {/* COLUMN 1: SCHEDULED & QUEUED */}
          <div className="bg-stone-100/70 rounded-2xl p-4 border border-stone-200/70 flex flex-col gap-3 min-h-[480px]">
            <div className="flex items-center justify-between pb-2 border-b border-stone-200">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-stone-400" />
                <h3 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                  Scheduled / Queued
                </h3>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white text-stone-600 border border-stone-200">
                {filteredTasks.filter((t) => getTaskStatus(t) === 'Scheduled').length}
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-1">
              {filteredTasks
                .filter((t) => getTaskStatus(t) === 'Scheduled')
                .map((task) => (
                  <TaskCardItem
                    key={task.id}
                    task={task}
                    onCompleteTask={onCompleteTask}
                    onBoostTask={onBoostTask}
                    onDeleteTask={onDeleteTask}
                    onReassignTask={onReassignTask}
                    getAgentColorStyles={getAgentColorStyles}
                    getCategoryIcon={getCategoryIcon}
                  />
                ))}
            </div>

            <button
              onClick={onOpenCreateTask}
              className="w-full py-2 text-xs font-bold text-stone-600 hover:text-stone-900 bg-white hover:bg-stone-50 border border-dashed border-stone-300 rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add to Queue
            </button>
          </div>

          {/* COLUMN 2: ACTIVE & IN-FLIGHT */}
          <div className="bg-amber-50/40 rounded-2xl p-4 border border-amber-200/70 flex flex-col gap-3 min-h-[480px]">
            <div className="flex items-center justify-between pb-2 border-b border-amber-200/60">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
                <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                  In Progress (Active)
                </h3>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300/80">
                {filteredTasks.filter((t) => getTaskStatus(t) === 'Active').length}
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-1">
              {filteredTasks
                .filter((t) => getTaskStatus(t) === 'Active')
                .map((task) => (
                  <TaskCardItem
                    key={task.id}
                    task={task}
                    onCompleteTask={onCompleteTask}
                    onBoostTask={onBoostTask}
                    onDeleteTask={onDeleteTask}
                    onReassignTask={onReassignTask}
                    getAgentColorStyles={getAgentColorStyles}
                    getCategoryIcon={getCategoryIcon}
                  />
                ))}
            </div>
          </div>

          {/* COLUMN 3: COMPLETED */}
          <div className="bg-emerald-50/30 rounded-2xl p-4 border border-emerald-200/70 flex flex-col gap-3 min-h-[480px]">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-200/60">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h3 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">
                  Completed & Verified
                </h3>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300/80">
                {filteredTasks.filter((t) => getTaskStatus(t) === 'Completed').length}
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto max-h-[600px] pr-1">
              {filteredTasks
                .filter((t) => getTaskStatus(t) === 'Completed')
                .map((task) => (
                  <TaskCardItem
                    key={task.id}
                    task={task}
                    onCompleteTask={onCompleteTask}
                    onBoostTask={onBoostTask}
                    onDeleteTask={onDeleteTask}
                    onReassignTask={onReassignTask}
                    getAgentColorStyles={getAgentColorStyles}
                    getCategoryIcon={getCategoryIcon}
                  />
                ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. VIEW MODE 2: DETAILED LIST & TABLE VIEW                                 */}
      {/* ========================================================================= */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-2xl border border-stone-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.03)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-bold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Status & Title</th>
                  <th className="py-3 px-3">Assigned Agent</th>
                  <th className="py-3 px-3">Priority</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-4">Progress & Acceleration</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-stone-400 font-medium">
                      No tasks match current search or filters.
                    </td>
                  </tr>
                ) : (
                  filteredTasks.map((task) => {
                    const isDone = task.progress >= 100 || task.completed;
                    const agentName = String(task.assignedAgent).toUpperCase();
                    const agentStyles = getAgentColorStyles(agentName);
                    return (
                      <tr
                        key={task.id}
                        className={`hover:bg-amber-50/30 transition-colors ${
                          isDone ? 'bg-emerald-50/20' : ''
                        }`}
                      >
                        {/* Title & Checkbox */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => onCompleteTask(task.id)}
                              className={`w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0 ${
                                isDone
                                  ? 'bg-emerald-500 text-white'
                                  : 'border border-stone-300 hover:border-emerald-500 text-transparent'
                              }`}
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <div className="min-w-0">
                              <div
                                className={`font-bold text-xs ${
                                  isDone ? 'line-through text-stone-400' : 'text-stone-900'
                                }`}
                              >
                                {task.title}
                              </div>
                              {task.description && (
                                <p className="text-[11px] text-stone-500 truncate max-w-md">
                                  {task.description}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Assigned Agent */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <AgentAvatar id={agentName.toLowerCase() as any} size="xs" />
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${agentStyles.bg}`}
                            >
                              {agentName}
                            </span>
                          </div>
                        </td>

                        {/* Priority */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              task.priority === 'Critical'
                                ? 'bg-rose-100 text-rose-700'
                                : task.priority === 'High'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-stone-100 text-stone-700'
                            }`}
                          >
                            {task.priority}
                          </span>
                        </td>

                        {/* Category */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className="flex items-center gap-1 text-[11px] text-stone-600 font-medium">
                            {getCategoryIcon(task.category)}
                            {task.category}
                          </span>
                        </td>

                        {/* Progress Bar & Boost */}
                        <td className="py-3 px-4 min-w-[180px]">
                          <div className="flex items-center gap-2.5">
                            <div
                              onClick={() => onBoostTask(task.id)}
                              title="Click to boost progress +15%"
                              className="flex-1 h-2 bg-stone-200 rounded-full overflow-hidden cursor-pointer"
                            >
                              <div
                                className={`h-full transition-all duration-500 rounded-full ${
                                  isDone ? 'bg-emerald-500' : 'bg-amber-500'
                                }`}
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                            <span className="text-[10.5px] font-mono font-bold text-stone-700 w-9 text-right">
                              {task.progress}%
                            </span>
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => onBoostTask(task.id)}
                              title="Boost Progress +15%"
                              className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-[10px] font-bold border border-amber-200 transition-colors"
                            >
                              +15%
                            </button>
                            <button
                              onClick={() => onDeleteTask(task.id)}
                              title="Delete Task"
                              className="p-1 text-stone-400 hover:text-rose-600 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. VIEW MODE 3: AGENT ALLOCATION MATRIX                                    */}
      {/* ========================================================================= */}
      {viewMode === 'agent-matrix' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {agents.map((agent) => {
            const agentName = agent.name.toUpperCase();
            const agentTasks = tasks.filter(
              (t) => String(t.assignedAgent).toUpperCase() === agentName
            );
            const inFlightCount = agentTasks.filter((t) => getTaskStatus(t) === 'Active').length;
            const completedCount = agentTasks.filter((t) => getTaskStatus(t) === 'Completed').length;

            return (
              <div
                key={agent.id}
                className="bg-white rounded-2xl border border-stone-200/80 shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-5 space-y-4 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                  <div className="flex items-center gap-3">
                    <AgentAvatar id={agent.id} size="md" showStatus status={agent.status} />
                    <div>
                      <div className="font-bold text-stone-900 text-sm">{agent.name}</div>
                      <div className="text-xs text-stone-500 font-medium">{agent.role}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                      {inFlightCount} In Flight
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                      {completedCount} Done
                    </span>
                  </div>
                </div>

                {/* Agent Task List */}
                <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1 flex-1">
                  {agentTasks.length === 0 ? (
                    <div className="text-center py-6 text-stone-400 text-xs font-medium">
                      No tasks assigned to {agent.name}.
                    </div>
                  ) : (
                    agentTasks.map((t) => (
                      <TaskCardItem
                        key={t.id}
                        task={t}
                        onCompleteTask={onCompleteTask}
                        onBoostTask={onBoostTask}
                        onDeleteTask={onDeleteTask}
                        onReassignTask={onReassignTask}
                        getAgentColorStyles={getAgentColorStyles}
                        getCategoryIcon={getCategoryIcon}
                      />
                    ))
                  )}
                </div>

                <div className="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
                  <span>Efficiency: <b className="text-stone-800">{agent.efficiency}%</b></span>
                  <span>Memory: <b className="text-stone-800">{agent.memoryUsage}</b></span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE INDIVIDUAL TASK CARD ITEM COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
function TaskCardItem({
  task,
  onCompleteTask,
  onBoostTask,
  onDeleteTask,
  onReassignTask,
  getAgentColorStyles,
  getCategoryIcon,
}: {
  task: ExtendedTaskItem;
  onCompleteTask: (id: string) => void;
  onBoostTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onReassignTask?: (id: string, newAgent: 'LEX' | 'SUSI' | 'SPY' | 'YORU') => void;
  getAgentColorStyles: (agent: string) => { bg: string; dot: string };
  getCategoryIcon: (category: string) => React.ReactNode;
}) {
  const isDone = task.progress >= 100 || task.completed;
  const agentName = String(task.assignedAgent).toUpperCase();
  const agentStyles = getAgentColorStyles(agentName);

  return (
    <div
      className={`p-3.5 rounded-xl border transition-all bg-white shadow-xs ${
        isDone
          ? 'border-emerald-200 bg-emerald-50/30'
          : 'border-stone-200/80 hover:border-amber-300 hover:shadow-md'
      } space-y-2.5 group`}
    >
      {/* Header: Checkbox, Title, Priority */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <button
            onClick={() => onCompleteTask(task.id)}
            title={isDone ? 'Mark Incomplete' : 'Mark as Complete'}
            className={`w-4 h-4 mt-0.5 rounded flex items-center justify-center transition-colors shrink-0 ${
              isDone
                ? 'bg-emerald-500 text-white'
                : 'border border-stone-300 hover:border-emerald-500 text-transparent'
            }`}
          >
            <Check className="w-3 h-3" />
          </button>
          <div className="min-w-0">
            <h4
              className={`font-bold text-xs leading-snug ${
                isDone ? 'line-through text-stone-400' : 'text-stone-900'
              }`}
            >
              {task.title}
            </h4>
            {task.description && (
              <p className="text-[11px] text-stone-500 line-clamp-2 mt-0.5 leading-relaxed">
                {task.description}
              </p>
            )}
          </div>
        </div>

        {/* Priority Badge */}
        <span
          className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
            task.priority === 'Critical'
              ? 'bg-rose-100 text-rose-700 border border-rose-200'
              : task.priority === 'High'
              ? 'bg-amber-100 text-amber-800 border border-amber-200'
              : 'bg-stone-100 text-stone-700 border border-stone-200'
          }`}
        >
          {task.priority}
        </span>
      </div>

      {/* Progress Bar & Actions */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center justify-between text-[10px] font-mono text-stone-500">
          <span>Progress</span>
          <span className="font-bold text-stone-800">{task.progress}%</span>
        </div>
        <div
          onClick={() => onBoostTask(task.id)}
          title="Click to boost progress +15%"
          className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden cursor-pointer"
        >
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              isDone ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
            style={{ width: `${task.progress}%` }}
          />
        </div>
      </div>

      {/* Footer Strip: Agent Pill, Category, Boost & Delete */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100 text-xs">
        <div className="flex items-center gap-1.5">
          <AgentAvatar id={agentName.toLowerCase() as any} size="xs" />
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${agentStyles.bg}`}>
            {agentName}
          </span>
          <span className="text-stone-300">•</span>
          <span className="text-[10.5px] text-stone-500 font-medium truncate max-w-[100px]">
            {task.category}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onBoostTask(task.id)}
            title="Boost progress +15%"
            className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 transition-colors"
          >
            +15%
          </button>
          <button
            onClick={() => onDeleteTask(task.id)}
            title="Delete Task"
            className="p-1 text-stone-400 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
