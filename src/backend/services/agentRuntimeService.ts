import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';
import type { Json, AgentRun, AgentMessage, AgentMemory } from '@/backend/types/database';
import { scrubSensitiveString, scrubSensitiveData } from './credentialScrubber';

export type WorkforceAgentId = 'SUSI' | 'SPY' | 'EURO' | 'LEX';
export type AgentMessageType = 'assignment' | 'status' | 'result' | 'handoff' | 'error' | 'note';

const LS_AGENT_RUNS = 'susi_agent_runs_v1';
const LS_AGENT_MESSAGES = 'susi_agent_messages_v1';

// Internal types supporting per-installation local isolation
export interface IsolatedAgentRun extends AgentRun {
  installation_id?: string;
}

export interface IsolatedAgentMessage extends AgentMessage {
  installation_id?: string;
}

export interface IsolatedAgentMemory extends AgentMemory {
  installation_id?: string;
}

// In-memory local stores for offline / desktop anonymous mode
const memoryAgentRuns = new Map<string, IsolatedAgentRun>();
const memoryAgentMessages = new Map<string, IsolatedAgentMessage[]>();
const memoryAgentMemory = new Map<string, IsolatedAgentMemory>();

// Testing hooks
let overrideInstallationId: string | null = null;

export function setInstallationIdForTesting(id: string | null): void {
  overrideInstallationId = id;
}

export function resetLocalStoresForTesting(): void {
  memoryAgentRuns.clear();
  memoryAgentMessages.clear();
  memoryAgentMemory.clear();
}

function getDesktopSecret(): string {
  if (typeof window === 'undefined') {
    try {
      // Dynamic require on Node.js runtime only to avoid browser bundling issues
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getBootstrapToken } = require('@/lib/security/desktopAuth');
      return getBootstrapToken();
    } catch {
      return process.env.SUSI_BOOTSTRAP_SECRET || 'server_node_installation';
    }
  }
  return '';
}

/**
 * Returns the cryptographically verified installation ID.
 * On server/desktop, securely hashed from the local desktop bootstrap token.
 */
export function getVerifiedInstallationId(): string {
  if (overrideInstallationId) {
    return overrideInstallationId;
  }
  if (typeof window === 'undefined') {
    try {
      const secret = getDesktopSecret();
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeCrypto = require('crypto');
      return nodeCrypto.createHash('sha256').update(`installation_identity:${secret}`).digest('hex').substring(0, 32);
    } catch {
      return 'desktop_local_installation';
    }
  }
  try {
    let localId = localStorage.getItem('susi_installation_id');
    if (!localId) {
      localId = `inst_${Math.random().toString(36).substring(2, 12)}`;
      localStorage.setItem('susi_installation_id', localId);
    }
    return localId;
  } catch {
    return 'desktop_local_installation';
  }
}

/**
 * Validates that a client-provided installation ID genuinely belongs to this desktop installation.
 * Uses constant-time comparison to prevent timing side channels.
 */
export function validateInstallationOwnership(providedId: string): boolean {
  if (!providedId || typeof providedId !== 'string') return false;
  const verified = getVerifiedInstallationId();
  if (providedId.length !== verified.length) return false;
  let mismatch = 0;
  for (let i = 0; i < providedId.length; i++) {
    mismatch |= providedId.charCodeAt(i) ^ verified.charCodeAt(i);
  }
  return mismatch === 0;
}

// Hydrate from localStorage once on client
function hydrateLocalStores(): void {
  if (typeof window === 'undefined') return;
  try {
    const rawRuns = localStorage.getItem(LS_AGENT_RUNS);
    if (rawRuns) {
      const parsed: IsolatedAgentRun[] = JSON.parse(rawRuns);
      parsed.forEach((r) => memoryAgentRuns.set(r.id, r));
    }
    const rawMsgs = localStorage.getItem(LS_AGENT_MESSAGES);
    if (rawMsgs) {
      const parsed: Record<string, IsolatedAgentMessage[]> = JSON.parse(rawMsgs);
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
    const obj: Record<string, IsolatedAgentMessage[]> = {};
    memoryAgentMessages.forEach((msgs, runId) => {
      obj[runId] = msgs;
    });
    localStorage.setItem(LS_AGENT_MESSAGES, JSON.stringify(obj));
  } catch {}
}

// Initial hydration
hydrateLocalStores();

/**
 * Returns authenticated Supabase client context.
 * In anonymous/unauthenticated mode, returns null so data remains strictly local to this installation.
 */
async function getAuthenticatedContext() {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user?.id) {
      // Unauthenticated / Anonymous mode: keep data strictly local to prevent cross-installation leaking
      return null;
    }
    return { supabase, userId: data.user.id };
  } catch {
    return null;
  }
}

