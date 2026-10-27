'use client';

/**
 * useNewsEventMarkers
 *
 * Manages temporary 120-second live-event markers per country code.
 *
 * Rules:
 * - Only NEW articles (not previously seen) may activate or refresh a marker.
 * - Each country has an independent expiry based on the timestamp of its LATEST
 *   new article. A new article for the SAME country refreshes (extends) that
 *   country's timer; it does NOT create a duplicate marker.
 * - A cached response with unchanged articles never reactivates expired markers.
 * - Markers are removed automatically when their 120-second window elapses.
 * - All timers are cleaned up on unmount.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GlobalNewsArticle } from '@/app/api/news/route';

/** Milliseconds a live-event marker remains visible after the latest new article. */
export const MARKER_LIFETIME_MS = 120_000; // 120 seconds

export interface LiveEventMarker {
  /** ISO 3166-1 alpha-2 country code. */
  countryCode: string;
  /** Unix timestamp (ms) of the most recent qualifying new article for this country. */
  lastEventAt: number;
  /** Unix timestamp (ms) when this marker should be removed. */
  expiresAt: number;
  /** Headlines of new articles that triggered or extended this marker. */
  newHeadlines: string[];
}

export interface UseNewsEventMarkersReturn {
  /** Currently active live-event markers, keyed by country code. */
  activeMarkers: Map<string, LiveEventMarker>;
  /**
   * Notify the hook about a new batch of articles. Only articles whose `isNew`
   * flag is true and whose IDs were NOT in `seenAtStartup` will activate markers.
   */
  processNewArticles: (articles: GlobalNewsArticle[]) => void;
}

export class NewsEventMarkerManager {
  private startupArticleIds: Set<string> | null = null;
  private markers = new Map<string, LiveEventMarker>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private onUpdate?: (markers: Map<string, LiveEventMarker>) => void;

  constructor(onUpdate?: (markers: Map<string, LiveEventMarker>) => void) {
    this.onUpdate = onUpdate;
  }

  getMarkers(): Map<string, LiveEventMarker> {
    return new Map(this.markers);
  }

  processNewArticles(articles: GlobalNewsArticle[]): void {
    // On the very first call, record all article IDs as "startup articles".
    // These will never activate live-event markers even if isNew is true.
    if (this.startupArticleIds === null) {
      this.startupArticleIds = new Set(articles.map((a) => a.id));
      return;
    }

    const now = Date.now();

    // Collect truly new (post-startup) articles grouped by country.
    const newByCountry = new Map<string, string[]>(); // code → headlines

    for (const art of articles) {
      if (!art.isNew) continue;
      if (this.startupArticleIds.has(art.id)) continue;

      for (const c of art.countries) {
        if (!c.code) continue;
        const code = c.code.toUpperCase();
        const arr = newByCountry.get(code) ?? [];
        if (art.title) arr.push(art.title);
        newByCountry.set(code, arr);
      }
    }

    if (newByCountry.size === 0) return;

    for (const [code, headlines] of newByCountry.entries()) {
      const expiresAt = now + MARKER_LIFETIME_MS;
      const existing = this.markers.get(code);

      if (existing) {
        // Refresh existing marker: extend expiry, accumulate headlines (cap at 5).
        const combined = Array.from(new Set([...existing.newHeadlines, ...headlines])).slice(0, 5);
        this.markers.set(code, {
          countryCode: code,
          lastEventAt: now,
          expiresAt,
          newHeadlines: combined,
        });
      } else {
        this.markers.set(code, {
          countryCode: code,
          lastEventAt: now,
          expiresAt,
          newHeadlines: headlines.slice(0, 5),
        });
      }

      // Schedule or re-schedule auto-removal.
      this.scheduleExpiry(code, expiresAt);
    }

    this.onUpdate?.(new Map(this.markers));
  }

  private scheduleExpiry(countryCode: string, expiresAt: number): void {
    const existing = this.timers.get(countryCode);
    if (existing !== undefined) clearTimeout(existing);

    const delay = Math.max(0, expiresAt - Date.now());
    const timerId = setTimeout(() => {
      this.markers.delete(countryCode);
      this.timers.delete(countryCode);
      this.onUpdate?.(new Map(this.markers));
    }, delay);

    this.timers.set(countryCode, timerId);
  }

  destroy(): void {
    this.timers.forEach((id) => clearTimeout(id));
    this.timers.clear();
  }
}

export function useNewsEventMarkers(): UseNewsEventMarkersReturn {
  const [activeMarkers, setActiveMarkers] = useState<Map<string, LiveEventMarker>>(
    () => new Map()
  );

  const managerRef = useRef<NewsEventMarkerManager | null>(null);
  if (!managerRef.current) {
    managerRef.current = new NewsEventMarkerManager((markers) => {
      setActiveMarkers(markers);
    });
  }

  // Cleanup all timers on unmount.
  useEffect(() => {
    return () => {
      managerRef.current?.destroy();
    };
  }, []);

  const processNewArticles = useCallback(
    (articles: GlobalNewsArticle[]) => {
      managerRef.current?.processNewArticles(articles);
    },
    []
  );

  return { activeMarkers, processNewArticles };
}
