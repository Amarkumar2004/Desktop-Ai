/**
 * TaskOrchestrator — Production-Grade Multi-Step Task Execution Engine
 * 
 * Supports:
 * 1. Single or Multi-Step Action Plans with parent-child coordination.
 * 2. Explicit sequential dependency tracking (`dependsOn`).
 * 3. Verified real-time progress: `(completedSteps / totalSteps) * 100` (zero fake numbers).
 * 4. Integration with ActionPipeline: single authoritative duplicate-protected execution.
 * 5. Automatic retries for transient non-destructive tasks (up to 2 retries).
 * 6. Full cancellation propagation via AbortController.
 */

import { ActionPipeline, type PipelineActionResult } from '@/lib/actions/ActionPipeline';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ActionPlanItem {
  type: string;
  payload?: Record<string, unknown>;
  title?: string;
  isDestructive?: boolean;
}

export interface OrchestratedTask {
  taskId: string;
  title: string;
  actionType: string;
  payload: Record<string, unknown>;
  status: TaskStatus;
  progress: number;
  dependsOn?: string[]; // IDs of tasks that must complete before this task starts
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: unknown;
  error?: string;
  retryCount: number;
  maxRetries: number;
  abortController?: AbortController;
  parentPlanId?: string;
}

export class TaskOrchestrator {
  private tasks: Map<string, OrchestratedTask> = new Map();
  private listeners: Set<(tasks: OrchestratedTask[]) => void> = new Set();
  private activeTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private retryTimers: Map<string, NodeJS.Timeout> = new Map();

