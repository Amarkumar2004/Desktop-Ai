'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/lib/toast/ToastContext';
import {
  getStoredTasks,
  getTasks,
  updateTask as apiUpdateTask,
  deleteTask as apiDeleteTask,
  toggleTaskCompleted as apiToggleTask,
  saveStoredTasks,
} from '@/backend/services/taskService';
import {
  getStoredNotifications,
  markAsRead as apiMarkAsRead,
  clearAllNotifications as apiClearAll,
} from '@/backend/services/notificationService';
import { getStoredAgents } from '@/backend/services/agentService';
import { fetchWithDesktopAuth } from '@/lib/security/desktopAuthClient';

// Dynamically import AgentTownEmbed with SSR disabled

const AgentTownEmbed = dynamic(() => import('@/components/AgentTownEmbed'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[420px] bg-[#1a1814] rounded-xl flex items-center justify-center text-amber-400 font-mono text-xs">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
        Loading Agent Town Pixel Engine...
      </div>
    </div>
  ),
});

import VoiceCard from '@/components/cards/VoiceCard';
import GlobalOverviewCard from '@/components/cards/GlobalOverviewCard';
import { useNewsMonitoring } from '@/lib/hooks/useNewsMonitoring';
import { useNewsUserPrefs } from '@/lib/hooks/useNewsUserPrefs';
import { formatTimeAgo } from '@/lib/countryDetection';
import ConsoleCard from '@/components/cards/ConsoleCard';
import WorkforceAgentsView from '@/components/views/WorkforceAgentsView';
import TaskQueueView from '@/components/views/TaskQueueView';
import AnalysisView from '@/components/views/AnalysisView';
import SettingsView from '@/components/views/SettingsView';
import CodeAssistantView from '@/components/views/CodeAssistantView';
import AllAgentsModal from '@/components/modals/AllAgentsModal';
import AgentDetailsModal from '@/components/modals/AgentDetailsModal';
import NotificationsModal from '@/components/modals/NotificationsModal';
import AnalyticsModal from '@/components/modals/AnalyticsModal';
import MemoryModal from '@/components/modals/MemoryModal';
import SettingsModal from '@/components/modals/SettingsModal';
import DiagnosticsModal from '@/components/modals/DiagnosticsModal';
import PermissionModal from '@/components/modals/PermissionModal';
import UserDropdown from '@/components/account/UserDropdown';

import { Agent, TaskItem, NotificationItem } from '@/types/dashboard';

