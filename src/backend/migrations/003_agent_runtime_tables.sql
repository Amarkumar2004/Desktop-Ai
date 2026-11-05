-- SUSI AI agent runtime persistence.
-- These tables are required by agentRuntimeService and Agent Town lifecycle views.
-- Runtime records are user-scoped; anonymous desktop mode remains installation-local.

CREATE TABLE IF NOT EXISTS public.agents (
  id text PRIMARY KEY,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  role text NOT NULL,
  status text NOT NULL DEFAULT 'idle'
    CHECK (status IN ('idle', 'working', 'ready', 'offline', 'error')),
  color text NOT NULL DEFAULT 'slate',
  avatar_url text,
  current_task_id text REFERENCES public.tasks(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  manager_agent text NOT NULL DEFAULT 'SUSI' CHECK (manager_agent = 'SUSI'),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'planning', 'running', 'completed', 'failed', 'cancelled')),
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.agent_messages (
  id text PRIMARY KEY,
  run_id text NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  from_agent text NOT NULL CHECK (from_agent IN ('SUSI', 'SPY', 'EURO', 'LEX')),
  to_agent text CHECK (to_agent IN ('SUSI', 'SPY', 'EURO', 'LEX', 'ALL')),
  message_type text NOT NULL
    CHECK (message_type IN ('assignment', 'status', 'result', 'handoff', 'error', 'note')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_memory (
  id text PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL CHECK (agent_id IN ('SUSI', 'SPY', 'EURO', 'LEX')),
  memory_key text NOT NULL,
  content jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_memory_user_agent_key UNIQUE (user_id, agent_id, memory_key)
);

CREATE TABLE IF NOT EXISTS public.agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN ('task_started', 'task_completed', 'status_change', 'log', 'error')),
  message text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_workspace_status ON public.agents(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created ON public.agent_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_task_created ON public.agent_runs(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_run_created ON public.agent_messages(run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_user_created ON public.agent_messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_user_agent ON public.agent_memory(user_id, agent_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent_created ON public.agent_events(agent_id, created_at DESC);

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_workspace_member_read" ON public.agents;
CREATE POLICY "agents_workspace_member_read" ON public.agents
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "agent_runs_owner_all" ON public.agent_runs;
CREATE POLICY "agent_runs_owner_all" ON public.agent_runs
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "agent_messages_owner_all" ON public.agent_messages;
CREATE POLICY "agent_messages_owner_all" ON public.agent_messages
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.agent_runs r
      WHERE r.id = run_id AND r.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "agent_memory_owner_all" ON public.agent_memory;
CREATE POLICY "agent_memory_owner_all" ON public.agent_memory
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "agent_events_workspace_member_read" ON public.agent_events;
CREATE POLICY "agent_events_workspace_member_read" ON public.agent_events
  FOR SELECT TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.is_workspace_member(workspace_id, auth.uid())
  );

DROP POLICY IF EXISTS "agents_owner_update" ON public.agents;
CREATE POLICY "agents_owner_update" ON public.agents
  FOR UPDATE TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    workspace_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "agent_runs_anon_local_only" ON public.agent_runs;
CREATE POLICY "agent_runs_anon_local_only" ON public.agent_runs
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "agent_messages_anon_local_only" ON public.agent_messages;
CREATE POLICY "agent_messages_anon_local_only" ON public.agent_messages
  FOR ALL TO anon USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "agent_memory_anon_local_only" ON public.agent_memory;
CREATE POLICY "agent_memory_anon_local_only" ON public.agent_memory
  FOR ALL TO anon USING (false) WITH CHECK (false);
