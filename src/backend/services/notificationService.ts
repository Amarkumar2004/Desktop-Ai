import type { NotificationItem } from '@/types/dashboard';
import { INITIAL_NOTIFICATIONS } from '@/data/initialData';

const STORAGE_KEY_NOTIFICATIONS = 'susi_ai_notifications_v2';

export function getStoredNotifications(): NotificationItem[] {
  if (typeof window === 'undefined') return INITIAL_NOTIFICATIONS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(INITIAL_NOTIFICATIONS));
      return INITIAL_NOTIFICATIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_NOTIFICATIONS;
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
