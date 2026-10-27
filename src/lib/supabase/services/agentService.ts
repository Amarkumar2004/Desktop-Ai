import type { Agent, AgentEvent } from '@/types/database';

/**
 * Agent Service
 * Safe placeholder service for AI agents and agent activity events.
 * Note: Database queries are stubbed until Supabase tables and policies are created.
 */

export async function getAgents(_workspaceId?: string): Promise<Agent[]> {
  // FUTURE DATABASE QUERY:
  // const supabase = await createClient();
  // let query = supabase.from('agents').select('*');
  // if (workspaceId) query = query.eq('workspace_id', workspaceId);
  // const { data, error } = await query;
  // if (error) throw error;
  // return data || [];
  return [];
}

export async function getAgentEvents(_agentId?: string): Promise<AgentEvent[]> {
  // FUTURE DATABASE QUERY:
  // const supabase = await createClient();
  // let query = supabase.from('agent_events').select('*').order('created_at', { ascending: false });
  // if (agentId) query = query.eq('agent_id', agentId);
  // const { data, error } = await query;
  // if (error) throw error;
  // return data || [];
  return [];
}
