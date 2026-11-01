-- ==============================================================================
-- SUSI AI: Complete Production Database Schema & Row Level Security (RLS)
-- Version: 20261101140000
-- ==============================================================================

-- 1. Enable Core PostgreSQL Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. Helper Functions (Auto-update timestamps and workspace membership)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. Core Tables
-- ------------------------------------------------------------------------------

-- Table 1: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  avatar_url text,
  phone_number text,
  role text DEFAULT 'owner' NOT NULL,
  theme text DEFAULT 'dark' NOT NULL CHECK (theme IN ('light', 'dark', 'system')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Table 2: workspaces
CREATE TABLE IF NOT EXISTS public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan text DEFAULT 'starter' NOT NULL CHECK (plan IN ('starter', 'pro', 'enterprise')),
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Table 3: workspace_members
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text DEFAULT 'member' NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT unique_workspace_user UNIQUE (workspace_id, user_id)
);

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = p_user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_workspace_member(uuid, uuid) TO service_role;

-- Table 4: user_settings
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  theme text DEFAULT 'dark' NOT NULL CHECK (theme IN ('light', 'dark', 'system')),
  voice_enabled boolean DEFAULT true NOT NULL,
  voice_provider text DEFAULT 'elevenlabs' NOT NULL,
  selected_model text DEFAULT 'auto' NOT NULL,
  auto_read boolean DEFAULT false NOT NULL,
  audio_vad_sensitivity text DEFAULT 'medium' NOT NULL,
  preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Table 5: conversations
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  title text DEFAULT 'New Conversation' NOT NULL,
  pinned boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Table 6: messages
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Table 7: tasks
CREATE TABLE IF NOT EXISTS public.tasks (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  assigned_agent text DEFAULT 'SUSI' NOT NULL,
  priority text DEFAULT 'Medium' NOT NULL CHECK (priority IN ('Low', 'Medium', 'High', 'Critical', 'low', 'medium', 'high', 'critical', 'urgent')),
  status text DEFAULT 'queued' NOT NULL CHECK (status IN ('queued', 'assigned', 'in_progress', 'completed', 'failed', 'cancelled', 'paused')),
  category text DEFAULT 'Operations' NOT NULL,
  progress integer DEFAULT 0 NOT NULL CHECK (progress >= 0 AND progress <= 100),
  completed boolean DEFAULT false NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  completed_at timestamptz
);

-- Table 8: task_steps
CREATE TABLE IF NOT EXISTS public.task_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  step_index integer NOT NULL,
  action_type text NOT NULL,
  title text,
  payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'blocked', 'requires_approval')),
  result jsonb,
  error text,
  started_at timestamptz,
  completed_at timestamptz
);

-- Table 9: provider_connections (Metadata ONLY; raw keys are stored locally in Windows Credential Manager)
CREATE TABLE IF NOT EXISTS public.provider_connections (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_label text NOT NULL,
  display_name text,
  masked_key_suffix text NOT NULL,
  base_url text,
  selected_model text NOT NULL,
  available_models jsonb DEFAULT '[]'::jsonb NOT NULL,
  status text DEFAULT 'connected' NOT NULL CHECK (status IN ('connected', 'not_connected', 'needs_attention')),
  capabilities jsonb DEFAULT '{"voice": true, "chat": true, "code": true}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Table 10: action_logs
CREATE TABLE IF NOT EXISTS public.action_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  request_id text NOT NULL,
  action_type text NOT NULL,
  target text,
  risk_level text DEFAULT 'LOW' NOT NULL CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH')),
  status text DEFAULT 'APPROVED' NOT NULL CHECK (status IN ('APPROVED', 'DENIED', 'REQUIRES_APPROVAL')),
  execution_result jsonb DEFAULT '{}'::jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ------------------------------------------------------------------------------
-- 4. Performance Indexes
-- ------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_workspaces_owner ON public.workspaces(owner_id);
CREATE INDEX IF NOT EXISTS idx_workspace_members_user ON public.workspace_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON public.conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON public.messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON public.tasks(user_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON public.tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_steps_task ON public.task_steps(task_id, step_index ASC);
CREATE INDEX IF NOT EXISTS idx_providers_user ON public.provider_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_user ON public.action_logs(user_id, created_at DESC);

-- ------------------------------------------------------------------------------
-- 5. Enable Row Level Security (RLS) on ALL Tables
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 6. Strict User-Isolated RLS Policies (auth.uid() = user_id)
-- ------------------------------------------------------------------------------

-- Profiles
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- Workspaces
DROP POLICY IF EXISTS "workspaces_owner_all" ON public.workspaces;
CREATE POLICY "workspaces_owner_all" ON public.workspaces FOR ALL TO authenticated USING (owner_id = auth.uid() OR public.is_workspace_member(id, auth.uid()));

-- Workspace Members
DROP POLICY IF EXISTS "workspace_members_select" ON public.workspace_members;
CREATE POLICY "workspace_members_select" ON public.workspace_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id, auth.uid()));

