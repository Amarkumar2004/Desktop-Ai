import { NextRequest, NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';
import { multiAgentOrchestrator } from '@/backend/services/multiAgentOrchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Re-queues tasks whose last persisted run heartbeat is older than two minutes.
 * The conditional status+timestamp update acts as a single-winner recovery claim.
 * Execution is restarted from the task objective; partial external side effects are not replayed.
 */
export async function POST(_request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true, recovered: 0, source: 'local-only', note: 'Supabase recovery is unavailable in local-only mode.' });
  }

  const supabase = createClient();
  if (!supabase) return NextResponse.json({ success: false, error: 'Supabase client unavailable.' }, { status: 503 });

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user?.id) {
    return NextResponse.json({ success: false, error: 'Authentication required for recovery.' }, { status: 401 });
  }

  const staleBefore = new Date(Date.now() - 120_000).toISOString();
  const { data: staleRuns, error: runsError } = await supabase
    .from('agent_runs')
    .select('id, task_id, status, updated_at')
    .eq('user_id', auth.user.id)
    .in('status', ['queued', 'planning', 'running'])
    .lt('updated_at', staleBefore)
    .order('updated_at', { ascending: true })
    .limit(5);

  if (runsError) {
    return NextResponse.json({ success: false, error: `Failed to inspect stale runs: ${runsError.message}` }, { status: 500 });
  }

  const recovery: Array<{ taskId: string; previousRunId: string; status: string }> = [];
  for (const run of staleRuns || []) {
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, title, description, user_id, status')
      .eq('id', run.task_id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (taskError || !task || ['completed', 'cancelled'].includes(String(task.status))) continue;

    // Claim only if the run is still stale and still in the status we observed.
    const { data: claimed, error: claimError } = await supabase
      .from('agent_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', run.id)
      .eq('user_id', auth.user.id)
      .eq('status', run.status)
      .lt('updated_at', staleBefore)
      .select('id')
      .maybeSingle();

    if (claimError || !claimed) continue;

    recovery.push({ taskId: String(task.id), previousRunId: String(run.id), status: 'requeued' });
    // Node/Tauri local server keeps the task running after this short recovery response.
    // The orchestrator writes a new run and fresh step history; no partial command is replayed.
    void multiAgentOrchestrator.executePipeline({
      taskId: String(task.id),
      title: String(task.title || 'Recovered task'),
      objective: String(task.description || task.title || 'Resume the interrupted task from its original objective.'),
      userId: auth.user.id,
      context: { recoveredFromRunId: run.id, recovery: true },
    }).catch((error) => {
      console.error('[AgentRecovery] Failed to restart stale task:', error);
    });
  }

  return NextResponse.json({
    success: true,
    checkedAt: new Date().toISOString(),
    staleRunCount: staleRuns?.length || 0,
    recovered: recovery.length,
    recovery,
  });
}
