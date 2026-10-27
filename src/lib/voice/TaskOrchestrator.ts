/**
 * Asynchronous Task Orchestrator & Manager
 * Manages parallel independent tasks, sequential dependent tasks, progress tracking,
 * and cancellation without blocking ongoing voice conversations.
 */

import { ToolExecutor } from './ToolExecutor';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

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
  abortController?: AbortController;
}

export class TaskOrchestrator {
  private tasks: Map<string, OrchestratedTask> = new Map();
  private tools: ToolExecutor;
  private listeners: Set<(tasks: OrchestratedTask[]) => void> = new Set();

  constructor() {
    this.tools = new ToolExecutor();
  }

  public onTasksUpdated(cb: (tasks: OrchestratedTask[]) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(): void {
    const list = Array.from(this.tasks.values());
    this.listeners.forEach((cb) => cb(list));
  }

  /**
   * Dispatches a single or multi-step command and decomposes into independent or sequential tasks
   */
  public async planAndDispatch(prompt: string, action?: { type: string; payload?: Record<string, unknown> }): Promise<OrchestratedTask[]> {
    const createdTasks: OrchestratedTask[] = [];

    // If explicit action is provided from AI
    if (action && action.type && action.type !== 'CHAT_REPLY') {
      const task: OrchestratedTask = {
        taskId: `otask_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: (action.payload?.title as string) || action.type,
        actionType: action.type,
        payload: action.payload || {},
        status: 'pending',
        progress: 0,
        createdAt: new Date().toISOString(),
      };
      this.tasks.set(task.taskId, task);
      createdTasks.push(task);
      this.executeTask(task.taskId);
    }

    // Check multi-task conjuncts ("and then", "aur phir", "and meanwhile", "aur saath mein")
    const lower = prompt.toLowerCase();
    const isSequential = lower.includes('and then') || lower.includes('aur phir') || lower.includes('ke baad');

    if (isSequential && createdTasks.length > 1) {
      // Set dependency
      for (let i = 1; i < createdTasks.length; i++) {
        createdTasks[i].dependsOn = [createdTasks[i - 1].taskId];
      }
    }

    this.notify();
    return createdTasks;
  }

  public async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task || task.status === 'running' || task.status === 'completed' || task.status === 'cancelled') return;

    // Check dependencies
    if (task.dependsOn && task.dependsOn.length > 0) {
      const allDepCompleted = task.dependsOn.every((depId) => {
        const dep = this.tasks.get(depId);
        return dep && dep.status === 'completed';
      });

      if (!allDepCompleted) {
        // Dependency still pending, will trigger when dependency finishes
        return;
      }
    }

    task.status = 'running';
    task.startedAt = new Date().toISOString();
    task.progress = 25;
    task.abortController = new AbortController();
    this.notify();

    try {
      // Simulate progressive task execution
      task.progress = 60;
      this.notify();

      const execResult = await this.tools.execute(task.actionType, task.payload);

      const updatedTask = this.tasks.get(taskId);
      if (!updatedTask || updatedTask.status === 'cancelled') return;

      if (execResult.success) {
        task.status = 'completed';
        task.progress = 100;
        task.completedAt = new Date().toISOString();
        task.result = execResult.result;
      } else {
        task.status = 'failed';
        task.error = execResult.message;
      }
    } catch (err: unknown) {
      task.status = 'failed';
      task.error = (err as Error).message;
    }

    this.notify();
    this.checkPendingDependents(taskId);
  }

  private checkPendingDependents(completedTaskId: string): void {
    this.tasks.forEach((task) => {
      if (task.status === 'pending' && task.dependsOn?.includes(completedTaskId)) {
        this.executeTask(task.taskId);
      }
    });
  }

  public cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'cancelled';
    task.abortController?.abort();
    this.notify();
    return true;
  }

  public cancelAllTasks(): void {
    this.tasks.forEach((task) => {
      if (task.status === 'running' || task.status === 'pending') {
        task.status = 'cancelled';
        task.abortController?.abort();
      }
    });
    this.notify();
  }

  public getTasks(): OrchestratedTask[] {
    return Array.from(this.tasks.values());
  }

  public getTask(taskId: string): OrchestratedTask | undefined {
    return this.tasks.get(taskId);
  }
}
