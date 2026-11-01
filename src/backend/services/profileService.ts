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

export async function getProfileById(userId: string): Promise<Profile | null> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        if (!error && data) {
          return data;
        }
      }
    } catch (err) {
      console.warn('[profileService] Supabase profile query fallback:', err);
    }
  }

  return { ...DEFAULT_PROFILE, id: userId };
}

export async function updateProfile(
  userId: string,
  updates: Partial<Profile>
): Promise<Profile | null> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      if (supabase) {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .update(updates)
          .eq('id', userId)
          .select()
          .single();
        if (!error && data) {
          return data;
        }
      }
    } catch (err) {
      console.warn('[profileService] Supabase profile update error:', err);
    }
  }

  return { ...DEFAULT_PROFILE, ...updates, id: userId, updated_at: new Date().toISOString() };
}
