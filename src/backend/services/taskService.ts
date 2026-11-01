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

export function getStoredTasks(): TaskItem[] {
  if (typeof window === 'undefined') return DEFAULT_TASKS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TASKS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(DEFAULT_TASKS));
      return DEFAULT_TASKS;
    }
    return JSON.parse(raw);
  } catch {
    return DEFAULT_TASKS;
  }
}

export function saveStoredTasks(tasks: TaskItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    window.dispatchEvent(new CustomEvent('susi-tasks-updated', { detail: { tasks } }));
  } catch (err) {
    console.error('[taskService] Failed to cache tasks locally:', err);
  }
}

/**
 * Retrieves tasks with Supabase cloud sync when configured, falling back to local cache.
 */
export async function getTasks(): Promise<TaskItem[]> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      if (supabase) {
        const { data, error } = await supabase
          .from('tasks')
          .select('*')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          const mapped: TaskItem[] = data.map((t: any) => ({
            id: t.id,
            title: t.title,
            assignedAgent: (t.assigned_agent_id as any) || 'SUSI',
            progress: t.progress ?? 0,
            priority: (t.priority === 'urgent' ? 'Critical' : t.priority === 'high' ? 'High' : t.priority === 'low' ? 'Low' : 'Medium'),
            category: 'Operations',
            completed: (t.progress ?? 0) >= 100 || t.status === 'completed',
          }));
          saveStoredTasks(mapped);
          return mapped;
        }
      }
    } catch (err) {
      console.warn('[taskService] Supabase fetch fallback to local cache:', err);
    }
  }

  return getStoredTasks();
}

/**
 * Creates a task, persisting to Supabase when available and updating local cache.
 */
export async function createTask(
  data: Omit<TaskItem, 'id' | 'progress'> & { progress?: number }
): Promise<TaskItem> {
  const tasks = getStoredTasks();
  const newTask: TaskItem = {
    id: `task-${Date.now()}`,
    title: data.title,
    assignedAgent: data.assignedAgent,
    priority: data.priority,
    category: data.category || 'Operations',
    progress: data.progress ?? 0,
    completed: (data.progress ?? 0) >= 100,
  };

  const updated = [newTask, ...tasks];
  saveStoredTasks(updated);

  // Background Supabase persistence
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      if (supabase) {
        await (supabase as any).from('tasks').insert({
          title: newTask.title,
          progress: newTask.progress,
          status: newTask.completed ? 'completed' : 'in_progress',
          priority: newTask.priority === 'Critical' ? 'urgent' : newTask.priority.toLowerCase() as any,
          assigned_agent_id: newTask.assignedAgent,
        });
      }
    } catch (err) {
      console.warn('[taskService] Failed to persist new task to Supabase:', err);
    }
  }

  return newTask;
}

/**
 * Updates a task locally and syncs to Supabase.
 */
export async function updateTask(
  taskId: string,
  patch: Partial<TaskItem>
): Promise<TaskItem | null> {
  const tasks = getStoredTasks();
  let updatedTask: TaskItem | null = null;

  const updated = tasks.map((t) => {
    if (t.id === taskId) {
      updatedTask = { ...t, ...patch };
      if (patch.progress !== undefined) {
        updatedTask.completed = patch.progress >= 100;
      }
      return updatedTask;
    }
    return t;
  });

  if (updatedTask) {
    saveStoredTasks(updated);

    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        if (supabase) {
          const dbPatch: any = {};
          if (patch.title !== undefined) dbPatch.title = patch.title;
          if (patch.progress !== undefined) {
            dbPatch.progress = patch.progress;
            dbPatch.status = patch.progress >= 100 ? 'completed' : 'in_progress';
          }
          await (supabase as any).from('tasks').update(dbPatch).eq('id', taskId);
        }
      } catch (err) {
        console.warn('[taskService] Supabase task update notice:', err);
      }
    }
  }

  return updatedTask;
}

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

export async function deleteTask(taskId: string): Promise<boolean> {
  const tasks = getStoredTasks();
  const filtered = tasks.filter((t) => t.id !== taskId);
  if (filtered.length !== tasks.length) {
    saveStoredTasks(filtered);

    if (isSupabaseConfigured()) {
      try {
        const supabase = createClient();
        if (supabase) {
          await (supabase as any).from('tasks').delete().eq('id', taskId);
        }
      } catch (err) {
        console.warn('[taskService] Supabase task deletion notice:', err);
      }
    }
    return true;
  }
  return false;
}
