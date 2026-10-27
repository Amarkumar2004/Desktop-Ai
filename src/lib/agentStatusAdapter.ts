'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Agent, TaskItem, AgentStatus } from '@/types/dashboard';
import { getStoredAgents } from '@/backend/services/agentService';
import { getStoredTasks } from '@/backend/services/taskService';

export type ResolvedAgentStatus = 'online' | 'busy' | 'idle' | 'offline';

export interface AgentStatusCounts {
  online: number;
  busy: number;
  idle: number;
  offline: number;
  total: number;
  isLive: boolean;
}

export interface AgentStatusAdapterOptions {
  /** If explicitly disconnected (e.g. system is in offline AI mode) */
  isDisconnected?: boolean;
  /** Configured heartbeat timeout threshold in milliseconds (optional) */
  heartbeatTimeoutMs?: number;
}

/**
 * Checks if a given agent currently has an active, incomplete task.
 */
export function hasActiveTask(agent: Agent, tasks: TaskItem[]): boolean {
  const agentName = (agent.name || '').toLowerCase();
  const agentId = (agent.id || '').toLowerCase();

  return tasks.some((t) => {
    if (t.completed || (t.progress !== undefined && t.progress >= 100)) {
      return false;
    }
    const assigned = (t.assignedAgent || '').toLowerCase();
    return assigned === agentName || assigned === agentId;
  });
}

/**
 * Checks if the agent has a configured heartbeat that has expired.
 * Only validates heartbeat timestamps if they are genuinely present on the agent object.
 * NEVER fabricates or invents missing heartbeat data.
 */
export function isHeartbeatExpired(
  agent: Agent,
  now: number = Date.now(),
  configuredTimeoutMs?: number
): boolean {
  const candidate = agent as unknown as Record<string, unknown>;
  const heartbeat = candidate.lastHeartbeat ?? candidate.heartbeatTimestamp ?? candidate.lastSeen;
  const timeout = configuredTimeoutMs ?? (typeof candidate.heartbeatTimeoutMs === 'number' ? candidate.heartbeatTimeoutMs : undefined);

  if (typeof heartbeat === 'number' && typeof timeout === 'number') {
    return now - heartbeat > timeout;
  }
  return false;
}

/**
 * Resolves the deterministic semantic status of a single agent:
 * - OFFLINE: disconnected, marked offline, or exceeded configured heartbeat timeout.
 * - BUSY: connected and currently has an active task.
 * - IDLE: connected with no active task (waiting / idle / unassigned).
 * - ONLINE: connected and available for assignments.
 */
export function resolveAgentStatus(
  agent: Agent,
  tasks: TaskItem[],
  options?: AgentStatusAdapterOptions
): ResolvedAgentStatus {
  // 1. Check OFFLINE: disconnected, marked offline, or heartbeat expired
  if (options?.isDisconnected) {
    return 'offline';
  }

  const rawStatus = (agent.status || '').toLowerCase();
  if (rawStatus === 'offline') {
    return 'offline';
  }

  if (isHeartbeatExpired(agent, Date.now(), options?.heartbeatTimeoutMs)) {
    return 'offline';
  }

  // 2. Check BUSY: connected and currently has an active task
  const activeTaskPresent = hasActiveTask(agent, tasks);
  if (activeTaskPresent) {
    return 'busy';
  }
  if (rawStatus === 'busy' && tasks.length === 0) {
    return 'busy';
  }

  // 3. Check IDLE: connected with no active task in idle state
  if (rawStatus === 'idle') {
    return 'idle';
  }

  // 4. ONLINE: real registered agent/service is connected and available
  return 'online';
}

/**
 * Counts each agent in the population exactly once, guaranteeing total consistency:
 * online + busy + idle + offline === total.
 */
export function computeAgentStatusCounts(
  agents: Agent[] = [],
  tasks: TaskItem[] = [],
  options?: AgentStatusAdapterOptions
): AgentStatusCounts {
  let online = 0;
  let busy = 0;
  let idle = 0;
  let offline = 0;

  for (const agent of agents) {
    const status = resolveAgentStatus(agent, tasks, options);
    switch (status) {
      case 'online':
        online += 1;
        break;
      case 'busy':
        busy += 1;
        break;
      case 'idle':
        idle += 1;
        break;
      case 'offline':
        offline += 1;
        break;
    }
  }

  const total = online + busy + idle + offline;

  return {
    online,
    busy,
    idle,
    offline,
    total,
    isLive: agents.length > 0,
  };
}

/**
 * Reactive hook for observing agent statuses across localStorage updates,
 * task queue modifications, and custom events.
 */
export function useLiveAgentStatus(
  passedAgents?: Agent[],
  passedTasks?: TaskItem[],
  options?: AgentStatusAdapterOptions
): AgentStatusCounts {
  const [internalAgents, setInternalAgents] = useState<Agent[]>(() => {
    if (passedAgents && passedAgents.length > 0) return passedAgents;
    return getStoredAgents();
  });

  const [internalTasks, setInternalTasks] = useState<TaskItem[]>(() => {
    if (passedTasks) return passedTasks;
    return getStoredTasks();
  });

  // Sync when props change
  useEffect(() => {
    if (passedAgents) {
      setInternalAgents(passedAgents);
    }
  }, [passedAgents]);

  useEffect(() => {
    if (passedTasks) {
      setInternalTasks(passedTasks);
    }
  }, [passedTasks]);

  // Listen to lifecycle events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleSync = () => {
      if (!passedAgents) {
        setInternalAgents(getStoredAgents());
      }
      if (!passedTasks) {
        setInternalTasks(getStoredTasks());
      }
    };

    window.addEventListener('storage', handleSync);
    window.addEventListener('susi-agents-updated', handleSync);
    window.addEventListener('susi-tasks-updated', handleSync);

    return () => {
      window.removeEventListener('storage', handleSync);
      window.removeEventListener('susi-agents-updated', handleSync);
      window.removeEventListener('susi-tasks-updated', handleSync);
    };
  }, [passedAgents, passedTasks]);

  const activeAgents = passedAgents ?? internalAgents;
  const activeTasks = passedTasks ?? internalTasks;

  return useMemo(() => {
    return computeAgentStatusCounts(activeAgents, activeTasks, options);
  }, [activeAgents, activeTasks, options?.isDisconnected, options?.heartbeatTimeoutMs]);
}
