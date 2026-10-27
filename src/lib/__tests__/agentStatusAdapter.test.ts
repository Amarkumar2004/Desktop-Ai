import { describe, it, expect } from 'vitest';
import {
  resolveAgentStatus,
  computeAgentStatusCounts,
  hasActiveTask,
  isHeartbeatExpired,
} from '../agentStatusAdapter';
import type { Agent, TaskItem } from '@/types/dashboard';

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'lex',
    name: 'LEX',
    role: 'Research & Intelligence',
    title: 'Lead Synthesizer',
    status: 'Online',
    color: '#8B5CF6',
    accentColor: 'rgb(139, 92, 246)',
    bgLight: 'bg-purple-50',
    borderLight: 'border-purple-200',
    textColor: 'text-purple-700',
    avatarSeed: 'lex_avatar',
    room: 'research-lab',
    specialty: 'Reasoning',
    efficiency: 98,
    memoryUsage: '3.4 GB',
    taskCount: 0,
    currentTask: 'Ready for assignment',
    level: 1,
    coordinates: { x: 380, y: 155 },
    ...overrides,
  };
}

function makeTask(overrides: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 'task-1',
    title: 'Analyze Vector Space',
    assignedAgent: 'LEX',
    progress: 50,
    priority: 'High',
    category: 'Analytics',
    completed: false,
    ...overrides,
  };
}

describe('Agent Status Adapter (Task 2)', () => {
  describe('Semantic Status Resolution', () => {
    it('resolves BUSY when an agent has an active, incomplete task', () => {
      const agent = makeAgent({ id: 'lex', name: 'LEX', status: 'Online' });
      const tasks = [makeTask({ assignedAgent: 'LEX', progress: 40, completed: false })];

      const status = resolveAgentStatus(agent, tasks);
      expect(status).toBe('busy');
    });

    it('resolves ONLINE when a connected agent has no active tasks and is available', () => {
      const agent = makeAgent({ id: 'lex', name: 'LEX', status: 'Online', currentTask: 'Active telemetry standby' });
      const tasks = [makeTask({ assignedAgent: 'LEX', progress: 100, completed: true })];

      const status = resolveAgentStatus(agent, tasks);
      expect(status).toBe('online');
    });

    it('resolves IDLE when a connected agent has no active tasks and is in idle/awaiting state', () => {
      const agent = makeAgent({
        id: 'yoru',
        name: 'YORU',
        status: 'Idle',
        currentTask: 'Awaiting Next Design Generation Queue Request',
      });
      const tasks: TaskItem[] = [];

      const status = resolveAgentStatus(agent, tasks);
      expect(status).toBe('idle');
    });

    it('resolves OFFLINE when agent status is explicitly Offline', () => {
      const agent = makeAgent({ status: 'Offline' });
      const tasks: TaskItem[] = [];

      const status = resolveAgentStatus(agent, tasks);
      expect(status).toBe('offline');
    });

    it('resolves OFFLINE when system is disconnected (e.g. offline AI mode)', () => {
      const agent = makeAgent({ status: 'Online' });
      const tasks: TaskItem[] = [];

      const status = resolveAgentStatus(agent, tasks, { isDisconnected: true });
      expect(status).toBe('offline');
    });
  });

  describe('Heartbeat Timeout Handling', () => {
    it('does NOT invent heartbeat data when agent does not supply it', () => {
      const agent = makeAgent();
      expect(isHeartbeatExpired(agent)).toBe(false);
    });

    it('marks agent OFFLINE when a supplied heartbeat timestamp exceeds the timeout', () => {
      const now = Date.now();
      const expiredAgent = makeAgent({
        ...({
          lastHeartbeat: now - 120_000, // 2 minutes ago
          heartbeatTimeoutMs: 60_000,   // 1 minute timeout
        } as any),
      });

      expect(isHeartbeatExpired(expiredAgent, now)).toBe(true);
      expect(resolveAgentStatus(expiredAgent, [], {})).toBe('offline');
    });

    it('keeps agent connected when heartbeat is within threshold', () => {
      const now = Date.now();
      const freshAgent = makeAgent({
        ...({
          lastHeartbeat: now - 5_000,
          heartbeatTimeoutMs: 60_000,
        } as any),
      });

      expect(isHeartbeatExpired(freshAgent, now)).toBe(false);
      expect(resolveAgentStatus(freshAgent, [], {})).toBe('online');
    });
  });

  describe('Population Counting & Consistency', () => {
    it('counts each agent exactly once and ensures totals match population', () => {
      const agents: Agent[] = [
        makeAgent({ id: 'lex', name: 'LEX', status: 'Online' }), // busy with task
        makeAgent({ id: 'susi', name: 'SUSI', status: 'Online' }), // online (no tasks)
        makeAgent({ id: 'yoru', name: 'YORU', status: 'Idle', currentTask: 'Awaiting queue' }), // idle
        makeAgent({ id: 'spy', name: 'SPY', status: 'Offline' }), // offline
      ];

      const tasks: TaskItem[] = [
        makeTask({ id: 't1', assignedAgent: 'LEX', progress: 50, completed: false }),
      ];

      const counts = computeAgentStatusCounts(agents, tasks);

      expect(counts.busy).toBe(1); // LEX
      expect(counts.online).toBe(1); // SUSI
      expect(counts.idle).toBe(1); // YORU
      expect(counts.offline).toBe(1); // SPY
      expect(counts.total).toBe(4);
      expect(counts.online + counts.busy + counts.idle + counts.offline).toBe(counts.total);
      expect(counts.isLive).toBe(true);
    });

    it('handles empty population without fabricating hardcoded 18/4/2/0 values', () => {
      const counts = computeAgentStatusCounts([], []);
      expect(counts.online).toBe(0);
      expect(counts.busy).toBe(0);
      expect(counts.idle).toBe(0);
      expect(counts.offline).toBe(0);
      expect(counts.total).toBe(0);
      expect(counts.isLive).toBe(false);
    });

    it('reactively shifts an agent from BUSY to ONLINE when task is completed', () => {
      const agent = makeAgent({ id: 'lex', name: 'LEX', status: 'Online' });
      const inProgressTask = makeTask({ id: 't1', assignedAgent: 'LEX', progress: 60, completed: false });

      // Before completion
      const before = computeAgentStatusCounts([agent], [inProgressTask]);
      expect(before.busy).toBe(1);
      expect(before.online).toBe(0);

      // After completion
      const completedTask = { ...inProgressTask, progress: 100, completed: true };
      const after = computeAgentStatusCounts([agent], [completedTask]);
      expect(after.busy).toBe(0);
      expect(after.online).toBe(1);
      expect(after.total).toBe(1);
    });
  });
});
