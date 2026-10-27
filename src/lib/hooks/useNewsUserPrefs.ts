'use client';

/**
 * useNewsUserPrefs
 *
 * Manages strictly per-user, client-side reading preferences:
 *   - readIds:           Set of canonical article IDs the user has marked as read.
 *   - deletedIds:        Set of canonical article IDs the user has dismissed (retained until 12h deadline).
 *   - bookmarkedRecords: Map of article IDs to saved BookmarkRecord metadata.
 *
 * Exact Semantics:
 *   - All:       Every active, non-deleted article, whether read or unread.
 *   - Unread:    Active articles not marked as read.
 *   - Read:      Active articles marked as read.
 *   - Deleted:   Articles the user dismissed, retained ONLY until the 12-hour deadline.
 *   - Saved:     Articles bookmarked by the user. Retains minimum display metadata even after
 *                the server's 12-hour retention window expires (clearly marked as archived/expired).
 *                Bookmarks NEVER extend server retention or re-inject into shared news cache.
 *
 * Multi-Tab Synchronization:
 *   - Listens to window 'storage' events so changes in any tab (mark read, delete, restore, bookmark)
 *     are immediately synchronized across all open tabs in the same browser profile.
 *   - Note: Cross-device sync requires authenticated cloud storage; localStorage is per-profile.
 *
 * Moving an article between read and unread NEVER deletes it.
 * Deleting an article removes it from the active feed (All, Unread, Read) and places it
 * in Deleted until permanent expiry at 12 hours.
 */

import { useState, useCallback, useEffect } from 'react';

export const LS_READ_IDS           = 'susi_news_read_ids';
export const LS_DELETED_IDS        = 'susi_news_deleted_ids';
export const LS_DELETED_RECORDS    = 'susi_news_deleted_records';
export const LS_BOOKMARKED_RECORDS = 'susi_news_bookmarked_records';

/** Permanent deletion deadline: 12 hours (matching server retention policy) */
export const PERMANENT_DELETION_DEADLINE_MS = 12 * 60 * 60 * 1000;

export interface DeletedRecord {
  id: string;
  deletedAt: number; // Unix timestamp ms
}

export interface BookmarkRecord {
  id: string; // Canonical URL
  title: string;
  url: string;
  domain: string;
  seendate: string;
  savedAt: number; // Unix timestamp ms
  countries?: { code: string; code3?: string; name: string; flag: string }[];
  category?: string;
  summary?: string;
}

export function lsLoadSet(key: string, storage?: Storage): Set<string> {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return new Set();
  try {
    const raw = store.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return new Set<string>(arr as string[]);
  } catch {}
  return new Set();
}

export function lsSaveSet(key: string, set: Set<string>, storage?: Storage): void {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(Array.from(set)));
  } catch {}
}

export function lsLoadDeletedRecords(storage?: Storage, now = Date.now()): Map<string, number> {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return new Map();

  const recordMap = new Map<string, number>();

  try {
    const rawRecords = store.getItem(LS_DELETED_RECORDS);
    if (rawRecords) {
      const parsed = JSON.parse(rawRecords);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item?.id && typeof item.deletedAt === 'number') {
            // Retained only until the 12-hour permanent deletion deadline
            if (now - item.deletedAt < PERMANENT_DELETION_DEADLINE_MS) {
              recordMap.set(item.id, item.deletedAt);
            }
          }
        }
      }
    } else {
      // Backwards-compatible migration from legacy LS_DELETED_IDS array
      const rawLegacy = store.getItem(LS_DELETED_IDS);
      if (rawLegacy) {
        const arr = JSON.parse(rawLegacy);
        if (Array.isArray(arr)) {
          for (const id of arr) {
            if (typeof id === 'string') {
              recordMap.set(id, now);
            }
          }
        }
      }
    }
  } catch {}

  return recordMap;
}

export function lsSaveDeletedRecords(records: Map<string, number>, storage?: Storage): void {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return;
  try {
    const arr = Array.from(records.entries()).map(([id, deletedAt]) => ({ id, deletedAt }));
    store.setItem(LS_DELETED_RECORDS, JSON.stringify(arr));
    store.setItem(LS_DELETED_IDS, JSON.stringify(Array.from(records.keys())));
  } catch {}
}

export function lsLoadBookmarkedRecords(storage?: Storage): Map<string, BookmarkRecord> {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return new Map();

  const map = new Map<string, BookmarkRecord>();
  try {
    const raw = store.getItem(LS_BOOKMARKED_RECORDS);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        for (const item of arr) {
          if (item?.id && item?.title) {
            map.set(item.id, item);
          }
        }
      }
    }
  } catch {}
  return map;
}

export function lsSaveBookmarkedRecords(records: Map<string, BookmarkRecord>, storage?: Storage): void {
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!store) return;
  try {
    const arr = Array.from(records.values());
    store.setItem(LS_BOOKMARKED_RECORDS, JSON.stringify(arr));
  } catch {}
}

