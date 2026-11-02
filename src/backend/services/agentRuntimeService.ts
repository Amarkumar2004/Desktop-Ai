import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';
import type { Json, AgentRun, AgentMessage, AgentMemory } from '@/backend/types/database';

export type WorkforceAgentId = 'SUSI' | 'SPY' | 'EURO' | 'LEX';
export type AgentMessageType = 'assignment' | 'status' | 'result' | 'handoff' | 'error' | 'note';

const LS_AGENT_RUNS = 'susi_agent_runs_v1';
const LS_AGENT_MESSAGES = 'susi_agent_messages_v1';

// In-memory local stores for offline / desktop anon mode
const memoryAgentRuns = new Map<string, AgentRun>();
const memoryAgentMessages = new Map<string, AgentMessage[]>();
const memoryAgentMemory = new Map<string, AgentMemory>();

// Hydrate from localStorage once on client
function hydrateLocalStores(): void {
  if (typeof window === 'undefined') return;
  try {
    const rawRuns = localStorage.getItem(LS_AGENT_RUNS);
    if (rawRuns) {
      const parsed: AgentRun[] = JSON.parse(rawRuns);
      parsed.forEach((r) => memoryAgentRuns.set(r.id, r));
    }
    const rawMsgs = localStorage.getItem(LS_AGENT_MESSAGES);
    if (rawMsgs) {
      const parsed: Record<string, AgentMessage[]> = JSON.parse(rawMsgs);
      Object.entries(parsed).forEach(([runId, msgs]) => memoryAgentMessages.set(runId, msgs));
    }
  } catch {
    // Ignore hydration parsing errors
  }
}

function persistLocalRuns(): void {
  if (typeof window === 'undefined') return;
  try {
    const all = Array.from(memoryAgentRuns.values());
    localStorage.setItem(LS_AGENT_RUNS, JSON.stringify(all));
  } catch {}
}

function persistLocalMessages(): void {
  if (typeof window === 'undefined') return;
  try {
    const obj: Record<string, AgentMessage[]> = {};
    memoryAgentMessages.forEach((msgs, runId) => {
      obj[runId] = msgs;
    });
    localStorage.setItem(LS_AGENT_MESSAGES, JSON.stringify(obj));
  } catch {}
}

// Initial hydration
hydrateLocalStores();

async function getContext() {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getUser();
    return { supabase, userId: data?.user?.id ?? null };
  } catch {
    return { supabase, userId: null };
  }
}

/**
 * Creates an agent run. Persists to Supabase if available, and guarantees local persistence.
 */
export async function createAgentRun(taskId: string, plan: Json = []): Promise<string> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newRun: AgentRun = {
    id: runId,
    task_id: taskId,
    user_id: null,
    manager_agent: 'SUSI',
    status: 'queued',
    plan,
    created_at: now,
    updated_at: now,
    completed_at: null,
  };

  const ctx = await getContext();
  if (ctx) {
    newRun.user_id = ctx.userId;
    try {
      const { data, error } = await ctx.supabase.from('agent_runs').insert({
        id: runId,
        task_id: taskId,
        user_id: ctx.userId,
        manager_agent: 'SUSI',
        status: 'queued',
        plan,
      }).select('id').single();

      if (!error && data?.id) {
        newRun.id = data.id;
      }
    } catch {
      // Supabase table pending migration or offline: fallback to memory/localStorage
    }
  }

  memoryAgentRuns.set(newRun.id, newRun);
  persistLocalRuns();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('susi-agent-run-updated', { detail: { run: newRun } }));
  }

  return newRun.id;
}

/**
 * Updates an existing agent run status, plan, and completion timestamp.
 */
export async function updateAgentRun(
  runId: string,
  patch: {
    status?: 'queued' | 'planning' | 'running' | 'completed' | 'failed' | 'cancelled';
    plan?: Json;
    completed?: boolean;
  }
): Promise<void> {
  const now = new Date().toISOString();
  const existing = memoryAgentRuns.get(runId);

  const updated: AgentRun = existing
    ? {
        ...existing,
        status: patch.status ?? existing.status,
        plan: patch.plan !== undefined ? patch.plan : existing.plan,
        updated_at: now,
        completed_at: patch.completed ? now : existing.completed_at,
      }
    : {
        id: runId,
        task_id: 'unknown',
        user_id: null,
        manager_agent: 'SUSI',
        status: patch.status ?? 'running',
        plan: patch.plan ?? [],
        created_at: now,
        updated_at: now,
        completed_at: patch.completed ? now : null,
      };

  memoryAgentRuns.set(runId, updated);
  persistLocalRuns();

  const ctx = await getContext();
  if (ctx) {
    try {
      const updatePayload: Partial<AgentRun> = {
        updated_at: now,
      };
      if (patch.status) updatePayload.status = patch.status;
      if (patch.plan !== undefined) updatePayload.plan = patch.plan;
      if (patch.completed) updatePayload.completed_at = now;

      await ctx.supabase.from('agent_runs').update(updatePayload).eq('id', runId);
    } catch {
      // Ignore if table not yet migrated
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('susi-agent-run-updated', { detail: { run: updated } }));
  }
}

