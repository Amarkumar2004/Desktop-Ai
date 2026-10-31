'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { GlobalNewsArticle } from '@/app/api/news/route';
import { CountryHighlight, computeCountryHighlights } from '@/lib/countryDetection';
import { useNewsEventMarkers, LiveEventMarker } from '@/lib/hooks/useNewsEventMarkers';

export interface UseNewsMonitoringReturn {
  articles: GlobalNewsArticle[];
  filteredArticles: GlobalNewsArticle[];
  countryHighlights: CountryHighlight[];
  selectedCountryCode: string | null;
  selectCountry: (code: string | null) => void;
  selectedCategory: string | null;
  selectCategory: (category: string | null) => void;
  isLoading: boolean;
  isRateLimited: boolean;
  isStale: boolean;
  lastUpdated: string | null;
  newArticlesCount: number;
  refreshNews: () => Promise<void>;
  source?: string;
  /** Currently active live-event markers keyed by country code. */
  activeMarkers: Map<string, LiveEventMarker>;
}

export interface UseNewsMonitoringOptions {
  /** Polling interval in ms. Sensible default: 2 minutes (120,000ms). */
  pollIntervalMs?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes sensible default
const LS_NEWS_ARTICLES   = 'susi_news_cached_articles';
const LS_NEWS_HIGHLIGHTS = 'susi_news_cached_highlights';
export const NEW_ARTICLE_TTL_MS = 5 * 60 * 1000; // 5 minutes freshness window

function normalizeHeadline(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sorting comparator for real-time news display:
 * 1. Freshly discovered articles (`isNew === true`) float to the very top.
 * 2. All articles are strictly sorted descending by publication timestamp (newest first).
 * 3. Ties broken by server ingestion timestamp.
 */
export function sortArticlesNewestFirst(a: GlobalNewsArticle, b: GlobalNewsArticle): number {
  if (a.isNew && !b.isNew) return -1;
  if (!a.isNew && b.isNew) return 1;

  const timeA = new Date(a.seendate).getTime() || a.ingestedAtMs || 0;
  const timeB = new Date(b.seendate).getTime() || b.ingestedAtMs || 0;
  if (timeB !== timeA) return timeB - timeA;

  return (b.ingestedAtMs || 0) - (a.ingestedAtMs || 0);
}

export function useNewsMonitoring(options: UseNewsMonitoringOptions = {}): UseNewsMonitoringReturn {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  // Hydrate from localStorage for instant, zero-flicker render if previous articles exist
  const [articles, setArticles] = useState<GlobalNewsArticle[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LS_NEWS_ARTICLES);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const now = Date.now();
            const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
            const valid = parsed.filter((a) => {
              const artTime = new Date(a.seendate).getTime() || a.ingestedAtMs || now;
              return now - artTime < TWELVE_HOURS_MS;
            });
            return valid.sort(sortArticlesNewestFirst);
          }
        }
      } catch {}
    }
    return [];
  });

  const [countryHighlights, setCountryHighlights] = useState<CountryHighlight[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LS_NEWS_HIGHLIGHTS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {}
    }
    return [];
  });

  const [selectedCountryCode, setSelectedCountryCode] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory]       = useState<string | null>(null);
  const [isLoading, setIsLoading]                     = useState<boolean>(true);
  const [isRateLimited, setIsRateLimited]             = useState<boolean>(false);
  const [isStale, setIsStale]                         = useState<boolean>(false);
  const [lastUpdated, setLastUpdated]                 = useState<string | null>(null);
  const [source, setSource]                           = useState<string>('none');

  // Live-event markers hook — only new (post-startup) articles activate markers.
  const { activeMarkers, processNewArticles } = useNewsEventMarkers();

  // Track discovery timestamp per article to sustain isNew throughout freshness window
  const discoveredAtMapRef = useRef<Map<string, number>>(new Map());
  const seenArticleIdsRef  = useRef<Set<string>>(new Set());
  const abortControllerRef = useRef<AbortController | null>(null);
  const isFetchingRef      = useRef<boolean>(false);

  const fetchNews = useCallback(async (isManualRefresh = false) => {
    // If a request is already running and this is not a manual refresh, avoid duplicate fetch
    if (isFetchingRef.current && !isManualRefresh) return;

    // Abort previous in-flight request if manual refresh requested
    if (abortControllerRef.current) abortControllerRef.current.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;
    isFetchingRef.current = true;

    try {
      setIsLoading(true);
      const url = `/api/news${isManualRefresh ? '?refresh=true' : ''}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) throw new Error(`News API responded with status ${res.status}`);

      const data = await res.json();

      if (data.success && Array.isArray(data.articles)) {
        const incoming: GlobalNewsArticle[] = data.articles;

        // If incoming is empty but we already have valid cached articles, preserve existing data
        if (incoming.length === 0) {
          setArticles((prev) => {
            if (prev.length > 0) {
              setIsStale(true);
              setCountryHighlights(computeCountryHighlights(prev));
              return prev;
            }
            setCountryHighlights([]);
            return [];
          });
          setLastUpdated(data.meta?.lastUpdated || null);
          setIsRateLimited(Boolean(data.meta?.rateLimited));
          setIsStale(Boolean(data.meta?.isStale || true));
          return;
        }

        const isFirstLoad = seenArticleIdsRef.current.size === 0;
        const nowMs = Date.now();

        // On first load, register all initial articles as seen with discovery timestamp 0 (not new)
        if (isFirstLoad) {
          incoming.forEach((a) => {
            const stableId = a.id || a.url;
            const norm = normalizeHeadline(a.title);
            seenArticleIdsRef.current.add(stableId);
            discoveredAtMapRef.current.set(stableId, 0);
            if (norm) discoveredAtMapRef.current.set(norm, 0);
          });
        }

        const processed = incoming.map((art) => {
          const stableId = art.id || art.url;
          const norm = normalizeHeadline(art.title);
          const existingDisc =
            discoveredAtMapRef.current.get(stableId) ??
            (norm ? discoveredAtMapRef.current.get(norm) : undefined);

          let isNew = false;
          if (!isFirstLoad) {
            if (existingDisc !== undefined) {
              // Retain active new status as long as within the 5-minute freshness window
              isNew = existingDisc > 0 && nowMs - existingDisc < NEW_ARTICLE_TTL_MS;
            } else {
              // Truly newly arrived article in this poll
              discoveredAtMapRef.current.set(stableId, nowMs);
              if (norm) discoveredAtMapRef.current.set(norm, nowMs);
              seenArticleIdsRef.current.add(stableId);
              isNew = true;
            }
          }

          return { ...art, id: stableId, isNew };
        });

        // Merge incoming articles with existing state, deduplicating strictly by ID and headline
        setArticles((prev) => {
          const map = new Map<string, GlobalNewsArticle>();
          const titleSet = new Set<string>();
          const now = Date.now();
          const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

          for (const item of processed) {
            const artTime = new Date(item.seendate).getTime() || item.ingestedAtMs || now;
            const norm = normalizeHeadline(item.title);
            if (now - artTime < TWELVE_HOURS_MS) {
              if (!norm || !titleSet.has(norm)) {
                map.set(item.id, item);
                if (norm) titleSet.add(norm);
              }
            }
          }

          for (const prevArt of prev) {
            const norm = normalizeHeadline(prevArt.title);
            if (!map.has(prevArt.id) && (!norm || !titleSet.has(norm))) {
              const artTime = new Date(prevArt.seendate).getTime() || prevArt.ingestedAtMs || now;
              if (now - artTime < TWELVE_HOURS_MS) {
                const disc =
                  discoveredAtMapRef.current.get(prevArt.id) ??
                  (norm ? discoveredAtMapRef.current.get(norm) : undefined) ??
                  0;
                const stillNew = disc > 0 && now - disc < NEW_ARTICLE_TTL_MS;
                map.set(prevArt.id, { ...prevArt, isNew: stillNew });
                if (norm) titleSet.add(norm);
              }
            }
          }

          const sorted = Array.from(map.values()).sort(sortArticlesNewestFirst);

          // Derive country highlights strictly from the current active news dataset.
          const activeHighlights = computeCountryHighlights(sorted);
          setCountryHighlights(activeHighlights);

          // Persist to client cache.
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(LS_NEWS_ARTICLES, JSON.stringify(sorted));
              localStorage.setItem(LS_NEWS_HIGHLIGHTS, JSON.stringify(activeHighlights));
            } catch {}
          }

          return sorted;
        });

        setLastUpdated(data.meta?.lastUpdated || (processed.length > 0 ? new Date().toISOString() : null));
        setIsRateLimited(Boolean(data.meta?.rateLimited));
        setIsStale(Boolean(data.meta?.isStale));
        setSource(data.meta?.source || 'unknown');

        // Notify the event-markers hook about the incoming batch.
        processNewArticles(processed);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;

      console.warn('[useNewsMonitoring] Fetch error, keeping cached news:', err);
      setIsStale(true);
      setArticles((prev) => {
        setCountryHighlights(computeCountryHighlights(prev));
        return prev;
      });
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [processNewArticles]);

  // Initial fetch and configurable polling loop with cleanup.
  useEffect(() => {
    fetchNews(false);

    const intervalId = setInterval(() => { fetchNews(false); }, pollIntervalMs);

    return () => {
      clearInterval(intervalId);
      abortControllerRef.current?.abort();
    };
  }, [fetchNews, pollIntervalMs]);

  // Foreground wakeup: refresh promptly when the app returns to the foreground
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const handleForegroundWakeup = () => {
      if (document.visibilityState === 'visible') {
        fetchNews(false);
      }
    };

    document.addEventListener('visibilitychange', handleForegroundWakeup);
    window.addEventListener('focus', handleForegroundWakeup);

    return () => {
      document.removeEventListener('visibilitychange', handleForegroundWakeup);
      window.removeEventListener('focus', handleForegroundWakeup);
    };
  }, [fetchNews]);

  // Periodic 60-second expiry sweep: automatically purges articles older than 12 hours from active state
  // and immediately triggers a refresh for new news if the feed drops to empty.
  useEffect(() => {
    const sweepInterval = setInterval(() => {
      const now = Date.now();
      const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
      setArticles((prev) => {
        const remaining = prev.filter((a) => {
          const artTime = new Date(a.seendate).getTime() || a.ingestedAtMs || now;
          return now - artTime < TWELVE_HOURS_MS;
        });
        if (remaining.length !== prev.length) {
          const activeHighlights = computeCountryHighlights(remaining);
          setCountryHighlights(activeHighlights);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(LS_NEWS_ARTICLES, JSON.stringify(remaining));
              localStorage.setItem(LS_NEWS_HIGHLIGHTS, JSON.stringify(activeHighlights));
            } catch {}
          }
          if (remaining.length === 0) {
            fetchNews(true);
          }
          return remaining;
        }
        return prev;
      });
    }, 60_000);

    return () => clearInterval(sweepInterval);
  }, [fetchNews]);

  const selectCountry = useCallback((code: string | null) => {
    setSelectedCountryCode((prev) => (prev === code ? null : code));
  }, []);

  const selectCategory = useCallback((cat: string | null) => {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
  }, []);

  const refreshNews = useCallback(async () => {
    await fetchNews(true);
  }, [fetchNews]);

  // Dynamic count of genuinely new articles currently active in feed
  const newArticlesCount = useMemo(() => {
    return articles.filter((a) => a.isNew).length;
  }, [articles]);

  const filteredArticles = useMemo(() => {
    const now = Date.now();
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;
    // Exclude any articles older than 12 hours
    let list = articles.filter((a) => {
      const artTime = new Date(a.seendate).getTime() || a.ingestedAtMs || now;
      return now - artTime < TWELVE_HOURS_MS;
    });

    if (selectedCountryCode) {
      const target = selectedCountryCode.toUpperCase();
      list = list.filter((art) =>
        art.countries.some((c) => c.code === target || c.code3 === target)
      );
    }

    if (selectedCategory) {
      if (selectedCategory === 'NEW') {
        list = list.filter((art) => art.isNew);
      } else {
        const catTarget = selectedCategory.toLowerCase();
        list = list.filter((art) => (art.category || '').toLowerCase() === catTarget);
      }
    }

    return [...list].sort(sortArticlesNewestFirst);
  }, [articles, selectedCountryCode, selectedCategory]);

  return {
    articles,
    filteredArticles,
    countryHighlights,
    selectedCountryCode,
    selectCountry,
    selectedCategory,
    selectCategory,
    isLoading,
    isRateLimited,
    isStale,
    lastUpdated,
    newArticlesCount,
    refreshNews,
    source,
    activeMarkers,
  };
}
