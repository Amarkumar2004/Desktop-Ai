import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type AgentId = 'SUSI' | 'SPY' | 'EURO' | 'LEX';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ success: true, source: 'unavailable', agents: [], activeRun: null });
  }
  const supabase = createClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: 'Supabase client unavailable.' }, { status: 503 });
  }

  try {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user?.id) {
      return NextResponse.json({ success: false, error: 'Authentication required.' }, { status: 401 });
    }

    const { data: runs, error: runError } = await supabase
      .from('agent_runs')
      .select('id, task_id, status, created_at, updated_at')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (runError) throw runError;

    const activeRun = (runs || []).find((run) => ['queued', 'planning', 'running'].includes(run.status)) || null;
    const displayRun = activeRun || (runs || [])[0] || null;
    const runIds = displayRun ? [displayRun.id] : [];
    const { data: messages, error: messageError } = runIds.length
      ? await supabase.from('agent_messages')
          .select('run_id, from_agent, message_type, content, created_at')
          .eq('user_id', auth.user.id)
          .in('run_id', runIds)
          .order('created_at', { ascending: true })
          .limit(300)
      : { data: [], error: null };
    if (messageError) throw messageError;

    const latestByAgent = new Map<AgentId, { status: 'idle' | 'working' | 'ready' | 'error'; taskSnippet: string; updatedAt: string }>();
    const latestMessages = messages || [];
    for (const message of latestMessages) {
      const agent = message.from_agent as AgentId;
      if (!['SUSI', 'SPY', 'EURO', 'LEX'].includes(agent)) continue;
      const status = message.message_type === 'error'
        ? 'error'
        : message.message_type === 'result' || message.message_type === 'handoff'
          ? 'ready'
          : message.message_type === 'status' || message.message_type === 'assignment'
            ? 'working'
            : latestByAgent.get(agent)?.status || 'idle';
      latestByAgent.set(agent, {
        status,
        taskSnippet: String(message.content || '').slice(0, 80),
        updatedAt: message.created_at,
      });
    }

    const agents = (['SUSI', 'SPY', 'EURO', 'LEX'] as AgentId[]).map((id) => ({
      id,
      status: latestByAgent.get(id)?.status || (activeRun ? 'idle' : 'idle'),
      taskSnippet: latestByAgent.get(id)?.taskSnippet || '',
      updatedAt: latestByAgent.get(id)?.updatedAt || null,
      runId: displayRun?.id || null,
    }));
    return NextResponse.json({
      success: true,
      source: 'supabase',
      checkedAt: new Date().toISOString(),
      activeRun,
      agents,
    }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load agent runtime.';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