/**
 * Creates an agent run. Persists to Supabase if authenticated, or keeps strictly local to this installation if anonymous.
 */
export async function createAgentRun(taskId: string, plan: Json = []): Promise<string> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const currentInstallation = getVerifiedInstallationId();

  const newRun: IsolatedAgentRun = {
    id: runId,
    task_id: taskId,
    user_id: null,
    manager_agent: 'SUSI',
    status: 'queued',
    plan,
    created_at: now,
    updated_at: now,
    completed_at: null,
    installation_id: currentInstallation,
  };

  const authCtx = await getAuthenticatedContext();
  if (authCtx) {
    newRun.user_id = authCtx.userId;
    const { data, error } = await authCtx.supabase.from('agent_runs').insert({
      id: runId,
      task_id: taskId,
      user_id: authCtx.userId,
      manager_agent: 'SUSI',
      status: 'queued',
      plan,
    }).select('id').single();

    if (error) {
      console.error(`[agentRuntimeService] Supabase agent_runs insert failed: ${error.message} (${error.code})`);
      throw new Error(`Failed to persist agent run to database: ${error.message} (${error.code})`);
    }

    if (data?.id) {
      newRun.id = data.id;
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
  const currentInstallation = getVerifiedInstallationId();
  const existing = memoryAgentRuns.get(runId);

  // If existing run belongs to a different installation in anonymous mode, reject mutation
  if (existing && existing.installation_id && existing.installation_id !== currentInstallation) {
    throw new Error('Access denied: Cannot modify agent run belonging to another installation.');
  }

  const updated: IsolatedAgentRun = existing
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
        installation_id: currentInstallation,
      };

  const authCtx = await getAuthenticatedContext();
  if (authCtx) {
    const updatePayload: Partial<AgentRun> = {
      updated_at: now,
    };
    if (patch.status) updatePayload.status = patch.status;
    if (patch.plan !== undefined) updatePayload.plan = patch.plan;
    if (patch.completed) updatePayload.completed_at = now;

    const { error } = await authCtx.supabase.from('agent_runs').update(updatePayload).eq('id', runId);
    if (error) {
      console.error(`[agentRuntimeService] Supabase agent_runs update failed: ${error.message} (${error.code})`);
      throw new Error(`Failed to update agent run in database: ${error.message} (${error.code})`);
    }
  }

  memoryAgentRuns.set(runId, updated);
  persistLocalRuns();

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('susi-agent-run-updated', { detail: { run: updated } }));
  }
}

/**
 * Records an inter-agent message or broadcast with credential scrubbing and per-installation isolation.
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
  const currentInstallation = getVerifiedInstallationId();

  // Scrub any sensitive credentials from content and metadata
  const scrubbedContent = scrubSensitiveString(input.content);
  const scrubbedMetadata = scrubSensitiveData((input.metadata ?? {}) as Record<string, unknown>) as Json;

  const newMsg: IsolatedAgentMessage = {
    id: msgId,
    run_id: input.runId,
    task_id: input.taskId,
    user_id: null,
    from_agent: input.fromAgent,
    to_agent: input.toAgent ?? null,
    message_type: input.type,
    content: scrubbedContent,
    metadata: scrubbedMetadata,
    created_at: now,
    installation_id: currentInstallation,
  };

  const authCtx = await getAuthenticatedContext();
  if (authCtx) {
    newMsg.user_id = authCtx.userId;
    const { data, error } = await authCtx.supabase.from('agent_messages').insert({
      id: msgId,
      run_id: input.runId,
      task_id: input.taskId,
      user_id: authCtx.userId,
      from_agent: input.fromAgent,
      to_agent: input.toAgent ?? null,
      message_type: input.type,
      content: scrubbedContent,
      metadata: scrubbedMetadata,
    }).select().single();

    if (error) {
      console.error(`[agentRuntimeService] Supabase agent_messages insert failed: ${error.message} (${error.code})`);
      throw new Error(`Failed to persist agent message to database: ${error.message} (${error.code})`);
    } else if (data) {
      newMsg.id = data.id;
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
 * Retrieves an agent run by ID, enforcing installation isolation for anonymous sessions.
 */
