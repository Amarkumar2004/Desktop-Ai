import type { UserSettings } from '../types/database';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

const STORAGE_KEY_SETTINGS = 'susi_ai_user_settings_v2';

const DEFAULT_SETTINGS: UserSettings = {
  user_id: 'local-user',
  theme: 'dark',
  voice_enabled: true,
  voice_provider: 'elevenlabs',
  selected_model: 'auto',
  auto_read: false,
  audio_vad_sensitivity: 'medium',
  preferences: {},
  updated_at: new Date().toISOString(),
};

export function getStoredUserSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    return JSON.parse(raw);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredUserSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('susi-settings-updated', { detail: { settings } }));
  } catch (err) {
    console.error('[userSettingsService] Failed to cache settings locally:', err);
  }
}

/**
 * Retrieves user settings from Supabase, falling back to local storage cache.
 */
export async function getUserSettings(userId: string): Promise<UserSettings> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) {
        console.error('[userSettingsService] Supabase settings query failed:', error.message);
        throw new Error(`Failed to load settings from database: ${error.message} (${error.code})`);
      }

      if (data) {
        saveStoredUserSettings(data);
        return data;
      }
    }
  }

  return getStoredUserSettings();
}

/**
 * Updates or inserts user settings in Supabase.
 */
export async function updateUserSettings(
  userId: string,
  settings: Partial<UserSettings>
): Promise<UserSettings> {
  const current = getStoredUserSettings();
  const merged: UserSettings = {
    ...current,
    ...settings,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { data, error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: userId,
          theme: merged.theme,
          voice_enabled: merged.voice_enabled,
          voice_provider: merged.voice_provider,
          selected_model: merged.selected_model,
          auto_read: merged.auto_read,
          audio_vad_sensitivity: merged.audio_vad_sensitivity,
          preferences: merged.preferences,
        })
        .select()
        .single();

      if (error) {
        console.error('[userSettingsService] Supabase settings update failed:', error.message);
        throw new Error(`Failed to update settings in database: ${error.message} (${error.code})`);
      }

      saveStoredUserSettings(data);
      return data;
    }
  }

  saveStoredUserSettings(merged);
  return merged;
}
