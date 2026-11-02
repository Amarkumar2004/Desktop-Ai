import { NextRequest, NextResponse } from 'next/server';
import { multiAgentOrchestrator } from '@/backend/services/multiAgentOrchestrator';
import { createTask, getTaskSteps, getTasks } from '@/backend/services/taskService';
import {
  getAgentRun,
  getAgentRunsForTask,
  getAgentMessages,
  getAgentMemory,
  getVerifiedInstallationId,
  WorkforceAgentId,
} from '@/backend/services/agentRuntimeService';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';
import { validateDesktopAuth } from '@/lib/security/desktopAuth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Resolves the authenticated caller identity: Supabase user, authorized desktop session, or verified local installation.
 */
async function resolveCallerIdentity(req: NextRequest) {
  // 1. Supabase authenticated user
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      try {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.id) {
          return { type: 'supabase_user' as const, userId: data.user.id };
        }
      } catch {}
    }
  }

  // 2. Desktop session validation
  const desktopAuth = validateDesktopAuth(req);
  if (desktopAuth.authorized) {
    return { type: 'desktop_session' as const, sessionId: desktopAuth.sessionId };
  }

  // 3. Localhost internal desktop / tauri check
  const host = req.headers.get('host') || '';
  const origin = req.headers.get('origin') || '';
  const isLocalOrigin = host.includes('localhost') || host.includes('127.0.0.1') || origin.includes('tauri');
  if (isLocalOrigin) {
    return { type: 'local_desktop' as const, installationId: getVerifiedInstallationId() };
  }

  return null;
}

/**
 * POST /api/agents/orchestrate
 * Dispatches an autonomous multi-agent pipeline or cancels an active pipeline with strict authorization.
 */
export async function POST(req: NextRequest) {
  try {
    const caller = await resolveCallerIdentity(req);
    if (!caller) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication or valid desktop session required.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));

    // Explicit pipeline cancellation command
    if (body.action === 'cancel') {
      const targetTaskId = String(body.taskId || '').trim();
      if (!targetTaskId) {
        return NextResponse.json(
          { success: false, error: 'taskId is required for pipeline cancellation.' },
          { status: 400 }
        );
      }

      // Verify task ownership for authenticated users
      if (caller.type === 'supabase_user') {
        const userTasks = await getTasks({ userId: caller.userId });
        const ownsTask = userTasks.some((t) => t.id === targetTaskId);
        if (!ownsTask) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: You do not have permission to cancel this task.' },
            { status: 403 }
          );
        }
      }

      const cancelled = multiAgentOrchestrator.cancelPipeline(
        targetTaskId,
        (body.reason as string) || 'Cancellation requested via API.'
      );
      return NextResponse.json({
        success: true,
        cancelled,
        taskId: targetTaskId,
        message: cancelled
          ? `Pipeline for task ${targetTaskId} aborted.`
          : `No active in-flight pipeline found for task ${targetTaskId}.`,
      });
    }

    const title = (body.title as string)?.trim() || 'Autonomous Multi-Agent Task';
    const objective = (body.objective as string)?.trim() || title;
    const context = body.context || {};
    let taskId = (body.taskId as string)?.trim();

    // If existing taskId provided, verify ownership
    if (taskId && caller.type === 'supabase_user') {
      const userTasks = await getTasks({ userId: caller.userId });
      const ownsTask = userTasks.some((t) => t.id === taskId);
      if (!ownsTask) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: You do not have permission to execute this task.' },
          { status: 403 }
        );
      }
    }

    // If no existing task, create a genuine task row bound to caller
    if (!taskId) {
      const created = await createTask({
        title,
        assignedAgent: 'SUSI',
        priority: (body.priority as 'Critical' | 'High' | 'Medium' | 'Low') || 'High',
        category: 'Operations',
        description: objective,
        userId: caller.type === 'supabase_user' ? caller.userId : undefined,
      });
      taskId = created.id;
    }

    // Execute the full multi-agent pipeline, propagating the incoming HTTP request AbortSignal
    const result = await multiAgentOrchestrator.executePipeline({
      taskId,
      title,
      objective,
      context,
      signal: req.signal,
    });

    const statusCode = result.success ? 200 : result.status === 'cancelled' ? 499 : 500;
    return NextResponse.json(result, { status: statusCode });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isCancelled = req.signal.aborted || msg.toLowerCase().includes('cancel');
    return NextResponse.json(
      {
        success: false,
        status: isCancelled ? 'cancelled' : 'failed',
        error: `Multi-agent orchestration failed: ${msg}`,
      },
      { status: isCancelled ? 499 : 500 }
    );
  }
}