import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Check,
  CheckSquare,
  Clock,
  Cloud,
  Code2,
  Cpu,
  Layers,
  LayoutDashboard,
  MapPin,
  Menu,
  Plus,
  Radio,
  RotateCcw,
  Settings,
  Thermometer,
  Trash2,
  Users,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { success, error: toastError, info } = useToast();

  // Global AI Mode: 'auto' | 'online' | 'offline'
  const [globalAiMode, setGlobalAiMode] = useState<'auto' | 'online' | 'offline'>('auto');

  // Navigation & Mobile Drawer State
  const [activeNavTab, setActiveNavTab] = useState('Dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeSidebarIndex, setActiveSidebarIndex] = useState(0);

  // Modals state
  const [isAgentsModalOpen, setIsAgentsModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [notificationsModalTab, setNotificationsModalTab] = useState<'notifications' | 'news'>('notifications');
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDiagnosticsModalOpen, setIsDiagnosticsModalOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  // Live telemetry state
  const [cpuUsage, setCpuUsage] = useState(0);
  const [telemetryAvailable, setTelemetryAvailable] = useState(false);
  const [memoryUsage, setMemoryUsage] = useState(0);
  const [gpuUsage, setGpuUsage] = useState(0);
  const [vramUsage, setVramUsage] = useState(0);
  const [gpuTemp, setGpuTemp] = useState(0);
  const [uptimeStr, setUptimeStr] = useState('--');
  const [ramDetails, setRamDetails] = useState<{ used: number; total: number } | null>(null);
  const [vramDetails, setVramDetails] = useState<{ used: number; total: number } | null>(null);

  // Country-Aware Global News Monitoring
  const {
    articles: globalArticles,
    filteredArticles: filteredNewsArticlesRaw,
    countryHighlights,
    selectedCountryCode,
    selectCountry,
    selectedCategory,
    selectCategory,
    isLoading: isLoadingNews,
    isRateLimited: isNewsRateLimited,
    isStale: isNewsStale,
    newArticlesCount,
    refreshNews,
    activeMarkers,
  } = useNewsMonitoring();

  // Per-user read / deleted article preferences (localStorage only, never server cache)
  const {
    readIds,
    deletedIds,
    bookmarkedRecords,
    bookmarkedIds,
    markRead,
    markUnread,
    deleteArticle,
    restoreArticle,
    toggleBookmark,
  } = useNewsUserPrefs();

  // Filter deleted articles out of the News Feed card view
  const filteredNewsArticles = filteredNewsArticlesRaw.filter(
    (a) => !deletedIds.has(a.id)
  );

  // Native Tauri Hardware Telemetry (CPU, RAM, GPU & Uptime)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    async function fetchNativeHardwareMetrics() {
      if (typeof window === 'undefined') return;

      const isTauriEnv =
        '__TAURI__' in window ||
        '__TAURI_IPC__' in window ||
        '__TAURI_METADATA__' in window;

      if (!isTauriEnv) return;

      try {
        let invokeFn: ((cmd: string, args?: Record<string, unknown>) => Promise<any>) | null = null;
        const w = window as any;

        if (w.__TAURI__ && typeof w.__TAURI__.invoke === 'function') {
          invokeFn = w.__TAURI__.invoke;
        } else {
          try {
            const { invoke } = await import('@tauri-apps/api/tauri');
            invokeFn = invoke;
          } catch {
            // dynamic import fallback ignored
          }
        }

        if (typeof invokeFn === 'function') {
          const data = await invokeFn('get_system_metrics');
          if (data && typeof data === 'object') {
            setTelemetryAvailable(true);
            if (typeof data.cpu_percent === 'number' && !isNaN(data.cpu_percent)) {
              setCpuUsage(Math.min(100, Math.max(0, Math.round(data.cpu_percent))));
            }
            if (typeof data.memory_percent === 'number' && !isNaN(data.memory_percent)) {
              setMemoryUsage(Math.min(100, Math.max(0, Math.round(data.memory_percent))));
            }
            if (typeof data.uptime_str === 'string' && data.uptime_str.length > 0) {
              setUptimeStr(data.uptime_str);
            }
            if (typeof data.used_ram_gb === 'number' && typeof data.total_ram_gb === 'number') {
              setRamDetails({
                used: Number(data.used_ram_gb.toFixed(1)),
                total: Number(data.total_ram_gb.toFixed(1)),
              });
            }
            if (typeof data.vram_used_gb === 'number' && typeof data.vram_total_gb === 'number') {
              setVramDetails({
                used: Number(data.vram_used_gb.toFixed(1)),
                total: Number(data.vram_total_gb.toFixed(1)),
              });
            }
            if (typeof data.gpu_percent === 'number' && !isNaN(data.gpu_percent)) {
              setGpuUsage(Math.min(100, Math.max(0, Math.round(data.gpu_percent))));
            }
            if (typeof data.vram_percent === 'number' && !isNaN(data.vram_percent)) {
              setVramUsage(Math.min(100, Math.max(0, Math.round(data.vram_percent))));
            }
            if (typeof data.gpu_temp_celsius === 'number' && !isNaN(data.gpu_temp_celsius)) {
              setGpuTemp(Math.round(data.gpu_temp_celsius));
            }
          }
        }
      } catch (err) {
        setTelemetryAvailable(false);
        console.warn('[Tauri Telemetry] Native hardware metric error:', err);
      }
    }

    fetchNativeHardwareMetrics();
    timer = setInterval(fetchNativeHardwareMetrics, 1500);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, []);

  // Sync tab with URL query parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      const lower = tabParam.toLowerCase();
      if (lower === 'agents') {
        setActiveNavTab('Agents');
        setActiveSidebarIndex(1);
      } else if (lower === 'tasks') {
        setActiveNavTab('Tasks');
        setActiveSidebarIndex(2);
      } else if (lower === 'analysis') {
        setActiveNavTab('Analysis');
        setActiveSidebarIndex(3);
      } else if (lower === 'code' || lower === 'code-assistant') {
        setActiveNavTab('Code');
        setActiveSidebarIndex(4);
      } else if (lower === 'settings') {
        setActiveNavTab('Settings');
        setActiveSidebarIndex(5);
      } else if (lower === 'dashboard') {
        setActiveNavTab('Dashboard');
        setActiveSidebarIndex(0);
      }
    }
  }, [searchParams]);

  // Notifications State
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Load persistent tasks, agents & notifications on mount
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    const loadedTasks = getStoredTasks();
    setTasks(loadedTasks);
    getTasks().then((db) => { if (db) setTasks(db); }).catch(() => {});

    const loadedAgents = getStoredAgents();
    setAgents(loadedAgents);

    const loadedNotifs = getStoredNotifications();
    setNotifications(loadedNotifs);
  }, []);

  // Listen for agent updates across services & modals
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleAgentsSync = () => {
      setAgents(getStoredAgents());
    };
    window.addEventListener('susi-agents-updated', handleAgentsSync);
    return () => {
      window.removeEventListener('susi-agents-updated', handleAgentsSync);
    };
  }, []);

  function getConsoleTimestamp() {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `[${hh}:${mm}:${ss}]`;
  }

  // Console State with timestamped records
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [commandInput, setCommandInput] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Task Queue State
  const [taskFilter, setTaskFilter] = useState<'All' | 'Active' | 'Done'>('All');

  // New Task Form State
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskAgent, setNewTaskAgent] = useState<'LEX' | 'SUSI' | 'SPY' | 'EURO' | 'YORU'>('LEX');
  const [newTaskPriority, setNewTaskPriority] = useState<'High' | 'Critical' | 'Medium' | 'Low'>('High');

  // News Feed Logs State
  const [newsLogs, setNewsLogs] = useState<{ id: number; text: string; time: string; dot: string }[]>([]);

  // Handle Tab Navigation Click with URL synchronization
  const handleNavClick = (tab: string) => {
    setActiveNavTab(tab);
    let tabSlug = 'dashboard';
    if (tab === 'Dashboard') {
      setActiveSidebarIndex(0);
      tabSlug = 'dashboard';
    } else if (tab === 'Agents') {
      setActiveSidebarIndex(1);
      tabSlug = 'agents';
    } else if (tab === 'Tasks') {
      setActiveSidebarIndex(2);
      tabSlug = 'tasks';
    } else if (tab === 'Analysis') {
      setActiveSidebarIndex(3);
      tabSlug = 'analysis';
    } else if (tab === 'Code') {
      setActiveSidebarIndex(4);
      tabSlug = 'code-assistant';
    } else if (tab === 'Settings') {
      setActiveSidebarIndex(5);
      tabSlug = 'settings';
    }

    if (typeof window !== 'undefined') {
      const newUrl = tabSlug === 'dashboard' ? window.location.pathname : `${window.location.pathname}?tab=${tabSlug}`;
      window.history.replaceState(null, '', newUrl);
    }
  };

  // Listen for Voice Assistant Tab Navigation events & AI Mode changes
  useEffect(() => {
    const handleVoiceNav = (e: any) => {
      const target = (e.detail?.tab || '').toLowerCase();
      if (target === 'code' || target === 'code-assistant') handleNavClick('Code');
      else if (target === 'tasks') handleNavClick('Tasks');
      else if (target === 'agents') handleNavClick('Agents');
      else if (target === 'analysis' || target === 'telemetry') handleNavClick('Analysis');
      else if (target === 'settings') handleNavClick('Settings');
      else if (target === 'dashboard') handleNavClick('Dashboard');
    };

    const handleModeSync = (e: any) => {
      if (e.detail?.mode) {
        setGlobalAiMode(e.detail.mode);
      }
    };

    window.addEventListener('dashboard-navigate-tab', handleVoiceNav);
    window.addEventListener('dashboard-set-ai-mode', handleModeSync);
    return () => {
      window.removeEventListener('dashboard-navigate-tab', handleVoiceNav);
      window.removeEventListener('dashboard-set-ai-mode', handleModeSync);
    };
  }, []);

  const toggleGlobalAiMode = () => {
    const next = globalAiMode === 'offline' ? 'auto' : 'offline';
    setGlobalAiMode(next);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('dashboard-set-ai-mode', { detail: { mode: next } })
      );
    }
    if (next === 'offline') {
      info('Switched to Offline Mode', 'AI is now running 100% locally with zero cloud API calls.');
    } else {
      success('Switched to Online AI Mode', 'Cloud AI (ChatGPT / Gemini API) is now active and connected.');
    }
  };

  // Handle Sidebar Navigation Click
  const handleSidebarClick = (index: number) => {
    setActiveSidebarIndex(index);
    if (index === 0) {
      handleNavClick('Dashboard');
    } else if (index === 1) {
      handleNavClick('Agents');
    } else if (index === 2) {
      handleNavClick('Tasks');
    } else if (index === 3) {
      handleNavClick('Analysis');
    } else if (index === 4) {
      handleNavClick('Code');
    } else if (index === 5) {
      handleNavClick('Settings');
    }
  };

  // Task Actions
  const handleCompleteTask = (id: string) => {
    const ts = getConsoleTimestamp();
    const taskItem = tasks.find((t) => t.id === id);
    const wasCompleted = taskItem ? taskItem.progress >= 100 || taskItem.completed : false;
    const taskName = taskItem ? taskItem.title : id;

    const nextVal = wasCompleted ? 50 : 100;
    const updatedTasks = tasks.map((t) => {
      if (t.id === id) {
        return { ...t, progress: nextVal, completed: !wasCompleted };
      }
      return t;
    });

    setTasks(updatedTasks);
    saveStoredTasks(updatedTasks);
    apiToggleTask(id).catch(() => {});

    if (wasCompleted) {
      info('Task Reopened', `"${taskName}" moved back to active queue.`);
    } else {
      success('Task Completed!', `"${taskName}" marked 100% complete.`);
    }

    setConsoleLogs((prev) => [
      ...prev,
      `${ts} [TASK] ${wasCompleted ? 'Reopened' : 'Completed'}: "${taskName}"`,
    ]);

    setNewsLogs((prev) => [
      {
        id: Date.now(),
        text: wasCompleted
          ? `Task "${taskName}" reopened for queue execution`
          : `Task "${taskName}" marked 100% complete`,
        time: 'Just now',
        dot: wasCompleted ? 'bg-amber-500' : 'bg-emerald-500',
      },
      ...prev.slice(0, 5),
    ]);
  };

  const handleBoostTask = (id: string) => {
    const ts = getConsoleTimestamp();
    const taskItem = tasks.find((t) => t.id === id);
    const nextVal = Math.min(100, (taskItem?.progress || 0) + 15);
    const updatedTasks = tasks.map((t) => {
      if (t.id === id) {
        return { ...t, progress: nextVal, completed: nextVal === 100 };
      }
      return t;
    });

    setTasks(updatedTasks);
    saveStoredTasks(updatedTasks);
    apiUpdateTask(id, { progress: nextVal, completed: nextVal === 100 }).catch(() => {});

    info('Task Priority Boosted', `+15% compute allocated to "${taskItem?.title || id}"`);
    setConsoleLogs((prev) => [
      ...prev,
      `${ts} [TASK] Boosted: "${taskItem?.title || id}" (+15% progress)`,
    ]);
  };

  const handleDeleteTask = (id: string) => {
    const ts = getConsoleTimestamp();
    const taskItem = tasks.find((t) => t.id === id);
    const updatedTasks = tasks.filter((t) => t.id !== id);
    setTasks(updatedTasks);
    saveStoredTasks(updatedTasks);
    apiDeleteTask(id).catch(() => {});

    info('Task Removed', `"${taskItem?.title || id}" removed from queue.`);
    setConsoleLogs((prev) => [
      ...prev,
      `${ts} [TASK] Removed: "${taskItem?.title || id}" from queue`,
    ]);
  };

  // Handle Terminal Commands Execution
  const executeCommand = (cmd: string) => {
    const ts = getConsoleTimestamp();
    const lower = cmd.toLowerCase().trim();
    let reply = `${ts} [RESULT] Command not recognized. Type 'help' for available commands.`;

    if (lower === 'help') {
      reply = `${ts} [RESULT] Available commands: status, agents, tasks, ping, help.`;
    } else if (lower === 'status') {
      reply = `${ts} [RESULT] Fleet is active. Four agents are online.`;
    } else if (lower === 'agents') {
      reply = `${ts} [RESULT] LEX, SUSI, SPY, and YORU are online.`;
      handleNavClick('Agents');
    } else if (lower === 'tasks') {
      reply = `${ts} [RESULT] There are ${tasks.length} tasks in the queue.`;
      handleNavClick('Tasks');
    } else if (
      lower.startsWith('open ') ||
      ['chrome', 'notepad', 'calc', 'calculator', 'settings', 'vscode', 'application', 'app', 'google', 'browser', 'paint', 'spotify', 'vlc', 'discord'].includes(lower)
    ) {
      const app = lower.replace(/^open\s+/, '').trim();
      fetchWithDesktopAuth('/api/local/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'OPEN_APP', payload: { appName: app } }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) success('Launched', `Opened ${app.toUpperCase()} on Windows desktop.`);
        })
        .catch(() => {});
      reply = `${ts} [APP] Launched "${app.toUpperCase()}" via Windows Desktop Launcher.`;
    } else if (lower.startsWith('close ') || lower.startsWith('kill ')) {
      const app = lower.replace(/^(close|kill)\s+/, '').trim();
      fetchWithDesktopAuth('/api/local/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'CLOSE_APP', payload: { appName: app } }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) success('Closed', `Closed ${app.toUpperCase()} on Windows.`);
          else toastError('Close Failed', d.error || 'Failed to terminate app');
        })
        .catch(() => {});
      reply = `${ts} [APP] Requested termination of "${app.toUpperCase()}".`;
    } else if (lower === 'screenshot' || lower === 'screen capture') {
      fetchWithDesktopAuth('/api/local/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'TAKE_SCREENSHOT', payload: {} }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) success('Screenshot Taken', d.message);
        })
        .catch(() => {});
      reply = `${ts} [SCREENSHOT] Capturing desktop screen to Desktop folder...`;
    } else if (lower.startsWith('volume ') || lower === 'mute') {
      const volAction = lower.replace(/^volume\s+/, '').trim() || 'mute';
      fetchWithDesktopAuth('/api/local/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'VOLUME_CONTROL', payload: { action: volAction } }),
      }).catch(() => {});
      reply = `${ts} [AUDIO] Dispatched volume action: "${volAction}".`;
    } else if (lower === 'lock' || lower === 'lock pc') {
      fetchWithDesktopAuth('/api/local/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'POWER_CONTROL', payload: { action: 'lock' } }),
      }).catch(() => {});
      reply = `${ts} [POWER] Workstation lock initiated.`;
    } else if (lower === 'desktop' || lower === 'minimize all') {
      fetchWithDesktopAuth('/api/local/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: 'WINDOW_CONTROL', payload: { action: 'show_desktop' } }),
      }).catch(() => {});
      reply = `${ts} [WINDOW] Show desktop dispatched.`;
    } else if (lower.startsWith('task add ')) {
      const title = cmd.slice(9).trim();
      if (title) {
        const newTask: TaskItem = {
          id: `task-${Date.now()}`,
          title,
          assignedAgent: 'SUSI',
          progress: 10,
          priority: 'High',
          category: 'Operations',
        };
        const updated = [newTask, ...tasks];
        setTasks(updated);
        saveStoredTasks(updated);
        success('Task Created', `"${title}" added via terminal.`);
        reply = `${ts} [TASK] Created: "${title}" assigned to SUSI [High]`;
        setNewsLogs((prev) => [
          {
            id: Date.now(),
            text: `New task "${title}" assigned to SUSI`,
            time: 'Just now',
            dot: 'bg-amber-500',
          },
          ...prev.slice(0, 5),
        ]);
      }
    } else if (lower === 'ping') {
      reply = `${ts} [RESULT] All local systems are responding.`;
    } else if (lower === 'analytics' || lower === 'telemetry') {
      setIsAnalyticsModalOpen(true);
      reply = `${ts} [RESULT] Opened fleet analytics telemetry modal.`;
    } else if (lower === 'memory' || lower === 'rag') {
      setIsMemoryModalOpen(true);
      reply = `${ts} [RESULT] Opened vector memory & neural embeddings modal.`;
    } else if (lower === 'diagnostics') {
      setIsDiagnosticsModalOpen(true);
      reply = `${ts} [RESULT] Initiated security & fleet health diagnostic probe.`;
    }

    setConsoleLogs((prev) => [...prev, `${ts} [COMMAND] ${cmd}`, reply]);
  };

  // Dispatch new work through the authenticated multi-agent orchestrator.
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) {
      toastError('Validation Error', 'Please enter a task title.');
      return;
    }
    try {
      const response = await fetch('/api/agents/orchestrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ title, objective: title, priority: newTaskPriority }),
      });
      const result = await response.json();
      if (!response.ok || !result?.taskId) {
        throw new Error(result?.error || 'The orchestration service did not accept this task.');
      }
      const created: TaskItem = {
        id: String(result.taskId),
        title,
        assignedAgent: 'SUSI',
        progress: result.success ? 100 : 90,
        priority: newTaskPriority,
        category: 'Operations',
        completed: Boolean(result.success),
      };
      const updated = [created, ...tasks.filter((task) => task.id !== created.id)];
      setTasks(updated);
      saveStoredTasks(updated);
      setConsoleLogs((prev) => [...prev, `${getConsoleTimestamp()} [ORCHESTRATOR] ${result.success ? 'VERIFIED' : 'FAILED'}: "${title}" — ${result.status || 'unknown'}`]);
      if (result.success) success('Task completed', result.finalOutput || 'SUSI verified the task output.');
      else toastError('Task execution failed', result.error || result.susiVerification?.auditNotes || 'The task was not verified. Check the task run details.');
      setNewTaskTitle('');
      setIsNewTaskModalOpen(false);
    } catch (error) {
      toastError('Task was not dispatched', error instanceof Error ? error.message : 'Orchestration request failed.');
    }
  };

  const filteredTasks = tasks.filter((t) => {
    if (taskFilter === 'Active') return t.progress < 100 && !t.completed;
    if (taskFilter === 'Done') return t.progress >= 100 || t.completed;
    return true;
  });

  return (
    <div className="min-h-screen w-full bg-[#FDFBF7] text-stone-800 flex flex-col font-sans antialiased selection:bg-amber-200">
      {/* ========================================================================= */}
      {/* 1. TOP NAVBAR (Sticky, Glassmorphic)                                       */}
      {/* ========================================================================= */}
      <header className="sticky top-0 z-40 h-16 w-full bg-white/70 backdrop-blur-md border-b border-stone-100 px-4 lg:px-6 flex items-center justify-between transition-colors shadow-2xs">
        {/* Left: Logo with Orange Star Icon */}
        <div
          onClick={() => setActiveNavTab('Dashboard')}
          className="flex items-center gap-3 cursor-pointer group select-none"
        >
          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-amber-500 shadow-sm text-white font-bold group-hover:scale-105 transition-transform">
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-white">
              <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-stone-900 tracking-tight text-base lg:text-lg">
                SUSI AI
              </span>
              <span className="hidden sm:inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100/70 text-amber-800 border border-amber-200/60">
                v2.1
              </span>
            </div>
            <p className="hidden sm:block text-[10px] font-medium text-stone-500 uppercase tracking-wider">
              Autonomous Workforce
            </p>
          </div>
        </div>

        {/* Center: Desktop Navigation Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-stone-100/80 p-1 rounded-xl border border-stone-200/50">
          {['Dashboard', 'Agents', 'Tasks', 'Analysis', 'Code', 'Settings'].map((tab) => {
            const isActive = activeNavTab === tab;
            return (
              <button
                key={tab}
                onClick={() => handleNavClick(tab)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${isActive
                  ? 'bg-white text-stone-900 shadow-xs border border-stone-200/70'
                  : 'text-stone-500 hover:text-stone-800 hover:bg-white/40'
                  }`}
              >
                {tab}
              </button>
            );
          })}
        </nav>

        {/* Right: AI Mode Toggle, Fleet Active Badge, Notifications, Avatar */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {/* AI Mode Selector: Online Cloud vs Offline Local Engine */}
          <button
            onClick={toggleGlobalAiMode}
            title={`Currently in ${globalAiMode === 'offline' ? 'Offline Mode (Local Smart Engine)' : 'Online AI Mode (Cloud API Connected)'}. Click to switch mode.`}
            className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 ${
              globalAiMode === 'offline'
                ? 'bg-amber-50 hover:bg-amber-100/80 text-amber-900 border-amber-300'
                : 'bg-emerald-50 hover:bg-emerald-100/80 text-emerald-900 border-emerald-300'
            }`}
          >
            {globalAiMode === 'offline' ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-600" />
                <div className="flex flex-col text-left leading-none">
                  <span className="text-[10.5px] font-extrabold text-amber-900 flex items-center gap-1">
                    OFFLINE
                  </span>
                  <span className="text-[8.5px] font-semibold text-amber-600">Local Engine</span>
                </div>
              </>
            ) : (
              <>
                <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                <div className="flex flex-col text-left leading-none">
                  <span className="text-[10.5px] font-extrabold text-emerald-900 flex items-center gap-1">
                    ONLINE AI
                  </span>
                  <span className="text-[8.5px] font-semibold text-emerald-600">Cloud API</span>
                </div>
              </>
            )}
          </button>

          {/* Fleet Active Pulsing Badge - Clickable for Diagnostics */}
          <button
            onClick={() => setIsDiagnosticsModalOpen(true)}
            title="Click for Fleet Health & Network Diagnostics"
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 hover:bg-emerald-100/70 border border-emerald-200/80 text-emerald-800 text-xs font-medium shadow-xs transition-all cursor-pointer active:scale-95"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="font-bold text-[11px]">Fleet Active</span>
          </button>

          {/* Notifications Bell */}
          <button
            onClick={() => {
              setNotificationsModalTab('notifications');
              setIsNotificationsModalOpen(true);
            }}
            title="Notifications & Security Alerts"
            className="w-8 h-8 rounded-xl bg-stone-100/80 hover:bg-stone-200 border border-stone-200/60 flex items-center justify-center text-stone-600 transition-all relative cursor-pointer"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
          </button>

          {/* User Profile Avatar - Clickable Dropdown */}
          <UserDropdown
            onOpenNotifications={() => {
              setNotificationsModalTab('notifications');
              setIsNotificationsModalOpen(true);
            }}
          />

          {/* Mobile Hamburger Menu Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-100 transition-colors cursor-pointer"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Slide-out Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-b border-stone-200 p-4 space-y-2 animate-in slide-in-from-top duration-200 z-30">
          {['Dashboard', 'Agents', 'Tasks', 'Analysis', 'Code', 'Settings'].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                handleNavClick(tab);
                setMobileMenuOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-xl text-xs font-semibold ${activeNavTab === tab ? 'bg-amber-50 text-amber-900' : 'text-stone-600'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. MAIN BODY (Left Sidebar & Responsive Grid)                             */}
      {/* ========================================================================= */}
      <div className="flex flex-1 w-full min-h-0">
        {/* Left Sidebar */}
        <aside className="hidden md:flex w-16 flex-col items-center justify-between border-r border-stone-100 bg-white py-5 shrink-0 select-none">
          <div className="flex flex-col items-center gap-4 w-full">
            {[
              { icon: LayoutDashboard, label: 'Dashboard' },
              { icon: Users, label: 'Workforce Agents' },
              { icon: CheckSquare, label: 'Task Queue' },
              { icon: BarChart3, label: 'Analysis' },
              { icon: Code2, label: 'Code Assistant' },
              { icon: Settings, label: 'Settings' },
            ].map((item, idx) => {
              const Icon = item.icon;
              const isActive = activeSidebarIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => handleSidebarClick(idx)}
                  title={item.label}
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all cursor-pointer ${isActive
                    ? 'bg-amber-50 text-amber-800 border border-amber-200 shadow-xs'
                    : 'text-stone-400 hover:text-stone-700 hover:bg-stone-50'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                </button>
              );
            })}
          </div>

          <div className="text-[10px] font-mono font-bold text-stone-300">
            AGY
          </div>
        </aside>

        {/* Dashboard Content Container */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 w-full">
          {activeNavTab === 'Agents' ? (
            <div className="w-full max-w-[1600px] mx-auto">
              <WorkforceAgentsView
                agents={agents}
                tasks={tasks as any}
                onSelectAgent={(agent) => setSelectedAgent(agent)}
                onDispatchTaskToAgent={(agentId) => {
                  setNewTaskAgent(agentId.toUpperCase() as any);
                  setIsNewTaskModalOpen(true);
                }}
                onBoostTask={handleBoostTask}
                onCompleteTask={handleCompleteTask}
                onNavigateToTown={() => {
                  setActiveNavTab('Dashboard');
                  setActiveSidebarIndex(0);
                }}
              />
            </div>
          ) : activeNavTab === 'Tasks' ? (
            <div className="w-full max-w-[1600px] mx-auto">
              <TaskQueueView
                tasks={tasks as any}
                agents={agents}
                onCompleteTask={handleCompleteTask}
                onBoostTask={handleBoostTask}
                onDeleteTask={handleDeleteTask}
                onOpenCreateTask={() => setIsNewTaskModalOpen(true)}
                onNavigateToAgents={() => {
                  setActiveNavTab('Agents');
                  setActiveSidebarIndex(1);
                }}
              />
            </div>
          ) : activeNavTab === 'Analysis' ? (
            <div className="w-full max-w-[1600px] mx-auto">
              <AnalysisView
                onNavigateToDashboard={() => {
                  setActiveNavTab('Dashboard');
                  setActiveSidebarIndex(0);
                }}
                onNavigateToTasks={() => {
                  setActiveNavTab('Tasks');
                  setActiveSidebarIndex(2);
                }}
                onNavigateToAgents={() => {
                  setActiveNavTab('Agents');
                  setActiveSidebarIndex(1);
                }}
              />
            </div>
          ) : activeNavTab === 'Code' ? (
            <div className="w-full max-w-[1600px] mx-auto">
              <CodeAssistantView
                onNavigateToDashboard={() => {
                  setActiveNavTab('Dashboard');
                  setActiveSidebarIndex(0);
                }}
              />
            </div>
          ) : activeNavTab === 'Settings' ? (
            <div className="w-full max-w-[1600px] mx-auto">
              <SettingsView
                onOpenSystemPreferences={() => setIsSettingsModalOpen(true)}
                onNavigateToDashboard={() => {
                  setActiveNavTab('Dashboard');
                  setActiveSidebarIndex(0);
                }}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 lg:gap-6 w-full max-w-[1600px] mx-auto">
              {/* =================================================================== */}
              {/* COLUMN 1 (lg:col-span-3)                                            */}
              {/* =================================================================== */}
              <div className="lg:col-span-3 flex flex-col gap-4 w-full">
                {/* SYSTEM STATUS CARD */}
                <div className="bg-white border border-stone-100 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-amber-500" />
                      <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                        System Status
                      </h2>
                    </div>
                    <button
                      onClick={() => setIsAnalyticsModalOpen(true)}
                      title="Click for full telemetry"
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${telemetryAvailable ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-stone-500 bg-stone-50 border-stone-200'}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${telemetryAvailable ? 'bg-emerald-500 animate-pulse' : 'bg-stone-400'}`} />
                      {telemetryAvailable ? 'Live' : 'Unavailable'}
                    </button>
                  </div>

                  <div className="space-y-2.5 my-2">
                    {/* Uptime */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-500 font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-stone-400" /> Uptime
                      </span>
                      <span className="font-bold text-stone-800 font-mono">{uptimeStr}</span>
                    </div>

                    {/* CPU Usage */}
                    <div
                      onClick={() => setIsAnalyticsModalOpen(true)}
                      className="cursor-pointer group"
                      title="Click to inspect compute cores"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-stone-500 group-hover:text-amber-800 font-medium flex items-center gap-1.5 transition-colors">
                          <Cpu className="w-3.5 h-3.5 text-stone-400" /> CPU Usage
                        </span>
                        <span className="font-bold text-stone-800 font-mono">{telemetryAvailable ? `${cpuUsage}%` : '—'}</span>
                      </div>
                      <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-500 rounded-full transition-all duration-700"
                          style={{ width: `${cpuUsage}%` }}
                        />
                      </div>
                    </div>

                    {/* Memory Usage */}
                    <div
                      onClick={() => setIsAnalyticsModalOpen(true)}
                      className="cursor-pointer group"
                      title="Click to inspect memory shards"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-stone-500 group-hover:text-amber-800 font-medium flex items-center gap-1.5 transition-colors">
                          <Radio className="w-3.5 h-3.5 text-stone-400" /> Memory Usage
                        </span>
                        <span className="font-bold text-stone-800 font-mono">{telemetryAvailable ? `${memoryUsage}%` : '—'}</span>
                      </div>
                      <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-600 rounded-full transition-all duration-700"
                          style={{ width: `${memoryUsage}%` }}
                        />
                      </div>
                    </div>

                    {/* GPU Usage */}
                    <div
                      onClick={() => setIsAnalyticsModalOpen(true)}
                      className="cursor-pointer group"
                      title="Click to inspect GPU accelerator"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-stone-500 group-hover:text-purple-800 font-medium flex items-center gap-1.5 transition-colors">
                          <Zap className="w-3.5 h-3.5 text-purple-500" /> GPU Load
                        </span>
                        <span className="font-bold text-purple-700 font-mono">{telemetryAvailable ? `${gpuUsage}%` : '—'}</span>
                      </div>
                      <div className="w-full h-1.5 bg-purple-50 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full transition-all duration-700"
                          style={{ width: `${gpuUsage}%` }}
                        />
                      </div>
                    </div>

                    {/* VRAM & GPU Temp */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div
                        onClick={() => setIsAnalyticsModalOpen(true)}
                        className="flex items-center justify-between text-[11px] bg-stone-50 px-2 py-1 rounded-lg border border-stone-100 cursor-pointer hover:bg-stone-100 transition-colors"
                      >
                        <span className="text-stone-500 font-medium flex items-center gap-1">
                          <Layers className="w-3 h-3 text-indigo-500" /> VRAM
                        </span>
                        <span className="font-bold text-indigo-700 font-mono">{vramUsage}%</span>
                      </div>
                      <div
                        onClick={() => setIsAnalyticsModalOpen(true)}
                        className="flex items-center justify-between text-[11px] bg-stone-50 px-2 py-1 rounded-lg border border-stone-100 cursor-pointer hover:bg-stone-100 transition-colors"
                      >
                        <span className="text-stone-500 font-medium flex items-center gap-1">
                          <Thermometer className="w-3 h-3 text-rose-500" /> Temp
                        </span>
                        <span className="font-bold text-rose-600 font-mono">{gpuTemp}°C</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* GLOBAL OVERVIEW CARD (Dotted World Map with Pins & Country Hotspots) */}
                <GlobalOverviewCard
                  agents={agents}
                  tasks={tasks}
                  isSystemOffline={globalAiMode === 'offline'}
                  highlightedCountries={countryHighlights}
                  selectedCountryCode={selectedCountryCode}
                  onSelectCountry={selectCountry}
                  isLoadingNews={isLoadingNews}
                  isStaleNews={isNewsStale}
                  liveEventMarkers={activeMarkers}
                />

                {/* NEWS FEED CARD (Real GDELT DOC 2.0 Global News Feed) */}
                <div className="bg-white border border-stone-100 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-4 flex flex-col">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                    <div className="flex items-center gap-1.5">
                      <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                        News Feed
                      </h2>
                      {filteredNewsArticles.length > 0 && (
                        <span className="text-[10px] font-bold text-stone-500 bg-stone-100 px-1.5 py-0.2 rounded-full border border-stone-200/60 font-mono">
                          {filteredNewsArticles.length}
                        </span>
                      )}
                      {newArticlesCount > 0 && (
                        <button
                          onClick={() => selectCategory(selectedCategory === 'NEW' ? null : 'NEW')}
                          title="Click to view new breaking news"
                          className={`px-1.5 py-0.5 text-[9px] font-bold rounded-full transition-all cursor-pointer ${
                            selectedCategory === 'NEW'
                              ? 'bg-amber-600 text-white ring-2 ring-amber-300'
                              : 'bg-amber-500 text-white hover:bg-amber-600 animate-pulse'
                          }`}
                        >
                          +{newArticlesCount} NEW
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => refreshNews()}
                        disabled={isLoadingNews}
                        title="Refresh live news"
                        className="text-stone-400 hover:text-stone-700 disabled:opacity-50 transition-colors p-0.5 rounded cursor-pointer"
                      >
                        <RotateCcw className={`w-3 h-3 ${isLoadingNews ? 'animate-spin text-amber-600' : ''}`} />
                      </button>
                      <button
                        onClick={() => {
                          setNotificationsModalTab('news');
                          setIsNotificationsModalOpen(true);
                        }}
                        className="text-[10px] font-semibold text-amber-600 hover:text-amber-800 hover:underline transition-colors cursor-pointer"
                      >
                        View All
                      </button>
                    </div>
                  </div>

                  {/* Category Filter Pills ("all news categories") */}
                  <div className="flex items-center gap-1 py-1.5 overflow-x-auto scrollbar-none border-b border-stone-100">
                    {['All', 'World', 'Politics', 'Technology', 'Finance', 'Science'].map((cat) => {
                      const isCatActive = cat === 'All' ? !selectedCategory : selectedCategory === cat;
                      return (
                        <button
                          key={cat}
                          onClick={() => selectCategory(cat === 'All' ? null : cat)}
                          className={`px-2 py-0.5 rounded-full text-[9.5px] font-medium whitespace-nowrap transition-colors cursor-pointer border ${
                            isCatActive
                              ? 'bg-amber-100 text-amber-900 border-amber-300 font-bold shadow-xs'
                              : 'bg-stone-50 text-stone-600 border-stone-200/80 hover:bg-stone-100 hover:text-stone-900'
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                    {newArticlesCount > 0 && (
                      <button
                        onClick={() => selectCategory(selectedCategory === 'NEW' ? null : 'NEW')}
                        className={`px-2 py-0.5 rounded-full text-[9.5px] font-bold whitespace-nowrap transition-colors cursor-pointer border flex items-center gap-1 ${
                          selectedCategory === 'NEW'
                            ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        }`}
                      >
                        <span>🔥 New</span>
                        <span className="text-[8.5px] px-1 bg-white/40 rounded-full font-mono">{newArticlesCount}</span>
                      </button>
                    )}
                  </div>

                  {/* Active country filter banner */}
                  {selectedCountryCode && (
                    <div className="my-1.5 flex items-center justify-between text-[10px] bg-amber-50 text-amber-900 border border-amber-200/70 rounded-md px-2 py-0.5">
                      <span>Filtered by country: <strong>{selectedCountryCode}</strong></span>
                      <button
                        onClick={() => selectCountry(null)}
                        className="text-amber-700 hover:text-amber-950 font-bold ml-2 underline cursor-pointer"
                      >
                        Show All
                      </button>
                    </div>
                  )}

                  <div className="space-y-2.5 my-2 max-h-[280px] overflow-y-auto pr-0.5 flex-1 scrollbar-thin">
                    {filteredNewsArticles.length === 0 ? (
                      <div className="text-center py-4 space-y-1">
                        <p className="text-[11px] text-stone-400 italic">
                          No articles match this filter.
                        </p>
                        {(selectedCategory || selectedCountryCode) && (
                          <button
                            onClick={() => {
                              selectCategory(null);
                              selectCountry(null);
                            }}
                            className="text-[10px] text-amber-600 font-semibold underline hover:text-amber-800 cursor-pointer"
                          >
                            Reset filters
                          </button>
                        )}
                      </div>
                    ) : (
                      filteredNewsArticles.map((article) => {
                        const hasCountry = article.countries.length > 0;
                        const dotColor = article.isNew
                          ? 'bg-amber-500'
                          : hasCountry
                          ? 'bg-emerald-500'
                          : 'bg-stone-400';

                        return (
                          <div
                            key={article.id}
                            className={`flex items-start gap-2 text-xs p-1.5 rounded-lg transition-colors group ${
                              article.isNew
                                ? 'bg-amber-50/60 border border-amber-200/70 shadow-xs'
                                : 'hover:bg-stone-50'
                            }`}
                          >
                            <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${dotColor} ${article.isNew ? 'animate-ping' : ''}`} />
                            <div className="flex-1 min-w-0">
                              <a
                                href={article.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-stone-700 hover:text-amber-700 text-[11px] leading-tight line-clamp-2 font-medium transition-colors"
                              >
                                {article.title}
                              </a>
                              <div className="flex items-center gap-1.5 mt-1 text-[9px] text-stone-400 flex-wrap">
                                <span className="font-mono text-stone-500 tabular-nums shrink-0 min-w-[46px]">{formatTimeAgo(article.seendate) || article.timeAgo}</span>
                                <span className="text-stone-300 select-none">•</span>
                                <span className="text-stone-500 font-medium">{article.domain}</span>
                                {article.category && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      selectCategory(article.category as string);
                                    }}
                                    className={`px-1.5 py-0.2 rounded text-[8px] font-bold border transition-colors cursor-pointer ${
                                      article.category === 'Technology'
                                        ? 'bg-sky-50 text-sky-700 border-sky-200/70 hover:bg-sky-100'
                                        : article.category === 'Politics'
                                        ? 'bg-rose-50 text-rose-700 border-rose-200/70 hover:bg-rose-100'
                                        : article.category === 'Finance'
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/70 hover:bg-emerald-100'
                                        : article.category === 'Science'
                                        ? 'bg-purple-50 text-purple-700 border-purple-200/70 hover:bg-purple-100'
                                        : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-stone-200'
                                    }`}
                                    title={`Filter by ${article.category}`}
                                  >
                                    {article.category}
                                  </button>
                                )}
                                {article.countries.map((c) => (
                                  <button
                                    key={c.code}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      selectCountry(c.code);
                                    }}
                                    className={`inline-flex items-center px-1.5 py-0.2 rounded text-[8.5px] font-mono font-bold border transition-colors cursor-pointer ${
                                      selectedCountryCode === c.code
                                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                                        : 'bg-stone-100 text-stone-600 border-stone-200 hover:bg-amber-50 hover:text-amber-700'
                                    }`}
                                    title={`Filter map & feed by ${c.name}`}
                                  >
                                    {c.code}
                                  </button>
                                ))}
                                {article.isNew && (
                                  <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.2 bg-amber-500 text-white rounded-full animate-pulse shadow-xs">
                                    New
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* =================================================================== */}
              {/* COLUMN 2 (lg:col-span-6)                                            */}
              {/* =================================================================== */}
              <div className="lg:col-span-6 flex flex-col gap-4 w-full">
                {/* ORACLE VOICE INTELLIGENCE & AGENT STATUS */}
                <VoiceCard
                  onSelectTab={(tab) => {
                    if (tab === 'code' || tab === 'code-assistant') handleNavClick('Code');
                    else if (tab === 'tasks') handleNavClick('Tasks');
                    else if (tab === 'agents') handleNavClick('Agents');
                    else if (tab === 'analysis' || tab === 'telemetry') handleNavClick('Analysis');
                    else if (tab === 'settings') handleNavClick('Settings');
                    else if (tab === 'dashboard') handleNavClick('Dashboard');
                  }}
                  onSelectAgent={(agentId) => {
                    const found = agents.find(
                      (ag: Agent) => ag.id.toLowerCase() === agentId.toLowerCase()
                    );
                    if (found) {
                      const ts = getConsoleTimestamp();
                      setSelectedAgent(found);
                      setConsoleLogs((prev) => [
                        ...prev,
                        `${ts} [AGENT] Selected ${found.name} (${found.role})`,
                      ]);
                      setNewsLogs((prev) => [
                        {
                          id: Date.now(),
                          text: `Agent ${found.name} inspected (${found.role})`,
                          time: 'Just now',
                          dot: 'bg-purple-500',
                        },
                        ...prev.slice(0, 5),
                      ]);
                    }
                  }}
                  onCommand={(cmd, reply) => {
                    const ts = getConsoleTimestamp();
                    setConsoleLogs((prev) => [
                      ...prev,
                      `${ts} [VOICE: USER] ${cmd}`,
                      `${ts} [VOICE: SUSI] ${reply}`,
                    ]);
                  }}
                />

                {/* AGENT TOWN CARD (Simulation Engine with Mode Toggle) */}
                <div className="bg-white border border-stone-100 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-4 flex flex-col flex-1">
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-stone-100 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-amber-500" />
                      <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
                        Agent Town
                      </h2>
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Pixel Sim Live
                      </span>
                    </div>
                  </div>

                  {/* Card Body: Pixel Town Embed */}
                  <div className="relative w-full flex-1 rounded-xl min-h-[450px] flex flex-col overflow-hidden">
                    <AgentTownEmbed />
                  </div>
                </div>
              </div>

              {/* =================================================================== */}
              {/* COLUMN 3 (lg:col-span-3)                                            */}
              {/* =================================================================== */}
              <div className="lg:col-span-3 flex flex-col gap-4 w-full">
                {/* CONSOLE CARD (Redesigned) */}
                <ConsoleCard
                  logs={consoleLogs}
                  onClear={() => setConsoleLogs(['> console buffer cleared // ready for commands'])}
                  onRunCommand={executeCommand}
                />

                {/* TASK QUEUE CARD */}
                <div className="bg-white border border-stone-100 rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.03)] p-4 flex flex-col">
                  <div className="flex items-center justify-between pb-2 border-b border-stone-100">
                    <div
                      onClick={() => {
                        setActiveNavTab('Tasks');
                        setActiveSidebarIndex(2);
                      }}
                      className="flex items-center gap-2 cursor-pointer group select-none"
                      title="Click to open Full-Screen Task Management"
                    >
                      <CheckSquare className="w-4 h-4 text-amber-500" />
                      <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider group-hover:text-amber-800 transition-colors">
                        Task Queue
                      </h2>
                      <ArrowUpRight className="w-3.5 h-3.5 text-stone-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* Filter Pills */}
                    <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg text-[10px]">
                      {(['All', 'Active', 'Done'] as const).map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setTaskFilter(f)}
                          className={`px-2 py-0.5 font-bold rounded-md transition-all ${taskFilter === f
                            ? 'bg-white text-stone-900 shadow-2xs'
                            : 'text-stone-500 hover:text-stone-800'
                            }`}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Task List with Spacious Layout */}
                  <div className="space-y-2 my-2.5 max-h-[250px] overflow-y-auto pr-0.5">
                    {filteredTasks.length === 0 ? (
                      <div className="text-center py-6 text-stone-400 text-xs font-medium">
                        No tasks in this view
                      </div>
                    ) : (
                      filteredTasks.map((task) => {
                        const isDone = task.progress >= 100 || task.completed;
                        return (
                          <div
                            key={task.id}
                            className={`p-2 px-2.5 rounded-xl border transition-all ${isDone
                              ? 'bg-emerald-50/40 border-emerald-200/70'
                              : 'bg-stone-50/60 border-stone-100 hover:bg-white hover:border-stone-200'
                              } space-y-1.5 group`}
                          >
                            <div className="flex items-center justify-between text-xs gap-1.5">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                {/* Complete Toggle Checkbox Button */}
                                <button
                                  type="button"
                                  onClick={() => handleCompleteTask(task.id)}
                                  title={isDone ? 'Mark Incomplete' : 'Mark as Complete'}
                                  className={`w-4 h-4 rounded flex items-center justify-center transition-colors shrink-0 ${isDone
                                    ? 'bg-emerald-500 text-white'
                                    : 'border border-stone-300 hover:border-emerald-500 hover:bg-emerald-50 text-transparent'
                                    }`}
                                >
                                  <Check className="w-3 h-3" />
                                </button>

                                <span
                                  className={`font-bold text-[11.5px] truncate ${isDone ? 'line-through text-stone-400' : 'text-stone-800'
                                    }`}
                                >
                                  {task.title}
                                </span>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span
                                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${task.priority === 'Critical'
                                    ? 'bg-rose-100 text-rose-700'
                                    : 'bg-amber-100 text-amber-800'
                                    }`}
                                >
                                  {task.priority}
                                </span>

                                {/* Delete Button */}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteTask(task.id)}
                                  title="Delete Task"
                                  className="opacity-0 group-hover:opacity-100 p-0.5 text-stone-400 hover:text-rose-600 transition-opacity"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            {/* Progress Bar & Actions */}
                            <div className="flex items-center justify-between gap-2">
                              <div
                                onClick={() => handleBoostTask(task.id)}
                                title="Click to boost progress +15%"
                                className="flex-1 h-1.5 bg-stone-200 rounded-full overflow-hidden cursor-pointer"
                              >
                                <div
                                  className={`h-full transition-all duration-500 rounded-full ${isDone ? 'bg-emerald-500' : 'bg-amber-500'
                                    }`}
                                  style={{ width: `${task.progress}%` }}
                                />
                              </div>
                              <span className="text-[9.5px] font-mono font-semibold text-stone-500">
                                {task.progress}%
                              </span>
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-200/70 text-stone-700">
                                {task.assignedAgent}
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* + Create New Task Button */}
                  <button
                    type="button"
                    onClick={() => setIsNewTaskModalOpen(true)}
                    className="w-full mt-1.5 py-2 text-xs font-bold text-amber-900 bg-amber-100/70 hover:bg-amber-100 border border-amber-200/80 rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-[0.99]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Create New Task
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================================= */}
      {/* 3. MODALS & POPUPS (Full Interactivity)                                   */}
      {/* ========================================================================= */}

      {/* CREATE NEW TASK MODAL */}
      {isNewTaskModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl border border-stone-100 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-stone-100">
              <h3 className="text-sm font-bold text-stone-900">Create New Fleet Task</h3>
              <button
                onClick={() => setIsNewTaskModalOpen(false)}
                className="p-1 rounded-lg text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 mb-1">Task Title</label>
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="e.g. Security Audit & Sharding Analysis"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 bg-stone-50 focus:bg-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Assign Agent</label>
                  <select
                    value={newTaskAgent}
                    onChange={(e) => setNewTaskAgent(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-stone-50"
                  >
                    <option value="LEX">LEX (Research)</option>
                    <option value="SUSI">SUSI (Fleet Lead)</option>
                    <option value="SPY">SPY (Security)</option>
                    <option value="YORU">YORU (Creative)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 mb-1">Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as any)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-stone-200 bg-stone-50"
                  >
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setIsNewTaskModalOpen(false)}
                  className="px-3 py-1.5 text-stone-600 hover:text-stone-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl shadow-xs transition-colors"
                >
                  Dispatch Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ALL AGENTS MODAL */}
      <AllAgentsModal
        isOpen={isAgentsModalOpen}
        onClose={() => setIsAgentsModalOpen(false)}
        agents={agents}
        onSelectAgent={(agent) => {
          setSelectedAgent(agent);
          setIsAgentsModalOpen(false);
        }}
      />

      {/* AGENT DETAILS MODAL */}
      <AgentDetailsModal
        agent={selectedAgent}
        onClose={() => setSelectedAgent(null)}
      />

      {/* NOTIFICATIONS & NEWS FEED MODAL */}
      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
        notifications={notifications}
        onMarkAllAsRead={() => {
          const updated = notifications.map((n) => ({ ...n, unread: false, read: true }));
          setNotifications(updated);
          apiClearAll();
          success('Notifications Cleared', 'All alerts marked as read.');
        }}
        initialTab={notificationsModalTab}
        newsArticles={globalArticles}
        isLoadingNews={isLoadingNews}
        isStaleNews={isNewsStale}
        onRefreshNews={refreshNews}
        selectedCountryCode={selectedCountryCode}
        onSelectCountry={selectCountry}
        readIds={readIds}
        deletedIds={deletedIds}
        bookmarkedRecords={bookmarkedRecords}
        bookmarkedIds={bookmarkedIds}
        onMarkRead={markRead}
        onMarkUnread={markUnread}
        onDeleteArticle={deleteArticle}
        onRestoreArticle={restoreArticle}
        onToggleBookmark={toggleBookmark}
      />

      {/* ANALYTICS & TELEMETRY MODAL */}
      <AnalyticsModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        metrics={{
          cpu: cpuUsage,
          memory: memoryUsage,
          gpu: gpuUsage,
          vram: vramUsage,
          gpuTemp: gpuTemp,
          uptime: uptimeStr,
          ramDetails: ramDetails,
          vramDetails: vramDetails,
        }}
      />

      {/* VECTOR MEMORY MODAL */}
      <MemoryModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
      />

      {/* PREFERENCES & SETTINGS MODAL */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      {/* DIAGNOSTICS PROBE MODAL */}
      <DiagnosticsModal
        isOpen={isDiagnosticsModalOpen}
        onClose={() => setIsDiagnosticsModalOpen(false)}
      />

      {/* TOP-LEVEL SECURITY PERMISSION MODAL */}
      <PermissionModal />
    </div>
  );
}

export default function SusiAiDashboard() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-screen items-center justify-center bg-stone-950 text-amber-400 font-mono text-sm">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-full bg-amber-500 animate-ping" />
            Loading SUSI AI Core...
          </div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}

