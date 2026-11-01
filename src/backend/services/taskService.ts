import type { TaskItem } from '@/types/dashboard';
import { INITIAL_TASKS } from '@/data/initialData';
import { createClient, isSupabaseConfigured } from '@/backend/supabase/client';

const STORAGE_KEY_TASKS = 'susi_ai_tasks_v2';

const DEFAULT_TASKS: TaskItem[] = INITIAL_TASKS.map((t) => ({
  id: t.id,
  title: t.title,
  assignedAgent: (t.assignedAgent as 'LEX' | 'SUSI' | 'SPY' | 'YORU') || 'SUSI',
  progress: t.progress,
  priority: (t.priority as 'High' | 'Critical' | 'Medium' | 'Low') || 'Medium',
  category: t.category || 'System',
  completed: t.progress === 100,
}));

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
        const mapped: TaskItem[] = data.map((t: any) => ({
          id: t.id,
          title: t.title,
          assignedAgent: (t.assigned_agent as any) || 'SUSI',
          progress: t.progress ?? 0,
          priority:
            t.priority === 'urgent' || t.priority === 'Critical' || t.priority === 'critical'
              ? 'Critical'
              : t.priority === 'high' || t.priority === 'High'
              ? 'High'
              : t.priority === 'low' || t.priority === 'Low'
              ? 'Low'
              : 'Medium',
          category: t.category || 'Operations',
          completed: Boolean(t.completed) || (t.progress ?? 0) >= 100 || t.status === 'completed',
        }));
        saveStoredTasks(mapped);
        return mapped;
      }
    }
  }

  return getStoredTasks();
}

/**
 * Creates a task, persisting to Supabase when configured and updating local cache.
 */
export async function createTask(
  data: Omit<TaskItem, 'id' | 'progress'> & {
    id?: string;
    progress?: number;
    userId?: string;
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
      const dbPatch: any = {};
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
        dbPatch.status = patch.status;
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
