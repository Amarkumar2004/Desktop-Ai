import type { TaskItem } from '@/types/dashboard';
import type { Task, TaskStep, Json } from '@/backend/types/database';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

const STORAGE_KEY_TASKS = 'susi_ai_tasks_v3';

const DEFAULT_TASKS: TaskItem[] = [];

let memoryTasks: TaskItem[] | null = null;

export function getStoredTasks(): TaskItem[] {
  if (typeof window === 'undefined') {
    return memoryTasks || [...DEFAULT_TASKS];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TASKS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(DEFAULT_TASKS));
      return [...DEFAULT_TASKS];
    }
    return JSON.parse(raw);
  } catch {
    return memoryTasks || [...DEFAULT_TASKS];
  }
}

export function saveStoredTasks(tasks: TaskItem[]): void {
  memoryTasks = tasks;
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent('susi-tasks-updated', { detail: { tasks } }));
  } catch (err) {
    console.error('[taskService] Failed to cache tasks locally:', err);
  }
}

export interface TaskFilterOptions {
  userId?: string;
  workspaceId?: string;
}

/**
 * Retrieves tasks with real Supabase persistence when configured, falling back to local cache when offline.
 */
export async function getTasks(filter?: TaskFilterOptions): Promise<TaskItem[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });

      if (filter?.userId) {
        query = query.eq('user_id', filter.userId);
      }
      if (filter?.workspaceId) {
        query = query.eq('workspace_id', filter.workspaceId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('[taskService] Supabase fetch error:', error.message);
        throw new Error(`Failed to fetch tasks from database: ${error.message} (${error.code})`);
      }

      if (data) {
        const mapped: TaskItem[] = data.map((t: Record<string, unknown>) => {
          const prog = typeof t.progress === 'number' ? t.progress : 0;
          return {
            id: String(t.id),
            title: String(t.title || ''),
            assignedAgent: (t.assigned_agent as 'LEX' | 'SUSI' | 'SPY' | 'EURO') || 'SUSI',
            progress: prog,
            priority:
              t.priority === 'urgent' || t.priority === 'Critical' || t.priority === 'critical'
                ? 'Critical'
                : t.priority === 'high' || t.priority === 'High'
                ? 'High'
                : t.priority === 'low' || t.priority === 'Low'
                ? 'Low'
                : 'Medium',
            category: typeof t.category === 'string' ? t.category : 'Operations',
            completed: Boolean(t.completed) || prog >= 100 || t.status === 'completed',
            userId: typeof t.user_id === 'string' ? t.user_id : null,
          };
        });
        saveStoredTasks(mapped);
        return mapped;
      }
    }
  }

  const stored = getStoredTasks();
  if (filter?.userId) {
    return stored.filter((t) => t.userId === filter.userId);
  }
  return stored;
}

/**
 * Creates a task, persisting to Supabase when configured and updating local cache.
 */