export interface UseNewsUserPrefsReturn {
  /** Set of article IDs the user has marked as read. */
  readIds: Set<string>;
  /** Set of article IDs the user has dismissed (within the 12-hour window). */
  deletedIds: Set<string>;
  /** Currently bookmarked records keyed by article ID. */
  bookmarkedRecords: Map<string, BookmarkRecord>;
  /** Set of bookmarked article IDs. */
  bookmarkedIds: Set<string>;
  /** Mark an article as read. Idempotent. Does NOT delete the article. */
  markRead: (id: string) => void;
  /** Mark an article as unread. Idempotent. Does NOT delete the article. */
  markUnread: (id: string) => void;
  /** Permanently dismiss an article from active feeds. Placed in Deleted until deadline. */
  deleteArticle: (id: string) => void;
  /** Restore a previously deleted article back to active feed. */
  restoreArticle: (id: string) => void;
  /** Whether a given article ID is marked read. */
  isRead: (id: string) => boolean;
  /** Whether a given article ID is dismissed. */
  isDeleted: (id: string) => boolean;
  /** Whether a given article ID is saved/bookmarked. */
  isBookmarked: (id: string) => boolean;
  /** Toggle bookmark on an article. Saves minimum required metadata. */
  toggleBookmark: (article: {
    id: string;
    title: string;
    url: string;
    domain: string;
    seendate: string;
    countries?: { code: string; code3?: string; name: string; flag: string }[];
    category?: string;
    summary?: string;
  }) => void;
  /** Remove bookmark for an article ID. */
  removeBookmark: (id: string) => void;
  /** Timestamp when an article was deleted, or undefined. */
  getDeletedAt: (id: string) => number | undefined;
}

export function useNewsUserPrefs(): UseNewsUserPrefsReturn {
  const [readIds, setReadIds] = useState<Set<string>>(() => lsLoadSet(LS_READ_IDS));
  const [deletedRecords, setDeletedRecords] = useState<Map<string, number>>(() =>
    lsLoadDeletedRecords()
  );
  const [bookmarkedRecords, setBookmarkedRecords] = useState<Map<string, BookmarkRecord>>(() =>
    lsLoadBookmarkedRecords()
  );

  // Cross-Tab Synchronization via Window Storage Event
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (e: StorageEvent) => {
      if (!e.key) return;

      if (e.key === LS_READ_IDS) {
        try {
          const updated = lsLoadSet(LS_READ_IDS);
          setReadIds(updated);
        } catch {}
      }

      if (e.key === LS_DELETED_RECORDS || e.key === LS_DELETED_IDS) {
        try {
          const updatedRecords = lsLoadDeletedRecords();
          setDeletedRecords(updatedRecords);
        } catch {}
      }

      if (e.key === LS_BOOKMARKED_RECORDS) {
        try {
          const updatedBookmarks = lsLoadBookmarkedRecords();
          setBookmarkedRecords(updatedBookmarks);
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  // Periodic deadline cleanup: remove records older than 12 hours
  useEffect(() => {
    const cleanupExpiredDeletions = () => {
      const now = Date.now();
      setDeletedRecords((prev) => {
        let hasExpired = false;
        const next = new Map<string, number>();
        for (const [id, deletedAt] of prev.entries()) {
          if (now - deletedAt < PERMANENT_DELETION_DEADLINE_MS) {
            next.set(id, deletedAt);
          } else {
            hasExpired = true;
          }
        }
        if (hasExpired) {
          lsSaveDeletedRecords(next);
          return next;
        }
        return prev;
      });
    };

    cleanupExpiredDeletions();
    // Run cleanup check every 5 minutes
    const intervalId = setInterval(cleanupExpiredDeletions, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  const markRead = useCallback((id: string) => {
    setReadIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      lsSaveSet(LS_READ_IDS, next);
      return next;
    });
  }, []);

  const markUnread = useCallback((id: string) => {
    setReadIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      lsSaveSet(LS_READ_IDS, next);
      return next;
    });
  }, []);

  const deleteArticle = useCallback((id: string) => {
    setDeletedRecords((prev) => {
      if (prev.has(id)) return prev;
      const next = new Map(prev);
      next.set(id, Date.now());
      lsSaveDeletedRecords(next);
      return next;
    });
  }, []);

  const restoreArticle = useCallback((id: string) => {
    setDeletedRecords((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      lsSaveDeletedRecords(next);
      return next;
    });
  }, []);

  const toggleBookmark = useCallback((article: {
    id: string;
    title: string;
    url: string;
    domain: string;
    seendate: string;
    countries?: { code: string; code3?: string; name: string; flag: string }[];
    category?: string;
    summary?: string;
  }) => {
    setBookmarkedRecords((prev) => {
      const next = new Map(prev);
      if (next.has(article.id)) {
        next.delete(article.id);
      } else {
        next.set(article.id, {
          id: article.id,
          title: article.title,
          url: article.url,
          domain: article.domain,
          seendate: article.seendate,
          savedAt: Date.now(),
          countries: article.countries,
          category: article.category,
          summary: article.summary,
        });
      }
      lsSaveBookmarkedRecords(next);
      return next;
    });
  }, []);

  const removeBookmark = useCallback((id: string) => {
    setBookmarkedRecords((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      lsSaveBookmarkedRecords(next);
      return next;
    });
  }, []);

  const isRead = useCallback((id: string) => readIds.has(id), [readIds]);
  const isDeleted = useCallback((id: string) => deletedRecords.has(id), [deletedRecords]);
  const isBookmarked = useCallback((id: string) => bookmarkedRecords.has(id), [bookmarkedRecords]);
  const getDeletedAt = useCallback((id: string) => deletedRecords.get(id), [deletedRecords]);

  // Derived sets
  const deletedIds = new Set(deletedRecords.keys());
  const bookmarkedIds = new Set(bookmarkedRecords.keys());

  return {
    readIds,
    deletedIds,
    bookmarkedRecords,
    bookmarkedIds,
    markRead,
    markUnread,
    deleteArticle,
    restoreArticle,
    isRead,
    isDeleted,
    isBookmarked,
    toggleBookmark,
    removeBookmark,
    getDeletedAt,
  };
}
