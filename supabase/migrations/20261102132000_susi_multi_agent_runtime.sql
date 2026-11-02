-- Authenticated, user-scoped persistence for SUSI's multi-agent runs, messages and memory.
CREATE TABLE IF NOT EXISTS public.agent_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 manager_agent text NOT NULL DEFAULT 'SUSI' CHECK (manager_agent = 'SUSI'),
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','planning','running','completed','failed','cancelled')),
 plan jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.agent_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
 task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 from_agent text NOT NULL CHECK (from_agent IN ('SUSI','SPY','EURO','LEX')),
 to_agent text CHECK (to_agent IN ('SUSI','SPY','EURO','LEX','ALL')),
 message_type text NOT NULL CHECK (message_type IN ('assignment','status','result','handoff','error','note')),
 content text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.agent_memory (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
 agent_id text NOT NULL CHECK (agent_id IN ('SUSI','SPY','EURO','LEX')),
 memory_key text NOT NULL, content jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (user_id, agent_id, memory_key)
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created ON public.agent_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_messages_run_created ON public.agent_messages(run_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_agent_memory_user_agent ON public.agent_memory(user_id, agent_id);
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS agent_runs_user_all ON public.agent_runs;
CREATE POLICY agent_runs_user_all ON public.agent_runs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS agent_messages_user_all ON public.agent_messages;
CREATE POLICY agent_messages_user_all ON public.agent_messages FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS agent_memory_user_all ON public.agent_memory;
CREATE POLICY agent_memory_user_all ON public.agent_memory FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP TRIGGER IF EXISTS trg_agent_runs_updated_at ON public.agent_runs;
CREATE TRIGGER trg_agent_runs_updated_at BEFORE UPDATE ON public.agent_runs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS trg_agent_memory_updated_at ON public.agent_memory;
CREATE TRIGGER trg_agent_memory_updated_at BEFORE UPDATE ON public.agent_memory FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