/**
 * Records an inter-agent message or broadcast.
 */
export async function recordAgentMessage(input: {
  runId: string;
  taskId: string;
  fromAgent: WorkforceAgentId;
  toAgent?: WorkforceAgentId | 'ALL' | null;
  type: AgentMessageType;
  content: string;
  metadata?: Json;
}): Promise<AgentMessage> {
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const newMsg: AgentMessage = {
    id: msgId,
    run_id: input.runId,
    task_id: input.taskId,
    user_id: null,
    from_agent: input.fromAgent,
    to_agent: input.toAgent ?? null,
    message_type: input.type,
    content: input.content,
    metadata: input.metadata ?? {},
    created_at: now,
  };

  const ctx = await getContext();
  if (ctx) {
    newMsg.user_id = ctx.userId;
    try {
      const { data, error } = await ctx.supabase.from('agent_messages').insert({
        id: msgId,
        run_id: input.runId,
        task_id: input.taskId,
        user_id: ctx.userId,
        from_agent: input.fromAgent,
        to_agent: input.toAgent ?? null,
        message_type: input.type,
        content: input.content,
        metadata: input.metadata ?? {},
      }).select().single();

      if (!error && data) {
        newMsg.id = data.id;
      }
    } catch {
      // Local fallback
    }
  }

  const existingList = memoryAgentMessages.get(input.runId) || [];
  existingList.push(newMsg);
  memoryAgentMessages.set(input.runId, existingList);
  persistLocalMessages();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('susi-agent-message-added', { detail: { message: newMsg } }));
  }

  return newMsg;
}

/**
 * Retrieves an agent run by ID.
 */
export async function getAgentRun(runId: string): Promise<AgentRun | null> {
  const ctx = await getContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase.from('agent_runs').select('*').eq('id', runId).single();
      if (!error && data) {
        memoryAgentRuns.set(runId, data);
        return data;
      }
    } catch {}
  }
  return memoryAgentRuns.get(runId) || null;
}

/**
 * Retrieves all runs for a specific task.
 */
export async function getAgentRunsForTask(taskId: string): Promise<AgentRun[]> {
  const ctx = await getContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from('agent_runs')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        data.forEach((r: AgentRun) => memoryAgentRuns.set(r.id, r));
        return data;
      }
    } catch {}
  }
  return Array.from(memoryAgentRuns.values())
    .filter((r) => r.task_id === taskId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Retrieves all messages for a specific run.
 */
export async function getAgentMessages(runId: string): Promise<AgentMessage[]> {
  const ctx = await getContext();
  if (ctx) {
    try {
      const { data, error } = await ctx.supabase
        .from('agent_messages')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true });
      if (!error && data) {
        memoryAgentMessages.set(runId, data);
        return data;
      }
    } catch {}
  }
  return memoryAgentMessages.get(runId) || [];
}

/**
 * Saves agent knowledge/findings to agent_memory.
 */
export async function saveAgentMemory(agentId: WorkforceAgentId, memoryKey: string, content: Json): Promise<boolean> {
  const now = new Date().toISOString();
  const memKey = `${agentId}_${memoryKey}`;
  const memItem: AgentMemory = {
    id: `mem_${Date.now()}`,
    user_id: null,
    agent_id: agentId,
    memory_key: memoryKey,
    content,
    created_at: now,
    updated_at: now,
  };

  memoryAgentMemory.set(memKey, memItem);

  const ctx = await getContext();
  if (ctx) {
    memItem.user_id = ctx.userId;
    try {
      await ctx.supabase.from('agent_memory').upsert({
        user_id: ctx.userId,
        agent_id: agentId,
        memory_key: memoryKey,
        content,
        updated_at: now,
      }, { onConflict: 'user_id,agent_id,memory_key' });
    } catch {}
  }
  return true;
}

export interface AgentMemoryItem {
  memory_key: string;
  content: Json;
  updated_at?: string;
}

/**
 * Retrieves agent memory by key.
 */
export async function getAgentMemory(
  agentId: WorkforceAgentId,
  memoryKey?: string
): Promise<AgentMemoryItem[]> {
  const ctx = await getContext();
  if (ctx) {
    try {
      let query = ctx.supabase
        .from('agent_memory')
        .select('memory_key,content,updated_at')
        .eq('agent_id', agentId);
      if (memoryKey) query = query.eq('memory_key', memoryKey);
      const { data, error } = await query.order('updated_at', { ascending: false });
      if (!error && data) return data as AgentMemoryItem[];
    } catch {}
  }

  const results: AgentMemoryItem[] = [];
  memoryAgentMemory.forEach((val) => {
    if (val.agent_id === agentId && (!memoryKey || val.memory_key === memoryKey)) {
      results.push({
        memory_key: val.memory_key,
        content: val.content,
        updated_at: val.updated_at,
      });
    }
  });
  return results;
}
