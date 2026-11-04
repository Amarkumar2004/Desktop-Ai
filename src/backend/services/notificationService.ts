import type { NotificationItem } from '@/types/dashboard';

const STORAGE_KEY_NOTIFICATIONS = 'susi_ai_notifications_v3';

export function getStoredNotifications(): NotificationItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveStoredNotifications(notifs: NotificationItem[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(notifs));
  } catch (err) {
    console.error('Failed to save notifications', err);
  }
}

export async function getNotifications(): Promise<NotificationItem[]> {
  return getStoredNotifications();
}

export async function addNotification(
  item: Omit<NotificationItem, 'id' | 'time'>
): Promise<NotificationItem> {
  const notifs = getStoredNotifications();
  const newNotif: NotificationItem = {
    id: `notif-${Date.now()}`,
    time: 'Just now',
    ...item,
  };
  const updated = [newNotif, ...notifs];
  saveStoredNotifications(updated);
  return newNotif;
}

export async function markAsRead(id: string): Promise<void> {
  const notifs = getStoredNotifications();
  const updated = notifs.map((n) => (n.id === id ? { ...n, read: true } : n));
  saveStoredNotifications(updated);
}

export async function markAllAsRead(): Promise<void> {
  const notifs = getStoredNotifications();
  const updated = notifs.map((n) => ({ ...n, read: true }));
  saveStoredNotifications(updated);
}

export async function clearAllNotifications(): Promise<void> {
  saveStoredNotifications([]);
}
