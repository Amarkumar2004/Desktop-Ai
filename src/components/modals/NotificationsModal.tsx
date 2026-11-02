'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  X, Bell, CheckCheck, Globe, RotateCcw, ExternalLink, Filter,
  BookOpen, Trash2, RotateCcw as Restore, Eye, EyeOff, Bookmark, Search, Tag,
} from 'lucide-react';
import { NotificationItem } from '@/types/dashboard';
import type { GlobalNewsArticle } from '@/app/api/news/route';
import { formatTimeAgo } from '@/lib/countryDetection';
import { BookmarkRecord } from '@/lib/hooks/useNewsUserPrefs';

export type NewsFilterTab = 'all' | 'unread' | 'read' | 'deleted' | 'saved';

export interface DisplayArticle {
  id: string;
  url: string;
  title: string;
  domain: string;
  seendate: string;
  timeAgo: string;
  summary?: string;
  category?: string;
  countries: {
    code: string;
    code3?: string;
    name: string;
    flag: string;
  }[];
  isNew?: boolean;
  isExpired?: boolean;
}

export interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllAsRead: () => void;
  initialTab?: 'notifications' | 'news';
  newsArticles?: GlobalNewsArticle[];
  isLoadingNews?: boolean;
  isStaleNews?: boolean;
  onRefreshNews?: () => void;
  selectedCountryCode?: string | null;
  onSelectCountry?: (code: string | null) => void;
  // Per-user article preferences
  readIds?: Set<string>;
  deletedIds?: Set<string>;
  bookmarkedRecords?: Map<string, BookmarkRecord>;
  bookmarkedIds?: Set<string>;
  onMarkRead?: (id: string) => void;
  onMarkUnread?: (id: string) => void;
  onDeleteArticle?: (id: string) => void;
  onRestoreArticle?: (id: string) => void;
  onToggleBookmark?: (article: {
    id: string;
    title: string;
    url: string;
    domain: string;
    seendate: string;
    countries?: { code: string; code3?: string; name: string; flag: string }[];
    category?: string;
    summary?: string;
  }) => void;
}