  public onTasksUpdated(cb: (tasks: OrchestratedTask[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    const list = Array.from(this.tasks.values());
    this.listeners.forEach((cb) => {
      try {
        cb(list);
      } catch (err) {
        console.error('[TaskOrchestrator] Error in task listener:', err);
      }
    });
  }

  /**
   * Plans and dispatches a single action or a multi-step list of actions
   */
  public async planAndDispatch(
    prompt: string,
    actionOrActions?: ActionPlanItem | ActionPlanItem[]
  ): Promise<OrchestratedTask[]> {
    if (!actionOrActions) return [];

    const actionsList: ActionPlanItem[] = Array.isArray(actionOrActions)
      ? actionOrActions
      : [actionOrActions];

    const validActions = actionsList.filter((a) => a && a.type && a.type !== 'CHAT_REPLY');
    if (validActions.length === 0) return [];

    const lower = prompt.toLowerCase();
    const isSequential =
      validActions.length > 1 ||
      lower.includes('and then') ||
      lower.includes('aur phir') ||
      lower.includes('ke baad') ||
      lower.includes('then') ||
      lower.includes('phir');

    const createdTasks: OrchestratedTask[] = [];
    const parentPlanId = validActions.length > 1 ? `plan_${Date.now()}` : undefined;

    for (let i = 0; i < validActions.length; i++) {
      const act = validActions[i];
      const isDestructive =
        act.isDestructive ||
        act.type === 'DELETE_FILE' ||
        act.type === 'DELETE_FOLDER' ||
        act.type === 'POWER_CONTROL';

      const task: OrchestratedTask = {
        taskId: `otask_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
        title: act.title || (act.payload?.title as string) || `${act.type}: ${String(act.payload?.appName || act.payload?.target || act.payload?.path || '')}`.trim(),
        actionType: act.type,
        payload: act.payload || {},
        status: 'pending',
        progress: 0,
        createdAt: new Date().toISOString(),
        retryCount: 0,
        maxRetries: isDestructive ? 0 : 2, // Destructive tasks must never retry automatically
        parentPlanId,
      };

      // Set sequential dependency if order matters
      if (isSequential && i > 0) {
        task.dependsOn = [createdTasks[i - 1].taskId];
      }

      this.tasks.set(task.taskId, task);
      createdTasks.push(task);
    }

    this.notify();

    // Trigger ready tasks (tasks with no pending dependencies)
    for (const task of createdTasks) {
      if (!task.dependsOn || task.dependsOn.length === 0) {
        this.executeTask(task.taskId);
      }
    }

    return createdTasks;
  }

  public async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'running' || task.status === 'completed' || task.status === 'cancelled') return;

    // Verify all dependencies have successfully completed
    if (task.dependsOn && task.dependsOn.length > 0) {
      const allDepCompleted = task.dependsOn.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });

      if (!allDepCompleted) {
        // Dependencies not met; wait for callback
        return;
      }
    }

    task.status = 'running';
    task.startedAt = new Date().toISOString();
    task.progress = 0;
    task.abortController = new AbortController();
    this.notify();

    // 15-second execution timeout guard
    const timeoutId = setTimeout(() => {
      if (task.status === 'running') {
        console.warn(`[TaskOrchestrator] Task ${task.taskId} (${task.actionType}) timed out after 15s.`);
        task.abortController?.abort();
        // A timed-out action may have side effects; never retry it automatically.
        this.handleTaskFailure(taskId, 'Action execution timed out (15s limit reached).', false);
      }
    }, 15000);
    this.activeTimeouts.set(taskId, timeoutId);

    try {
      // Execute through Authoritative ActionPipeline (with deduplication & verification)
      const pipelineResult: PipelineActionResult = await ActionPipeline.dispatch({
        id: task.taskId,
        type: task.actionType,
        payload: task.payload,
        source: 'orchestrator',
        signal: task.abortController?.signal,
      });

      clearTimeout(timeoutId);
      this.activeTimeouts.delete(taskId);

      const updated = this.tasks.get(taskId);
      if (!updated || updated.status === 'cancelled' || updated.status === 'failed') return;

      if (pipelineResult.success) {
        task.status = 'completed';
        task.progress = 100;
        task.completedAt = new Date().toISOString();
        task.result = pipelineResult.result;
        task.error = undefined;
        this.notify();

        // Trigger any tasks waiting on this task
        this.checkPendingDependents(taskId);
      } else {
        await this.handleTaskFailure(taskId, pipelineResult.message || 'Action failed.');
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      this.activeTimeouts.delete(taskId);
      const msg = err instanceof Error ? err.message : 'Execution exception';
      if (task.status !== 'cancelled' && task.status !== 'failed') await this.handleTaskFailure(taskId, msg);
    }
  }

  private async handleTaskFailure(taskId: string, errorMsg: string, allowRetry = true): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    if (task.status === 'cancelled' || task.status === 'completed' || task.status === 'failed') return;

    if (allowRetry && task.retryCount < task.maxRetries) {
      task.retryCount += 1;
      const backoffMs = Math.min(1000 * Math.pow(2, task.retryCount), 4000);
      console.warn(`[TaskOrchestrator] Retrying task ${taskId} (attempt ${task.retryCount}/${task.maxRetries}) in ${backoffMs}ms...`);
      task.status = 'pending';
      task.progress = 0;
      task.error = `Retrying after error: ${errorMsg}`;
      this.notify();

      const retryTimer = setTimeout(() => {
        this.retryTimers.delete(taskId);
        this.executeTask(taskId);
      }, backoffMs);
      this.retryTimers.set(taskId, retryTimer);
    } else {
      task.status = 'failed';
      task.progress = 0;
      task.error = errorMsg;
      task.completedAt = new Date().toISOString();
      this.notify();

      // If a dependency failed, cancel subsequent dependent tasks in the plan
      this.cancelDependents(taskId, `Prerequisite task "${task.title}" failed: ${errorMsg}`);
    }
  }

  private checkPendingDependents(completedTaskId: string): void {
    this.tasks.forEach((task) => {
      if (task.status === 'pending' && task.dependsOn?.includes(completedTaskId)) {
        this.executeTask(task.taskId);
      }
    });
  }

  private cancelDependents(failedTaskId: string, reason: string): void {
    this.tasks.forEach((task) => {
      if (task.status === 'pending' && task.dependsOn?.includes(failedTaskId)) {
        task.status = 'cancelled';
        task.error = reason;
        task.abortController?.abort();
      }
    });
    this.notify();
  }

  public cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return false;

    const retryTimer = this.retryTimers.get(taskId);
    if (retryTimer) { clearTimeout(retryTimer); this.retryTimers.delete(taskId); }
    task.status = 'cancelled';
    task.abortController?.abort();
    const timeout = this.activeTimeouts.get(taskId);
    if (timeout) {
      clearTimeout(timeout);
      this.activeTimeouts.delete(taskId);
    }
    ActionPipeline.cancelAction(taskId, 'User cancelled task');
    this.notify();

    // Cancel dependents
    this.cancelDependents(taskId, `Parent task "${task.title}" was cancelled.`);
    return true;
  }

  public cancelAllTasks(): void {
    this.tasks.forEach((task) => {
      if (task.status === 'running' || task.status === 'pending') {
        const retryTimer = this.retryTimers.get(task.taskId);
        if (retryTimer) clearTimeout(retryTimer);
        this.retryTimers.delete(task.taskId);
        task.status = 'cancelled';
        ActionPipeline.cancelAction(task.taskId, 'All tasks cancelled');
        task.abortController?.abort();
        const timeout = this.activeTimeouts.get(task.taskId);
        if (timeout) clearTimeout(timeout);
      }
    });
    this.activeTimeouts.clear();
    this.retryTimers.clear();
    this.notify();
  }

  public getTasks(): OrchestratedTask[] {
    return Array.from(this.tasks.values());
  }

  public getTask(taskId: string): OrchestratedTask | undefined {
    return this.tasks.get(taskId);
  }
}
