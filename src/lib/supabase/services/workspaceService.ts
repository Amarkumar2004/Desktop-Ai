import type { Workspace, WorkspaceMember } from '@/types/database';

/**
 * Workspace Service
 * Safe placeholder service for workspaces and workspace membership.
 * Note: Database queries are stubbed until Supabase tables and policies are created.
 */

export async function getUserWorkspaces(_userId: string): Promise<Workspace[]> {
  // FUTURE DATABASE QUERY:
  // const supabase = await createClient();
  // const { data, error } = await supabase.from('workspaces').select('*');
  // if (error) throw error;
  // return data || [];
  return [];
}

export async function getWorkspaceMembers(_workspaceId: string): Promise<WorkspaceMember[]> {
  // FUTURE DATABASE QUERY:
  // const supabase = await createClient();
  // const { data, error } = await supabase.from('workspace_members').select('*').eq('workspace_id', workspaceId);
  // if (error) throw error;
  // return data || [];
  return [];
}