export async function getAgentRun(runId: string): Promise<AgentRun | null> {
  const authCtx = await getAuthenticatedContext();
  if (authCtx) {
    const { data, error } = await authCtx.supabase
      .from('agent_runs')
      .select('*')
      .eq('id', runId)
      .eq('user_id', authCtx.userId)
      .single();

    if (!error && data) {
      memoryAgentRuns.set(runId, data);
      return data;
    }
    return null;
  }

  // Anonymous desktop mode: strictly isolated to current installation
  const currentInstallation = getVerifiedInstallationId();
  const run = memoryAgentRuns.get(runId);
  if (run && (!run.installation_id || run.installation_id === currentInstallation)) {
    return run;
  }
  return null;
}

/**
 * Retrieves all runs for a specific task with installation isolation.
 */
export async function getAgentRunsForTask(taskId: string): Promise<AgentRun[]> {
  const authCtx = await getAuthenticatedContext();
  if (authCtx) {
    const { data, error } = await authCtx.supabase
      .from('agent_runs')
      .select('*')
      .eq('task_id', taskId)
      .eq('user_id', authCtx.userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      data.forEach((r: AgentRun) => memoryAgentRuns.set(r.id, r));
      return data;
    }
    return [];
  }

  const currentInstallation = getVerifiedInstallationId();
  return Array.from(memoryAgentRuns.values())
    .filter((r) => r.task_id === taskId && (!r.installation_id || r.installation_id === currentInstallation))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * Retrieves all messages for a specific run.
 */
export async function getAgentMessages(runId: string): Promise<AgentMessage[]> {
  const authCtx = await getAuthenticatedContext();
  if (authCtx) {
    const { data, error } = await authCtx.supabase
      .from('agent_messages')
      .select('*')
      .eq('run_id', runId)
      .eq('user_id', authCtx.userId)
      .order('created_at', { ascending: true });

    if (!error && data) {
      memoryAgentMessages.set(runId, data);
      return data;
    }
    return [];
  }

  const currentInstallation = getVerifiedInstallationId();
  const messages = memoryAgentMessages.get(runId) || [];
  return messages.filter((m) => !m.installation_id || m.installation_id === currentInstallation);
}

/**
 * Saves agent knowledge/findings to agent_memory with credential scrubbing.
 */
export async function saveAgentMemory(agentId: WorkforceAgentId, memoryKey: string, content: Json): Promise<boolean> {
  const now = new Date().toISOString();
  const currentInstallation = getVerifiedInstallationId();
  const scrubbedContent = scrubSensitiveData(content as Record<string, unknown>) as Json;

  const memKey = `${currentInstallation}_${agentId}_${memoryKey}`;
  const memItem: IsolatedAgentMemory = {
    id: `mem_${Date.now()}`,
    user_id: null,
    agent_id: agentId,
    memory_key: memoryKey,
    content: scrubbedContent,
    created_at: now,
    updated_at: now,
    installation_id: currentInstallation,
  };

  const authCtx = await getAuthenticatedContext();
  if (authCtx) {
    memItem.user_id = authCtx.userId;
    const { error } = await authCtx.supabase.from('agent_memory').upsert({
      user_id: authCtx.userId,
      agent_id: agentId,
      memory_key: memoryKey,
      content: scrubbedContent,
      updated_at: now,
    }, { onConflict: 'user_id,agent_id,memory_key' });

    if (error) {
      console.error(`[agentRuntimeService] Supabase agent_memory upsert failed: ${error.message} (${error.code})`);
      throw new Error(`Failed to persist agent memory to database: ${error.message} (${error.code})`);
    }
  }

  memoryAgentMemory.set(memKey, memItem);
  return true;
}

export interface AgentMemoryItem {
  memory_key: string;
  content: Json;
  updated_at?: string;
}

/**
 * Retrieves agent memory by key with installation isolation.
 */
export async function getAgentMemory(
  agentId: WorkforceAgentId,
  memoryKey?: string
): Promise<AgentMemoryItem[]> {
  const authCtx = await getAuthenticatedContext();
  if (authCtx) {
    let query = authCtx.supabase
      .from('agent_memory')
      .select('memory_key,content,updated_at')
      .eq('agent_id', agentId)
      .eq('user_id', authCtx.userId);
    if (memoryKey) query = query.eq('memory_key', memoryKey);
    const { data, error } = await query.order('updated_at', { ascending: false });
    if (!error && data) return data as AgentMemoryItem[];
    return [];
  }

  const currentInstallation = getVerifiedInstallationId();
  const results: AgentMemoryItem[] = [];
  memoryAgentMemory.forEach((val) => {
    if (
      val.agent_id === agentId &&
      (!val.installation_id || val.installation_id === currentInstallation) &&
      (!memoryKey || val.memory_key === memoryKey)
    ) {
      results.push({
        memory_key: val.memory_key,
        content: val.content,
        updated_at: val.updated_at,
      });
    }
  });
  return results;
}
