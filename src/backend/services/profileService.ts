import type { Profile } from '../types/database';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

const DEFAULT_PROFILE: Profile = {
  id: 'local-user',
  email: 'commander@susi-ai.local',
  full_name: 'SUSI Commander',
  avatar_url: null,
  phone_number: null,
  role: 'owner',
  theme: 'dark',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

/**
 * Retrieves a user profile by ID from Supabase.
 */
export async function getProfileById(userId: string): Promise<Profile | null> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('[profileService] Error fetching profile:', error.message);
        throw new Error(`Failed to load profile: ${error.message} (${error.code})`);
      }

      if (data) {
        return data;
      }
    }
  }

  return { ...DEFAULT_PROFILE, id: userId };
}

/**
 * Updates an existing user profile in Supabase.
 */
export async function updateProfile(
  userId: string,
  updates: Partial<Profile>
): Promise<Profile> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        console.error('[profileService] Error updating profile:', error.message);
        throw new Error(`Failed to update profile: ${error.message} (${error.code})`);
      }

      return data;
    }
  }

  return { ...DEFAULT_PROFILE, ...updates, id: userId, updated_at: new Date().toISOString() };
}

/**
 * Upserts a profile record in Supabase.
 */
export async function upsertProfile(
  profile: Partial<Profile> & { id: string }
): Promise<Profile> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('profiles')
        .upsert(profile)
        .select()
        .single();

      if (error) {
        console.error('[profileService] Error upserting profile:', error.message);
        throw new Error(`Failed to save profile: ${error.message} (${error.code})`);
      }

      return data;
    }
  }

  return { ...DEFAULT_PROFILE, ...profile, updated_at: new Date().toISOString() };
}
