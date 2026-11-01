import type { Workspace, WorkspaceMember } from '../types/database';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

const DEFAULT_WORKSPACE: Workspace = {
  id: 'default-workspace',
  name: 'SUSI Autonomous Command Hub',
  slug: 'susi-hub',
  owner_id: 'default-owner',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

export async function getUserWorkspaces(userId: string): Promise<Workspace[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('workspaces')
          .select('*')
          .eq('owner_id', userId);
        if (!error && data && data.length > 0) {
          return data;
        }
      }
    } catch (err) {
      console.warn('[workspaceService] Supabase fetch fallback to default workspace:', err);
    }
  }

  return [DEFAULT_WORKSPACE];
}

export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('workspace_members')
          .select('*')
          .eq('workspace_id', workspaceId);
        if (!error && data) {
          return data;
        }
      }
    } catch (err) {
      console.warn('[workspaceService] Supabase members fetch notice:', err);
    }
  }

  return [
    {
      id: 'default-member-1',
      workspace_id: workspaceId,
      user_id: 'default-owner',
      role: 'owner',
      joined_at: new Date().toISOString(),
    },
  ];
}
