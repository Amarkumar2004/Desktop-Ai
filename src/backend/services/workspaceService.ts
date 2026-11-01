import type { Workspace, WorkspaceMember } from '../types/database';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

const DEFAULT_WORKSPACE: Workspace = {
  id: 'default-workspace',
  name: 'SUSI Autonomous Command Hub',
  slug: 'susi-hub',
  owner_id: 'default-owner',
  plan: 'starter',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/**
 * Retrieves workspaces owned by the user or where the user is a member.
 */
export async function getUserWorkspaces(userId: string): Promise<Workspace[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .eq('owner_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[workspaceService] Error fetching workspaces from Supabase:', error.message);
        throw new Error(`Failed to load workspaces: ${error.message} (${error.code})`);
      }

      if (data) {
        return data;
      }
    }
  }

  return [DEFAULT_WORKSPACE];
}

/**
 * Creates a new workspace in Supabase.
 */
export async function createWorkspace(data: {
  name: string;
  slug: string;
  owner_id: string;
  plan?: 'starter' | 'pro' | 'enterprise';
}): Promise<Workspace> {
  const plan = data.plan || 'starter';

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data: created, error } = await supabase
        .from('workspaces')
        .insert({
          name: data.name,
          slug: data.slug,
          owner_id: data.owner_id,
          plan,
        })
        .select()
        .single();

      if (error) {
        console.error('[workspaceService] Error creating workspace:', error.message);
        throw new Error(`Failed to create workspace: ${error.message} (${error.code})`);
      }

      // Also create owner membership record
      await supabase.from('workspace_members').insert({
        workspace_id: created.id,
        user_id: data.owner_id,
        role: 'owner',
      });

      return created;
    }
  }

  return {
    id: `workspace-${Date.now()}`,
    name: data.name,
    slug: data.slug,
    owner_id: data.owner_id,
    plan,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Retrieves members of a specific workspace.
 */
export async function getWorkspaceMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('workspace_members')
        .select('*')
        .eq('workspace_id', workspaceId);

      if (error) {
        console.error('[workspaceService] Error fetching members:', error.message);
        throw new Error(`Failed to load workspace members: ${error.message} (${error.code})`);
      }

      if (data) {
        return data;
      }
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

/**
 * Adds a member to a workspace.
 */
export async function addWorkspaceMember(
  workspaceId: string,
  userId: string,
  role: 'owner' | 'admin' | 'member' | 'viewer' = 'member'
): Promise<WorkspaceMember> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('workspace_members')
        .insert({
          workspace_id: workspaceId,
          user_id: userId,
          role,
        })
        .select()
        .single();

      if (error) {
        console.error('[workspaceService] Error adding member:', error.message);
        throw new Error(`Failed to add workspace member: ${error.message} (${error.code})`);
      }

      return data;
    }
  }

  return {
    id: `member-${Date.now()}`,
    workspace_id: workspaceId,
    user_id: userId,
    role,
    joined_at: new Date().toISOString(),
  };
}
