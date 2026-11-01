-- ==============================================================================
-- SUSI AI: Allow Desktop Anon Mode for Tasks & Action Logs (where user_id IS NULL)
-- Version: 20261101144000
-- ==============================================================================

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
