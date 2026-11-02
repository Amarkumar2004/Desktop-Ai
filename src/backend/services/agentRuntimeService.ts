import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';
import type { Json } from '@/backend/types/database';

export type WorkforceAgentId = 'SUSI' | 'SPY' | 'EURO' | 'LEX';
export type AgentMessageType = 'assignment' | 'status' | 'result' | 'handoff' | 'error' | 'note';

async function getContext() {
  if (!isSupabaseConfigured()) return null;
  const supabase = createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { supabase, userId: data.user.id };
}

/** Signed-in sessions persist to Supabase. Anonymous/offline sessions are not falsely reported as persisted. */
export async function createAgentRun(taskId: string, plan: Json = []): Promise<string | null> {
  const ctx = await getContext();
  if (!ctx) return null;
  const { data, error } = await ctx.supabase.from('agent_runs').insert({
    task_id: taskId, user_id: ctx.userId, manager_agent: 'SUSI', status: 'queued', plan,
  }).select('id').single();
  if (error) throw new Error('Agent run persistence failed: ' + error.message + ' (' + error.code + ')');
  return data.id;
}

export async function updateAgentRun(runId: string, patch: {
  status?: 'queued' | 'planning' | 'running' | 'completed' | 'failed' | 'cancelled';
  plan?: Json;
  completed?: boolean;
}): Promise<void> {
  const ctx = await getContext();
  if (!ctx) return;
  const update: Record<string, unknown> = {};
  if (patch.status) update.status = patch.status;
  if (patch.plan !== undefined) update.plan = patch.plan;
  if (patch.completed) update.completed_at = new Date().toISOString();
  const { error } = await ctx.supabase.from('agent_runs').update(update).eq('id', runId);
  if (error) throw new Error('Agent run update failed: ' + error.message + ' (' + error.code + ')');
}

export async function recordAgentMessage(input: {
  runId: string; taskId: string; fromAgent: WorkforceAgentId; toAgent?: WorkforceAgentId | 'ALL' | null;
  type: AgentMessageType; content: string; metadata?: Json;
}): Promise<boolean> {
  const ctx = await getContext();
  if (!ctx) return false;
  const { error } = await ctx.supabase.from('agent_messages').insert({
    run_id: input.runId, task_id: input.taskId, user_id: ctx.userId, from_agent: input.fromAgent,
    to_agent: input.toAgent ?? null, message_type: input.type, content: input.content, metadata: input.metadata ?? {},
  });
  if (error) throw new Error('Agent message persistence failed: ' + error.message + ' (' + error.code + ')');
  return true;
}

export async function saveAgentMemory(agentId: WorkforceAgentId, memoryKey: string, content: Json): Promise<boolean> {
  const ctx = await getContext();
  if (!ctx) return false;
  const { error } = await ctx.supabase.from('agent_memory').upsert({
    user_id: ctx.userId, agent_id: agentId, memory_key: memoryKey, content,
  }, { onConflict: 'user_id,agent_id,memory_key' });
  if (error) throw new Error('Agent memory persistence failed: ' + error.message + ' (' + error.code + ')');
  return true;
}

export async function getAgentMemory(agentId: WorkforceAgentId, memoryKey?: string) {
  const ctx = await getContext();
  if (!ctx) return [];
  let query = ctx.supabase.from('agent_memory').select('memory_key,content,updated_at').eq('agent_id', agentId);
  if (memoryKey) query = query.eq('memory_key', memoryKey);
  const { data, error } = await query.order('updated_at', { ascending: false });
  if (error) throw new Error('Agent memory read failed: ' + error.message + ' (' + error.code + ')');
  return data || [];
}
