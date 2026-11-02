import { NextRequest, NextResponse } from 'next/server';
import { multiAgentOrchestrator } from '@/backend/services/multiAgentOrchestrator';
import { createTask, getTaskSteps, getTasks } from '@/backend/services/taskService';
import {
  getAgentRun,
  getAgentRunsForTask,
  getAgentMessages,
  getAgentMemory,
  WorkforceAgentId,
} from '@/backend/services/agentRuntimeService';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/agents/orchestrate
 * Dispatches an autonomous multi-agent pipeline: SUSI → SPY → EURO → LEX → SUSI Verification
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = (body.title as string)?.trim() || 'Autonomous Multi-Agent Task';
    const objective = (body.objective as string)?.trim() || title;
    const context = body.context || {};
    let taskId = (body.taskId as string)?.trim();

    // If no existing task, create a genuine task row
    if (!taskId) {
      const created = await createTask({
        title,
        assignedAgent: 'SUSI',
        priority: (body.priority as 'Critical' | 'High' | 'Medium' | 'Low') || 'High',
        category: 'Operations',
        description: objective,
      });
      taskId = created.id;
    }

    // Execute the full multi-agent pipeline
    const result = await multiAgentOrchestrator.executePipeline({
      taskId,
      title,
      objective,
      context,
    });

    const statusCode = result.success ? 200 : result.status === 'cancelled' ? 499 : 500;
    return NextResponse.json(result, { status: statusCode });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        success: false,
        error: `Multi-agent orchestration failed: ${msg}`,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agents/orchestrate?taskId=... or ?runId=... or ?agentId=...
 * Inspects real backend agent runs, messages, memory, and task steps.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId');
    const runId = searchParams.get('runId');
    const agentId = searchParams.get('agentId') as WorkforceAgentId | null;

    if (runId) {
      const run = await getAgentRun(runId);
      const messages = await getAgentMessages(runId);
      return NextResponse.json({
        run,
        messages,
      });
    }

    if (taskId) {
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

    // Default: return recent active runs
    const allTasks = await getTasks();
    return NextResponse.json({
      activeTasksCount: allTasks.length,
      tasks: allTasks.slice(0, 10),
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

