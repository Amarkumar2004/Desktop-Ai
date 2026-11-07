-- Index supporting stale-run detection by the recovery worker.
CREATE INDEX IF NOT EXISTS idx_agent_runs_recovery_heartbeat
  ON public.agent_runs(status, updated_at ASC)
  WHERE status IN ('queued', 'planning', 'running');
