import type { ProviderConnection } from '../types/database';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

/**
 * Lists configured AI provider connection metadata for a user.
 * Note: Does not contain raw API keys. Keys remain safely sealed in Windows Credential Manager.
 */
export async function listProviderConnections(
  userId: string
): Promise<ProviderConnection[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('provider_connections')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('[providerConnectionService] Error fetching provider metadata:', error.message);
        throw new Error(`Failed to load provider connections: ${error.message} (${error.code})`);
      }

      return data || [];
    }
  }

  return [];
}

/**
 * Saves AI provider connection metadata (non-sensitive) to Supabase.
 * Any raw credential fields are strictly omitted.
 */
export async function saveProviderConnection(
  connection: Omit<ProviderConnection, 'created_at' | 'updated_at'> & {
    created_at?: string;
    updated_at?: string;
  }
): Promise<ProviderConnection> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('provider_connections')
        .upsert({
          id: connection.id,
          user_id: connection.user_id,
          provider: connection.provider,
          provider_label: connection.provider_label,
          display_name: connection.display_name || null,
          masked_key_suffix: connection.masked_key_suffix,
          base_url: connection.base_url || null,
          selected_model: connection.selected_model,
          available_models: connection.available_models || [],
          status: connection.status,
          capabilities: connection.capabilities || { voice: true, chat: true, code: true },
        })
        .select()
        .single();

      if (error) {
        console.error('[providerConnectionService] Error saving provider connection:', error.message);
        throw new Error(`Failed to save provider metadata: ${error.message} (${error.code})`);
      }

      return data;
    }
  }

  return {
    ...connection,
    created_at: connection.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/**
 * Deletes provider connection metadata from Supabase.
 */
export async function deleteProviderConnection(
  connectionId: string,
  userId: string
): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { error } = await supabase
        .from('provider_connections')
        .delete()
        .eq('id', connectionId)
        .eq('user_id', userId);

      if (error) {
        console.error('[providerConnectionService] Error deleting provider metadata:', error.message);
        throw new Error(`Failed to delete provider metadata: ${error.message} (${error.code})`);
      }

      return true;
    }
  }

  return true;
}
