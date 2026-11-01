import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSupabaseUrl,
  getSupabaseAnonKey,
  isSupabaseConfigured,
  getSupabaseConfigStatus,
  createClient,
} from '../supabase/client';
import { createServiceRoleClient } from '../supabase/server';
import { getTasks, createTask, updateTask, deleteTask } from '../services/taskService';
import { getUserWorkspaces, createWorkspace } from '../services/workspaceService';
import { getProfileById, updateProfile } from '../services/profileService';
import { getUserSettings, updateUserSettings } from '../services/userSettingsService';

describe('Supabase Client & Environment Resolution', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('detects unconfigured state when environment variables are missing', () => {
    expect(isSupabaseConfigured()).toBe(false);
    const status = getSupabaseConfigStatus();
    expect(status.configured).toBe(false);
    expect(status.hasUrl).toBe(false);
    expect(status.hasKey).toBe(false);
    expect(status.keyType).toBeUndefined();
    expect(createClient()).toBeNull();
  });

  it('resolves standard NEXT_PUBLIC_SUPABASE_ANON_KEY', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key-12345';

    expect(isSupabaseConfigured()).toBe(true);
    expect(getSupabaseUrl()).toBe('https://test-project.supabase.co');
    expect(getSupabaseAnonKey()).toBe('test-anon-key-12345');

    const status = getSupabaseConfigStatus();
    expect(status.configured).toBe(true);
    expect(status.hasUrl).toBe(true);
    expect(status.hasKey).toBe(true);
    expect(status.keyType).toBe('anon');
  });

  it('supports legacy NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY seamlessly', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://legacy-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'legacy-publishable-key-67890';

    expect(isSupabaseConfigured()).toBe(true);
    expect(getSupabaseAnonKey()).toBe('legacy-publishable-key-67890');

    const status = getSupabaseConfigStatus();
    expect(status.configured).toBe(true);
    expect(status.keyType).toBe('publishable');
  });

  it('prefers standard NEXT_PUBLIC_SUPABASE_ANON_KEY over publishable key', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://dual-project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'standard-anon-key';
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'older-publishable-key';

    expect(getSupabaseAnonKey()).toBe('standard-anon-key');
    const status = getSupabaseConfigStatus();
    expect(status.keyType).toBe('anon');
  });

  it('createServiceRoleClient initializes only with SUPABASE_SERVICE_ROLE_KEY', () => {
    // Missing service role key returns null
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test-project.supabase.co';
    expect(createServiceRoleClient()).toBeNull();

    // With service role key returns valid client
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'secret-service-role-key-999';
    const adminClient = createServiceRoleClient();
    expect(adminClient).not.toBeNull();
  });
});

describe('Database Services Local Fallback & Cloud Separation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('taskService operates with local fallback when Supabase is not configured', async () => {
    expect(isSupabaseConfigured()).toBe(false);

    // Read initial tasks
    const tasks = await getTasks();
    expect(Array.isArray(tasks)).toBe(true);

    // Create a new task locally
    const testTitle = `Unit Test Task ${Date.now()}`;
    const created = await createTask({
      title: testTitle,
      assignedAgent: 'SUSI',
      priority: 'High',
      category: 'Operations',
    });
    expect(created.title).toBe(testTitle);
    expect(created.completed).toBe(false);

    // Update the task
    const updated = await updateTask(created.id, { progress: 100 });
    expect(updated?.completed).toBe(true);
    expect(updated?.progress).toBe(100);

    // Delete the task
    const deleted = await deleteTask(created.id);
    expect(deleted).toBe(true);
  });

  it('workspaceService falls back to default workspace when Supabase is not configured', async () => {
    expect(isSupabaseConfigured()).toBe(false);

    const workspaces = await getUserWorkspaces('test-user');
    expect(workspaces.length).toBeGreaterThan(0);
    expect(workspaces[0].name).toContain('SUSI');
    expect(workspaces[0].plan).toBe('starter');

    const created = await createWorkspace({
      name: 'Custom Team',
      slug: 'custom-team',
      owner_id: 'test-user',
    });
    expect(created.name).toBe('Custom Team');
  });

  it('profileService falls back to default profile when Supabase is not configured', async () => {
    expect(isSupabaseConfigured()).toBe(false);

    const profile = await getProfileById('user_abc');
    expect(profile).not.toBeNull();
    expect(profile?.id).toBe('user_abc');
    expect(profile?.role).toBe('owner');

    const updated = await updateProfile('user_abc', { full_name: 'Commander Nova' });
    expect(updated.full_name).toBe('Commander Nova');
  });

  it('userSettingsService falls back to default settings when Supabase is not configured', async () => {
    expect(isSupabaseConfigured()).toBe(false);

    const settings = await getUserSettings('user_xyz');
    expect(settings).not.toBeNull();
    expect(settings.theme).toBe('dark');
    expect(settings.voice_provider).toBe('elevenlabs');

    const updated = await updateUserSettings('user_xyz', { theme: 'light' });
    expect(updated.theme).toBe('light');
  });
});