/**
 * DELETE /api/agents/orchestrate?taskId=...
 * Immediately aborts an in-flight pipeline for the specified task with ownership check.
 */
export async function DELETE(req: NextRequest) {
  try {
    const caller = await resolveCallerIdentity(req);
    if (!caller) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    if (!taskId) {
      return NextResponse.json(
        { success: false, error: 'taskId query parameter is required for cancellation.' },
        { status: 400 }
      );
    }

    // Verify task ownership for authenticated users
    if (caller.type === 'supabase_user') {
      const userTasks = await getTasks({ userId: caller.userId });
      const ownsTask = userTasks.some((t) => t.id === taskId);
      if (!ownsTask) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: You do not have permission to cancel this task.' },
          { status: 403 }
        );
      }
    }

    const cancelled = multiAgentOrchestrator.cancelPipeline(taskId, 'Pipeline cancelled via HTTP DELETE.');
    return NextResponse.json({
      success: true,
      cancelled,
      taskId,
      message: cancelled
        ? `Pipeline for task ${taskId} successfully cancelled.`
        : `No active pipeline was found for task ${taskId}.`,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { success: false, error: `Failed to cancel pipeline: ${msg}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/orchestrate?taskId=... or ?runId=... or ?agentId=...
 * Inspects real backend agent runs, messages, memory, and task steps with ownership isolation.
 */
export async function GET(req: NextRequest) {
  try {
    const caller = await resolveCallerIdentity(req);
    if (!caller) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const runId = searchParams.get('runId');
    const agentId = searchParams.get('agentId') as WorkforceAgentId | null;

    if (runId) {
      const run = await getAgentRun(runId);
      if (!run) {
        return NextResponse.json(
          { success: false, error: 'Agent run not found or access denied.' },
          { status: 404 }
        );
      }

      // Check ownership for authenticated user
      if (caller.type === 'supabase_user' && run.user_id && run.user_id !== caller.userId) {
        return NextResponse.json(
          { success: false, error: 'Forbidden: You do not have permission to view this run.' },
          { status: 403 }
        );
      }

      const messages = await getAgentMessages(runId);
      return NextResponse.json({
        run,
        messages,
      });
    }

    if (taskId) {
      // Check ownership for authenticated user
      if (caller.type === 'supabase_user') {
        const userTasks = await getTasks({ userId: caller.userId });
        const ownsTask = userTasks.some((t) => t.id === taskId);
        if (!ownsTask) {
          return NextResponse.json(
            { success: false, error: 'Forbidden: You do not have permission to view this task.' },
            { status: 403 }
          );
        }
      }

      const runs = await getAgentRunsForTask(taskId);
      const steps = await getTaskSteps(taskId);
      const latestRunId = runs[0]?.id;
      const messages = latestRunId ? await getAgentMessages(latestRunId) : [];
      return NextResponse.json({
        taskId,
        runs,
        steps,
        messages,
      });
    }

    if (agentId) {
      const memory = await getAgentMemory(agentId);
      return NextResponse.json({
        agentId,
        memory,
      });
    }

    // Default: return recent active tasks belonging to this user
    const filteredTasks = await getTasks(
      caller.type === 'supabase_user' ? { userId: caller.userId } : undefined
    );

    return NextResponse.json({
      activeTasksCount: filteredTasks.length,
      tasks: filteredTasks.slice(0, 10),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: `Failed to retrieve agent orchestration data: ${msg}`,
      },
      { status: 500 }
    );
  }
}