export default function NotificationsModal({
  isOpen,
  onClose,
  notifications = [],
  onMarkAllAsRead,
  initialTab = 'notifications',
  newsArticles = [],
  isLoadingNews = false,
  isStaleNews = false,
  onRefreshNews,
  selectedCountryCode = null,
  onSelectCountry,
  readIds = new Set(),
  deletedIds = new Set(),
  bookmarkedRecords = new Map(),
  bookmarkedIds = new Set(),
  onMarkRead,
  onMarkUnread,
  onDeleteArticle,
  onRestoreArticle,
  onToggleBookmark,
}: NotificationsModalProps) {
  const [activeTab, setActiveTab] = useState<'notifications' | 'news'>(initialTab);
  const [newsFilterTab, setNewsFilterTab] = useState<NewsFilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Synchronize tab whenever initialTab or modal opens.
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => n.unread).length,
    [notifications]
  );

  // ------------------------------------------------------------------
  // Derive article lists for each filter tab with composition.
  // ------------------------------------------------------------------
  const articlesForDisplay = useMemo(() => {
    let baseList: DisplayArticle[] = [];

    if (newsFilterTab === 'saved') {
      // Map bookmarks into display articles; check if still active on server
      baseList = Array.from(bookmarkedRecords.values()).map((rec) => {
        const active = newsArticles.find((a) => a.id === rec.id);
        if (active) {
          return {
            ...active,
            isExpired: false,
          };
        }
        return {
          id: rec.id,
          title: rec.title,
          url: rec.url,
          domain: rec.domain,
          seendate: rec.seendate,
          timeAgo: formatTimeAgo(rec.seendate),
          summary: rec.summary,
          category: rec.category,
          countries: rec.countries || [],
          isExpired: true,
        };
      });
    } else {
      const now = Date.now();
      const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
      // Filter out any articles older than 12 hours from active view
      const activeUnexpired = newsArticles.filter((a) => {
        const time = new Date(a.seendate).getTime() || 0;
        return now - time < TWELVE_HOURS_MS;
      });

      // Active news feed: filter based on read/deleted status
      switch (newsFilterTab) {
        case 'unread':
          baseList = activeUnexpired.filter((a) => !deletedIds.has(a.id) && !readIds.has(a.id));
          break;
        case 'read':
          baseList = activeUnexpired.filter((a) => !deletedIds.has(a.id) && readIds.has(a.id));
          break;
        case 'deleted':
          baseList = activeUnexpired.filter((a) => deletedIds.has(a.id));
          break;
        case 'all':
        default:
          baseList = activeUnexpired.filter((a) => !deletedIds.has(a.id));
          break;
      }
    }

    // Compose with country filter
    if (selectedCountryCode) {
      const codeUpper = selectedCountryCode.toUpperCase();
      baseList = baseList.filter((a) =>
        a.countries.some((c) => c.code === codeUpper || c.code3 === codeUpper)
      );
    }

    // Compose with topic category filter
    if (selectedCategory !== 'all') {
      baseList = baseList.filter((a) => a.category === selectedCategory);
    }

    // Compose with keyword search query (title + summary, case-insensitive)
    if (searchQuery.trim().length > 0) {
      const q = searchQuery.trim().toLowerCase();
      baseList = baseList.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.summary && a.summary.toLowerCase().includes(q))
      );
    }

    // Strictly sort so newly arrived articles float to the top, followed by newest publication date
    baseList.sort((a, b) => {
      if (a.isNew && !b.isNew) return -1;
      if (!a.isNew && b.isNew) return 1;
      const timeA = new Date(a.seendate).getTime() || 0;
      const timeB = new Date(b.seendate).getTime() || 0;
      return timeB - timeA;
    });

    return baseList;
  }, [
    newsArticles,
    newsFilterTab,
    bookmarkedRecords,
    deletedIds,
    readIds,
    selectedCountryCode,
    selectedCategory,
    searchQuery,
  ]);

  const unreadNewsCount = useMemo(() => {
    const now = Date.now();
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    return newsArticles.filter((a) => {
      const time = new Date(a.seendate).getTime() || 0;
      return now - time < TWELVE_HOURS_MS && !deletedIds.has(a.id) && !readIds.has(a.id);
    }).length;
  }, [newsArticles, deletedIds, readIds]);

  const deletedNewsCount = useMemo(() => {
    const now = Date.now();
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    return newsArticles.filter((a) => {
      const time = new Date(a.seendate).getTime() || 0;
      return now - time < TWELVE_HOURS_MS && deletedIds.has(a.id);
    }).length;
  }, [newsArticles, deletedIds]);
  const savedNewsCount = useMemo(() => bookmarkedRecords.size, [bookmarkedRecords]);

  const handleToggleRead = useCallback(
    (id: string) => {
      if (readIds.has(id)) onMarkUnread?.(id);
      else onMarkRead?.(id);
    },
    [readIds, onMarkRead, onMarkUnread]
  );

  const resetAllFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory('all');
    onSelectCountry?.(null);
  }, [onSelectCountry]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg rounded-2xl border border-stone-200 shadow-2xl p-5 space-y-4 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal-level Tab: Notifications | Global News ── */}
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 shrink-0">
          <div className="flex items-center gap-1.5 p-1 bg-stone-100 rounded-xl">
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'notifications'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Bell className="w-3.5 h-3.5 text-amber-600" />
              <span>Notifications</span>
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 text-[9px] font-extrabold bg-amber-500 text-white rounded-full">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('news')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'news'
                  ? 'bg-white text-stone-900 shadow-xs'
                  : 'text-stone-500 hover:text-stone-800'
              }`}
            >
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              <span>Global News</span>
              {newsArticles.length > 0 && (
                <span className="px-1.5 py-0.2 text-[9px] font-extrabold bg-stone-200 text-stone-700 rounded-full">
                  {newsArticles.length}
                </span>
              )}
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            title="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ──────────────────────────────────────────────── */}
        {/* Tab 1 : System Notifications                     */}
        {/* ──────────────────────────────────────────────── */}
        {activeTab === 'notifications' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-3">
            <div className="text-[11px] text-stone-500">
              Fleet telemetry, security logs, and agent activity records
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              {notifications.length === 0 ? (
                <div className="py-12 text-center text-xs text-stone-400 italic">
                  No notifications to display.
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`p-3 rounded-xl border text-xs transition-all ${
                      n.unread
                        ? 'bg-amber-50/40 border-amber-200/70'
                        : 'bg-stone-50/50 border-stone-200/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-bold text-stone-900 text-xs">{n.title}</span>
                      <span className="text-[10px] text-stone-400 font-medium">{n.time}</span>
                    </div>
                    <p className="text-stone-600 leading-relaxed">{n.message}</p>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-stone-100 shrink-0">
              <button
                onClick={onMarkAllAsRead}
                disabled={unreadCount === 0}
                className="text-xs font-semibold text-amber-700 hover:text-amber-900 disabled:opacity-40 flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all as read
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {/* ──────────────────────────────────────────────── */}
        {/* Tab 2 : Global News Feed                         */}
        {/* ──────────────────────────────────────────────── */}
        {activeTab === 'news' && (
          <div className="flex-1 flex flex-col min-h-0 gap-2.5">
            {/* ── Toolbar: country filter + refresh ── */}
            <div className="flex items-center justify-between text-xs shrink-0">
              <div className="flex items-center gap-2 flex-wrap">
                {selectedCountryCode ? (
                  <div className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-900 border border-amber-200/80 rounded-lg px-2 py-0.5 text-[11px] font-semibold">
                    <Filter className="w-3 h-3 text-amber-600" />
                    <span>Filtered: <strong>{selectedCountryCode}</strong></span>
                    <button
                      onClick={() => onSelectCountry?.(null)}
                      className="ml-1 text-amber-700 hover:text-amber-950 font-bold hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-stone-500">
                    Live global news radar
                  </span>
                )}
                {isStaleNews && (
                  <span
                    className="text-[9px] font-semibold bg-stone-100 text-stone-600 border border-stone-200 px-1.5 py-0.5 rounded"
                    title="Preserved from cache during API cooldown"
                  >
                    Cached
                  </span>
                )}
              </div>

              {onRefreshNews && (
                <button
                  onClick={onRefreshNews}
                  disabled={isLoadingNews}
                  title="Refresh news feed"
                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-stone-600 hover:text-stone-900 bg-stone-100 hover:bg-stone-200/80 px-2 py-1 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw className={`w-3 h-3 ${isLoadingNews ? 'animate-spin text-amber-600' : ''}`} />
                  <span>Refresh</span>
                </button>
              )}
            </div>

            {/* ── Search Bar & Topic Category Filters ── */}
            <div className="space-y-1.5 shrink-0">
              <div className="relative flex items-center">
                <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search headlines or summaries..."
                  className="w-full bg-stone-50 border border-stone-200 focus:border-amber-400 focus:bg-white rounded-lg pl-8 pr-7 py-1 text-xs text-stone-800 placeholder-stone-400 outline-none transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 text-stone-400 hover:text-stone-700 cursor-pointer"
                    title="Clear search"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Topic Category Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none text-[10px]">
                {[
                  { id: 'all', label: 'All Topics' },
                  { id: 'Technology', label: 'Tech' },
                  { id: 'Politics', label: 'Politics' },
                  { id: 'Finance', label: 'Finance' },
                  { id: 'Science', label: 'Science' },
                  { id: 'World', label: 'World' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(selectedCategory === cat.id ? 'all' : cat.id)}
                    className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === cat.id
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-stone-100 text-stone-600 hover:bg-stone-200/80 border border-transparent'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}

                {(searchQuery || selectedCategory !== 'all' || selectedCountryCode) && (
                  <button
                    onClick={resetAllFilters}
                    className="px-1.5 py-0.5 text-amber-700 hover:text-amber-950 hover:underline font-semibold text-[10px] whitespace-nowrap ml-auto cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>

            {/* ── Filter sub-tabs: All | Unread | Read | Deleted | Saved ── */}
            <div className="flex items-center gap-1 shrink-0 overflow-x-auto scrollbar-none">
              {(
                [
                  { id: 'all', label: 'All', count: newsArticles.filter((a) => !deletedIds.has(a.id)).length },
                  { id: 'unread', label: 'Unread', count: unreadNewsCount },
                  { id: 'read', label: 'Read', count: newsArticles.filter((a) => !deletedIds.has(a.id) && readIds.has(a.id)).length },
                  { id: 'deleted', label: 'Deleted', count: deletedNewsCount },
                  { id: 'saved', label: 'Saved', count: savedNewsCount },
                ] as const
              ).map(({ id, label, count }) => (
                <button
                  key={id}
                  onClick={() => setNewsFilterTab(id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    newsFilterTab === id
                      ? 'bg-stone-800 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200/80'
                  }`}
                >
                  {label}
                  {count > 0 && (
                    <span
                      className={`text-[9px] font-bold rounded-full px-1 ${
                        newsFilterTab === id
                          ? 'bg-white/20 text-white'
                          : 'bg-stone-300 text-stone-700'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ── Article list ── */}
            <div className="space-y-2 overflow-y-auto pr-1 flex-1">
              {isLoadingNews && newsArticles.length === 0 ? (
                <div className="space-y-3 py-4">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="p-3 rounded-xl border border-stone-100 bg-stone-50/50 animate-pulse space-y-2">
                      <div className="h-3.5 bg-stone-200 rounded w-4/5" />
                      <div className="h-2.5 bg-stone-200 rounded w-1/3" />
                    </div>
                  ))}
                </div>
              ) : articlesForDisplay.length === 0 ? (
                <div className="py-12 text-center text-xs text-stone-400 italic">
                  {newsFilterTab === 'saved'
                    ? 'No saved articles yet. Bookmark an article to access it here.'
                    : newsFilterTab === 'deleted'
                    ? 'No dismissed articles.'
                    : searchQuery || selectedCategory !== 'all'
                    ? 'No articles match the current search query or category filter.'
                    : selectedCountryCode
                    ? `No ${newsFilterTab === 'all' ? '' : newsFilterTab + ' '}articles match "${selectedCountryCode}".`
                    : newsFilterTab === 'unread'
                    ? 'All articles have been read.'
                    : newsFilterTab === 'read'
                    ? 'No read articles yet.'
                    : 'No news articles available. Upstream connecting...'}
                </div>
              ) : (
                articlesForDisplay.map((article) => {
                  const isArticleRead = readIds.has(article.id);
                  const isArticleDeleted = deletedIds.has(article.id);
                  const isArticleBookmarked = bookmarkedIds.has(article.id);
                  const hasCountry = article.countries.length > 0;
                  const dotColor = article.isNew
                    ? 'bg-amber-500'
                    : hasCountry
                    ? 'bg-emerald-500'
                    : 'bg-stone-400';

                  return (
                    <div
                      key={article.id}
                      className={`p-3 rounded-xl border transition-all flex items-start gap-2.5 group ${
                        isArticleRead
                          ? 'border-stone-200/50 bg-stone-50/20 opacity-70'
                          : 'border-stone-200/70 bg-stone-50/40 hover:border-amber-300 hover:bg-amber-50/20'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${dotColor} ${
                          article.isNew && !isArticleRead ? 'animate-ping' : ''
                        }`}
                      />

                      <div className="flex-1 min-w-0 space-y-1">
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => onMarkRead?.(article.id)}
                          className={`text-xs font-semibold leading-snug line-clamp-2 transition-colors flex items-center gap-1 group-hover:underline ${
                            isArticleRead
                              ? 'text-stone-500 hover:text-stone-700'
                              : 'text-stone-900 hover:text-amber-700'
                          }`}
                        >
                          <span>{article.title}</span>
                          <ExternalLink className="w-3 h-3 text-stone-400 group-hover:text-amber-600 shrink-0 inline opacity-0 group-hover:opacity-100 transition-opacity" />
                        </a>

                        {article.summary && (
                          <p className="text-[11px] text-stone-500 line-clamp-1 leading-normal">
                            {article.summary}
                          </p>
                        )}

                        <div className="flex items-center gap-2 text-[10px] text-stone-400 flex-wrap">
                          <span className="font-mono text-stone-500 tabular-nums shrink-0 min-w-[50px]">{formatTimeAgo(article.seendate) || article.timeAgo}</span>
                          <span className="text-stone-300 select-none">•</span>
                          <span className="text-stone-600 font-medium">{article.domain}</span>

                          {article.category && (
                            <span className="inline-flex items-center px-1.5 py-0.2 bg-stone-100 text-stone-600 rounded text-[9px] font-medium border border-stone-200/60">
                              {article.category}
                            </span>
                          )}

                          {article.countries.map((c) => (
                            <button
                              key={c.code}
                              onClick={(e) => {
                                e.stopPropagation();
                                onSelectCountry?.(selectedCountryCode === c.code ? null : c.code);
                              }}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors cursor-pointer ${
                                selectedCountryCode === c.code
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-white text-stone-700 border-stone-200 hover:bg-amber-50 hover:text-amber-800'
                              }`}
                              title={`Filter by ${c.name}`}
                            >
                              <span>{c.flag}</span>
                              <span>{c.code}</span>
                            </button>
                          ))}

                          {article.isNew && !isArticleRead && (
                            <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.2 bg-amber-500 text-white rounded">
                              New
                            </span>
                          )}

                          {article.isExpired && (
                            <span
                              className="text-[8px] font-semibold bg-stone-200/80 text-stone-600 px-1.5 py-0.2 rounded border border-stone-300"
                              title="Full server news content expired past 12-hour retention"
                            >
                              Archived · Expired from radar
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ── Per-article action buttons ── */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Bookmark Button */}
                        <button
                          onClick={() =>
                            onToggleBookmark?.({
                              id: article.id,
                              title: article.title,
                              url: article.url,
                              domain: article.domain,
                              seendate: article.seendate,
                              countries: article.countries,
                              category: article.category,
                              summary: article.summary,
                            })
                          }
                          title={isArticleBookmarked ? 'Remove bookmark' : 'Save bookmark'}
                          className={`p-1 rounded transition-colors cursor-pointer ${
                            isArticleBookmarked
                              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                              : 'text-stone-400 hover:text-amber-600 hover:bg-stone-200/60'
                          }`}
                        >
                          <Bookmark
                            className={`w-3 h-3 ${isArticleBookmarked ? 'fill-amber-500' : ''}`}
                          />
                        </button>

                        {!isArticleDeleted && (
                          <button
                            onClick={() => handleToggleRead(article.id)}
                            title={isArticleRead ? 'Mark as unread' : 'Mark as read'}
                            className="p-1 rounded text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
                          >
                            {isArticleRead ? (
                              <EyeOff className="w-3 h-3" />
                            ) : (
                              <BookOpen className="w-3 h-3" />
                            )}
                          </button>
                        )}

                        {isArticleDeleted ? (
                          <button
                            onClick={() => onRestoreArticle?.(article.id)}
                            title="Restore article"
                            className="p-1 rounded text-emerald-400 hover:text-emerald-700 hover:bg-emerald-100/60 transition-colors cursor-pointer"
                          >
                            <Restore className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            onClick={() => onDeleteArticle?.(article.id)}
                            title="Dismiss article"
                            className="p-1 rounded text-stone-400 hover:text-rose-600 hover:bg-rose-100/60 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ── News Footer ── */}
            <div className="flex items-center justify-between pt-2 border-t border-stone-100 shrink-0 text-xs">
              <span className="text-[11px] text-stone-500">
                {articlesForDisplay.length}{' '}
                {articlesForDisplay.length === 1 ? 'article' : 'articles'}
                {newsFilterTab !== 'all' ? ` · ${newsFilterTab}` : ''}
                {selectedCategory !== 'all' ? ` · ${selectedCategory}` : ''}
              </span>
              <button
                onClick={onClose}
                className="px-4 py-1.5 bg-stone-800 hover:bg-stone-900 text-white text-xs font-medium rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