-- User Settings
DROP POLICY IF EXISTS "user_settings_all" ON public.user_settings;
CREATE POLICY "user_settings_all" ON public.user_settings FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Conversations
DROP POLICY IF EXISTS "conversations_all" ON public.conversations;
CREATE POLICY "conversations_all" ON public.conversations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Messages
DROP POLICY IF EXISTS "messages_all" ON public.messages;
CREATE POLICY "messages_all" ON public.messages FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Tasks: Authenticated + Anon policies
DROP POLICY IF EXISTS "tasks_all" ON public.tasks;
DROP POLICY IF EXISTS "tasks_authenticated" ON public.tasks;
CREATE POLICY "tasks_authenticated" ON public.tasks FOR ALL TO authenticated
  USING (user_id = auth.uid() OR (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid())))
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "tasks_anon" ON public.tasks;
CREATE POLICY "tasks_anon" ON public.tasks FOR ALL TO anon
  USING (user_id IS NULL)
  WITH CHECK (user_id IS NULL);

-- Task Steps: Authenticated + Anon policies
DROP POLICY IF EXISTS "task_steps_all" ON public.task_steps;
DROP POLICY IF EXISTS "task_steps_authenticated" ON public.task_steps;
CREATE POLICY "task_steps_authenticated" ON public.task_steps FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_steps.task_id
        AND (tasks.user_id = auth.uid() OR (tasks.workspace_id IS NOT NULL AND public.is_workspace_member(tasks.workspace_id, auth.uid())))
    )
  );

DROP POLICY IF EXISTS "task_steps_anon" ON public.task_steps;
CREATE POLICY "task_steps_anon" ON public.task_steps FOR ALL TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_steps.task_id
        AND tasks.user_id IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks
      WHERE tasks.id = task_steps.task_id
        AND tasks.user_id IS NULL
    )
  );

-- Provider Connections
DROP POLICY IF EXISTS "providers_all" ON public.provider_connections;
CREATE POLICY "providers_all" ON public.provider_connections FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Action Logs: Authenticated + Anon policies
DROP POLICY IF EXISTS "action_logs_all" ON public.action_logs;
DROP POLICY IF EXISTS "action_logs_authenticated" ON public.action_logs;
CREATE POLICY "action_logs_authenticated" ON public.action_logs FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS "action_logs_anon" ON public.action_logs;
CREATE POLICY "action_logs_anon" ON public.action_logs FOR ALL TO anon
  USING (user_id IS NULL)
  WITH CHECK (user_id IS NULL);

-- ------------------------------------------------------------------------------
-- 7. Automatic Signup Profile & Settings Trigger
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_settings (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-update triggers
DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_workspaces_updated_at ON public.workspaces;
CREATE TRIGGER trg_workspaces_updated_at BEFORE UPDATE ON public.workspaces FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_conversations_updated_at ON public.conversations;
CREATE TRIGGER trg_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON public.tasks;
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_providers_updated_at ON public.provider_connections;
CREATE TRIGGER trg_providers_updated_at BEFORE UPDATE ON public.provider_connections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
