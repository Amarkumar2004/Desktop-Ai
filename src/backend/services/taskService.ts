import type { TaskItem } from '@/types/dashboard';
import { INITIAL_TASKS } from '@/data/initialData';

const STORAGE_KEY_TASKS = 'susi_ai_tasks_v2';

// Convert INITIAL_TASKS into TaskItem format if needed
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
    console.error('Failed to save tasks to storage', err);
  }
}

export async function getTasks(): Promise<TaskItem[]> {
  return getStoredTasks();
}

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
  return newTask;
}

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
  }
  return updatedTask;
}

export async function toggleTaskCompleted(taskId: string): Promise<TaskItem | null> {
  const tasks = getStoredTasks();
  let updatedTask: TaskItem | null = null;

  const updated = tasks.map((t) => {
    if (t.id === taskId) {
      const isNowCompleted = !t.completed;
      updatedTask = {
        ...t,
        completed: isNowCompleted,
        progress: isNowCompleted ? 100 : Math.min(t.progress, 90),
      };
      return updatedTask;
    }
    return t;
  });

  if (updatedTask) {
    saveStoredTasks(updated);
  }
  return updatedTask;
}

export async function deleteTask(taskId: string): Promise<boolean> {
  const tasks = getStoredTasks();
  const filtered = tasks.filter((t) => t.id !== taskId);
  saveStoredTasks(filtered);
  return filtered.length !== tasks.length;
}
