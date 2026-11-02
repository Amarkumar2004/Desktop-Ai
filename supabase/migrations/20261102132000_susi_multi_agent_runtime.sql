-- SUSI AI — Multi-Agent Runtime Foundation Schema
-- Tables: agent_runs, agent_messages, agent_memory
-- Strictly isolated RLS policies for authenticated users (user_id = auth.uid()) and anonymous desktop mode (user_id IS NULL)

-- 1. AGENT_RUNS: Autonomous Multi-Agent Swarm Execution Lifecycle
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'planning' CHECK (status IN ('planning','running','completed','failed','cancelled')),
  active_agent text NOT NULL DEFAULT 'SUSI' CHECK (active_agent IN ('SUSI','SPY','EURO','LEX')),
  completed boolean NOT NULL DEFAULT false,
  plan jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. AGENT_MESSAGES: Inter-Agent Communication Stream (SUSI -> SPY -> EURO -> LEX)
CREATE TABLE IF NOT EXISTS public.agent_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  from_agent text NOT NULL CHECK (from_agent IN ('SUSI','SPY','EURO','LEX')),
  to_agent text CHECK (to_agent IN ('SUSI','SPY','EURO','LEX','ALL')),
  message_type text NOT NULL CHECK (message_type IN ('assignment','status','result','handoff','error','note')),
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. AGENT_MEMORY: User-isolated long-term memory & research artifacts
CREATE TABLE IF NOT EXISTS public.agent_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id text NOT NULL CHECK (agent_id IN ('SUSI','SPY','EURO','LEX')),
  memory_key text NOT NULL,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agent_id, memory_key)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created ON public.agent_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_task_id ON public.agent_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_run_created ON public.agent_messages(run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_task_id ON public.agent_messages(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_memory_user_agent ON public.agent_memory(user_id, agent_id);

-- Enable RLS
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;

-- 1. Policies for agent_runs (Strictly user-isolated for authenticated; anonymous data remains local)
DROP POLICY IF EXISTS agent_runs_user_all ON public.agent_runs;
CREATE POLICY agent_runs_user_all ON public.agent_runs FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Reject anonymous public access to prevent cross-installation data leakage
DROP POLICY IF EXISTS agent_runs_anon ON public.agent_runs;

-- 2. Policies for agent_messages (Strictly run-ownership verified for authenticated)
DROP POLICY IF EXISTS agent_messages_user_all ON public.agent_messages;
CREATE POLICY agent_messages_user_all ON public.agent_messages
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.agent_runs AS own_run
      WHERE own_run.id = agent_messages.run_id
        AND own_run.task_id = agent_messages.task_id
        AND own_run.user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.agent_runs AS own_run
      WHERE own_run.id = agent_messages.run_id
        AND own_run.task_id = agent_messages.task_id
        AND own_run.user_id = auth.uid()
    )
  );

-- Reject anonymous public access to prevent cross-installation data leakage
DROP POLICY IF EXISTS agent_messages_anon ON public.agent_messages;

-- 3. Policies for agent_memory (Strictly user-isolated for authenticated)
DROP POLICY IF EXISTS agent_memory_user_all ON public.agent_memory;
CREATE POLICY agent_memory_user_all ON public.agent_memory FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Reject anonymous public access to prevent cross-installation data leakage
DROP POLICY IF EXISTS agent_memory_anon ON public.agent_memory;

-- Updated_at triggers
DROP TRIGGER IF EXISTS trg_agent_runs_updated_at ON public.agent_runs;
CREATE TRIGGER trg_agent_runs_updated_at BEFORE UPDATE ON public.agent_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_agent_memory_updated_at ON public.agent_memory;
CREATE TRIGGER trg_agent_memory_updated_at BEFORE UPDATE ON public.agent_memory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