export async function createTask(
  data: Omit<TaskItem, 'id' | 'progress'> & {
    id?: string;
    progress?: number;
    userId?: string | null;
    workspaceId?: string;
    description?: string;
  }
): Promise<TaskItem> {
  const taskId = data.id || `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const progress = data.progress ?? 0;
  const isCompleted = progress >= 100;

  const newTask: TaskItem = {
    id: taskId,
    title: data.title,
    assignedAgent: data.assignedAgent || 'SUSI',
    priority: data.priority || 'Medium',
    category: data.category || 'Operations',
    progress,
    completed: isCompleted,
    userId: data.userId || null,
  };

  // Real Supabase persistence
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { error } = await supabase
        .from('tasks')
        .insert({
          id: newTask.id,
          user_id: data.userId || null,
          workspace_id: data.workspaceId || null,
          title: newTask.title,
          description: data.description || null,
          assigned_agent: newTask.assignedAgent,
          priority: newTask.priority,
          status: isCompleted ? 'completed' : 'in_progress',
          category: newTask.category,
          progress: newTask.progress,
          completed: isCompleted,
        })
        .select()
        .single();

      if (error) {
        console.error('[taskService] Failed to persist new task to Supabase:', error.message);
        throw new Error(`Failed to persist task to database: ${error.message} (${error.code})`);
      }
    }
  }

  const tasks = getStoredTasks();
  const updated = [newTask, ...tasks.filter((t) => t.id !== newTask.id)];
  saveStoredTasks(updated);

  return newTask;
}

/**
 * Updates a task in Supabase and syncs to local cache.
 */
export async function updateTask(
  taskId: string,
  patch: Partial<TaskItem> & { status?: string; description?: string }
): Promise<TaskItem | null> {
  const tasks = getStoredTasks();
  const existing = tasks.find((t) => t.id === taskId);

  const updatedTask: TaskItem = existing
    ? {
        ...existing,
        ...patch,
        completed:
          patch.completed !== undefined
            ? patch.completed
            : patch.progress !== undefined
            ? patch.progress >= 100
            : existing.completed,
      }
    : {
        id: taskId,
        title: patch.title || 'Updated Task',
        assignedAgent: patch.assignedAgent || 'SUSI',
        priority: patch.priority || 'Medium',
        category: patch.category || 'Operations',
        progress: patch.progress ?? 0,
        completed: (patch.progress ?? 0) >= 100,
      };

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const dbPatch: Partial<Task> = {};
      if (patch.title !== undefined) dbPatch.title = patch.title;
      if (patch.assignedAgent !== undefined) dbPatch.assigned_agent = patch.assignedAgent;
      if (patch.priority !== undefined) dbPatch.priority = patch.priority;
      if (patch.category !== undefined) dbPatch.category = patch.category;
      if (patch.description !== undefined) dbPatch.description = patch.description;
      if (patch.progress !== undefined) {
        dbPatch.progress = patch.progress;
        if (patch.completed === undefined) {
          dbPatch.completed = patch.progress >= 100;
        }
      }
      if (patch.completed !== undefined) {
        dbPatch.completed = patch.completed;
      }
      if (patch.status !== undefined) {
        dbPatch.status = patch.status as Task['status'];
      } else if (patch.completed === true || (patch.progress !== undefined && patch.progress >= 100)) {
        dbPatch.status = 'completed';
        dbPatch.completed_at = new Date().toISOString();
      } else if (patch.completed === false) {
        dbPatch.status = 'in_progress';
      }

      const { error } = await supabase.from('tasks').update(dbPatch).eq('id', taskId);

      if (error) {
        console.error('[taskService] Failed to update task in Supabase:', error.message);
        throw new Error(`Failed to update task in database: ${error.message} (${error.code})`);
      }
    }
  }

  const updatedList = tasks.map((t) => (t.id === taskId ? updatedTask : t));
  if (!tasks.some((t) => t.id === taskId)) {
    updatedList.unshift(updatedTask);
  }
  saveStoredTasks(updatedList);

  return updatedTask;
}

/**
 * Toggles a task between completed (100%) and active.
 */
export async function toggleTaskCompleted(taskId: string): Promise<TaskItem | null> {
  const tasks = getStoredTasks();
  const current = tasks.find((t) => t.id === taskId);
  if (!current) return null;

  const isNowCompleted = !current.completed;
  return updateTask(taskId, {
    completed: isNowCompleted,
    progress: isNowCompleted ? 100 : Math.min(current.progress, 90),
  });
}

/**
 * Deletes a task from Supabase and removes it from local cache.
 */
export async function deleteTask(taskId: string): Promise<boolean> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      const { error } = await supabase.from('tasks').delete().eq('id', taskId);
      if (error) {
        console.error('[taskService] Failed to delete task in Supabase:', error.message);
        throw new Error(`Failed to delete task from database: ${error.message} (${error.code})`);
      }
    }
  }

  const tasks = getStoredTasks();
  const filtered = tasks.filter((t) => t.id !== taskId);
  const existed = filtered.length !== tasks.length;
  if (existed) {
    saveStoredTasks(filtered);
  }
  return existed;
}

// ------------------------------------------------------------------------------
// Task Steps (Subtask / Multi-Agent Step Tracking)
// ------------------------------------------------------------------------------
const memoryTaskSteps = new Map<string, TaskStep[]>();

export async function getTaskSteps(taskId: string): Promise<TaskStep[]> {
  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('task_steps')
          .select('*')
          .eq('task_id', taskId)
          .order('step_index', { ascending: true });
        if (!error && data) {
          memoryTaskSteps.set(taskId, data);
          return data;
        }
      } catch {}
    }
  }
  return memoryTaskSteps.get(taskId) || [];
}

export interface CreateTaskStepInput {
  id?: string;
  task_id: string;
  step_index: number;
  action_type: string;
  title?: string | null;
  payload?: Json;
  status?: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: Json | null;
  error?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export async function createTaskStep(
  data: CreateTaskStepInput
): Promise<TaskStep> {
  const stepId = data.id || `step_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const newStep: TaskStep = {
    id: stepId,
    task_id: data.task_id,
    step_index: data.step_index,
    action_type: data.action_type,
    title: data.title ?? null,
    payload: data.payload ?? {},
    status: data.status || 'pending',
    result: data.result ?? null,
    error: data.error ?? null,
    started_at: data.started_at ?? null,
    completed_at: data.completed_at ?? null,
  };

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      try {
        await supabase.from('task_steps').insert(newStep);
      } catch {}
    }
  }

  const existing = memoryTaskSteps.get(data.task_id) || [];
  existing.push(newStep);
  memoryTaskSteps.set(data.task_id, existing);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('susi-task-step-updated', { detail: { step: newStep } }));
  }

  return newStep;
}

export async function updateTaskStep(
  stepId: string,
  patch: Partial<TaskStep>
): Promise<TaskStep | null> {
  let foundStep: TaskStep | null = null;

  for (const [, steps] of memoryTaskSteps.entries()) {
    const idx = steps.findIndex((s) => s.id === stepId);
    if (idx !== -1) {
      steps[idx] = { ...steps[idx], ...patch };
      foundStep = steps[idx];
      break;
    }
  }

  if (isSupabaseConfigured()) {
    const supabase = createClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('task_steps')
          .update(patch)
          .eq('id', stepId)
          .select()
          .single();
        if (!error && data) {
          foundStep = data;
        }
      } catch {}
    }
  }

  if (foundStep && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('susi-task-step-updated', { detail: { step: foundStep } }));
  }

  return foundStep;
}
