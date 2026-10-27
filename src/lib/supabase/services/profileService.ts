import type { Profile } from '@/types/database';

/**
 * Profile Service
 * Safe placeholder service for user profiles.
 * Note: Database queries are stubbed until Supabase tables and policies are created.
 */

export async function getProfileById(_userId: string): Promise<Profile | null> {
  // FUTURE DATABASE QUERY:
  // const supabase = await createClient();
  // const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  // if (error) throw error;
  // return data;
  return null;
}

export async function updateProfile(
  _userId: string,
  _updates: Partial<Profile>
): Promise<Profile | null> {
  // FUTURE DATABASE QUERY:
  // const supabase = await createClient();
  // const { data, error } = await supabase.from('profiles').update(updates).eq('id', userId).select().single();
  // if (error) throw error;
  // return data;
  return null;
}
