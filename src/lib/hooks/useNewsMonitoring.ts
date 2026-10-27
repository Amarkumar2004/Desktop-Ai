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

export function useNewsMonitoring(options: UseNewsMonitoringOptions = {}): UseNewsMonitoringReturn {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  // Hydrate from localStorage for instant, zero-flicker render if previous articles exist
  const [articles, setArticles] = useState<GlobalNewsArticle[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem(LS_NEWS_ARTICLES);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
  const [isLoading, setIsLoading]         = useState<boolean>(true);
  const [isRateLimited, setIsRateLimited] = useState<boolean>(false);
  const [isStale, setIsStale]             = useState<boolean>(false);
  const [lastUpdated, setLastUpdated]     = useState<string | null>(null);
  const [newArticlesCount, setNewArticlesCount] = useState<number>(0);
  const [source, setSource]               = useState<string>('none');

  // Live-event markers hook — only new (post-startup) articles activate markers.
  const { activeMarkers, processNewArticles } = useNewsEventMarkers();

  // Set of seen article IDs to identify genuinely newly arrived articles.
  // Uses `article.id` (canonical URL) as the stable deduplication key.
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
        let freshlyDiscovered = 0;

        const processed = incoming.map((art) => {
          // Use article.id (canonical URL) as the stable dedup key.
          const stableId = art.id || art.url;
          const isKnown  = seenArticleIdsRef.current.has(stableId);
          const isNew    = !isFirstLoad && !isKnown;
          if (isNew) freshlyDiscovered += 1;

          seenArticleIdsRef.current.add(stableId);

          return { ...art, id: stableId, isNew };
        });

        // On first load, register all IDs without marking any as new.
        if (isFirstLoad) {
          incoming.forEach((a) => seenArticleIdsRef.current.add(a.id || a.url));
        }

        setArticles(processed);

        // Derive country highlights strictly from the current active news dataset.
        const activeHighlights = computeCountryHighlights(processed);
        setCountryHighlights(activeHighlights);

        // Persist to client cache.
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(LS_NEWS_ARTICLES, JSON.stringify(processed));
            localStorage.setItem(LS_NEWS_HIGHLIGHTS, JSON.stringify(activeHighlights));
          } catch {}
        }

        setLastUpdated(data.meta?.lastUpdated || (processed.length > 0 ? new Date().toISOString() : null));
        setIsRateLimited(Boolean(data.meta?.rateLimited));
        setIsStale(Boolean(data.meta?.isStale));
        setSource(data.meta?.source || 'unknown');

        // Notify the event-markers hook about the incoming batch.
        // The hook internally distinguishes first-load (startup) articles from
        // genuinely new post-startup articles.
        processNewArticles(processed);

        if (freshlyDiscovered > 0) {
          setNewArticlesCount((prev) => prev + freshlyDiscovered);
        }
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

  const selectCountry = useCallback((code: string | null) => {
    setSelectedCountryCode((prev) => (prev === code ? null : code));
  }, []);

  const refreshNews = useCallback(async () => {
    await fetchNews(true);
  }, [fetchNews]);

  const filteredArticles = useMemo(() => {
    if (!selectedCountryCode) return articles;
    const target = selectedCountryCode.toUpperCase();
    return articles.filter((art) =>
      art.countries.some((c) => c.code === target || c.code3 === target)
    );
  }, [articles, selectedCountryCode]);

  return {
    articles,
    filteredArticles,
    countryHighlights,
    selectedCountryCode,
    selectCountry,
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
