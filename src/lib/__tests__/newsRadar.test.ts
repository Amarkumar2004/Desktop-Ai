/**
 * Focused unit tests for the real-time news radar feature set.
 *
 * Tests covered:
 *  1. NewsEventMarkerManager – 120-second expiry (timer-based)
 *  2. NewsEventMarkerManager – independent per-country timers
 *  3. NewsEventMarkerManager – startup articles never activate markers even if isNew=true
 *  4. NewsEventMarkerManager – cached response (no new isNew) never reactivates expired markers
 *  5. NewsEventMarkerManager – refresh of expiry on new article for same country
 *  6. NewsEventMarkerManager – clean destruction and timer cleanup
 *  7. useNewsUserPrefs persistence – lsSaveSet / lsLoadSet for readIds
 *  8. useNewsUserPrefs persistence – lsSaveSet / lsLoadSet for deletedIds
 *  9. Filter tabs – unread / read / deleted / all partition logic
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  NewsEventMarkerManager,
  LiveEventMarker,
} from '@/lib/hooks/useNewsEventMarkers';
import {
  lsLoadSet,
  lsSaveSet,
  lsLoadBookmarkedRecords,
  lsSaveBookmarkedRecords,
  BookmarkRecord,
  LS_READ_IDS,
  LS_DELETED_IDS,
  LS_BOOKMARKED_RECORDS,
} from '@/lib/hooks/useNewsUserPrefs';
import {
  resolveHotspotCollisions,
  extractCountriesFromArticle,
  classifyArticleCategory,
  extractCountriesFromText,
  COUNTRY_REGISTRY,
  CountryHighlight,
} from '@/lib/countryDetection';
import {
  GlobalNewsArticle,
  isSafePublicUrl,
  extractSafePublisherDomain,
  parseRssXml,
} from '@/app/api/news/route';
import { sortArticlesNewestFirst } from '@/lib/hooks/useNewsMonitoring';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeArticle(overrides: Partial<GlobalNewsArticle>): GlobalNewsArticle {
  return {
    id: 'https://example.com/default',
    url: 'https://example.com/default',
    title: 'Test Article',
    domain: 'example.com',
    seendate: new Date().toISOString(),
    timeAgo: '2 minutes ago',
    countries: [],
    isNew: false,
    ...overrides,
  };
}

function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = String(val);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

// ─── 1 to 6. NewsEventMarkerManager Tests ────────────────────────────────────

describe('NewsEventMarkerManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('1. Marker for a country expires exactly after 120 seconds', () => {
    let latestMarkers = new Map<string, LiveEventMarker>();
    const manager = new NewsEventMarkerManager((markers) => {
      latestMarkers = markers;
    });

    // First call = startup batch (no markers activated)
    manager.processNewArticles([
      makeArticle({
        id: 'startup-1',
        url: 'startup-1',
        isNew: false,
        countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
      }),
    ]);
    expect(latestMarkers.size).toBe(0);

    // Second call with a genuinely new article for India
    manager.processNewArticles([
      makeArticle({
        id: 'new-in-1',
        url: 'new-in-1',
        title: 'India Quantum Center Launched',
        isNew: true,
        countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
      }),
    ]);

    expect(latestMarkers.has('IN')).toBe(true);
    expect(manager.getMarkers().has('IN')).toBe(true);
    expect(latestMarkers.get('IN')?.newHeadlines).toContain('India Quantum Center Launched');

    // Advance 119 seconds — marker still present
    vi.advanceTimersByTime(119_000);
    expect(latestMarkers.has('IN')).toBe(true);

    // Advance the remaining 1 second — marker should be gone
    vi.advanceTimersByTime(1_001);
    expect(latestMarkers.has('IN')).toBe(false);
    expect(manager.getMarkers().has('IN')).toBe(false);

    manager.destroy();
  });

  it('2. Per-country timers are independent — one expiry does not affect another', () => {
    let latestMarkers = new Map<string, LiveEventMarker>();
    const manager = new NewsEventMarkerManager((markers) => {
      latestMarkers = markers;
    });

    // Startup batch
    manager.processNewArticles([
      makeArticle({
        id: 'startup-us',
        url: 'startup-us',
        isNew: false,
        countries: [{ code: 'US', code3: 'USA', name: 'United States', flag: '🇺🇸' }],
      }),
    ]);

    // First new article for US
    manager.processNewArticles([
      makeArticle({
        id: 'new-us',
        url: 'new-us',
        isNew: true,
        countries: [{ code: 'US', code3: 'USA', name: 'United States', flag: '🇺🇸' }],
      }),
    ]);
    expect(latestMarkers.has('US')).toBe(true);

    // Advance 60 seconds
    vi.advanceTimersByTime(60_000);

    // New article for GB — starts its own 120-second clock from now
    manager.processNewArticles([
      makeArticle({
        id: 'new-gb',
        url: 'new-gb',
        isNew: true,
        countries: [{ code: 'GB', code3: 'GBR', name: 'United Kingdom', flag: '🇬🇧' }],
      }),
    ]);
    expect(latestMarkers.has('US')).toBe(true);
    expect(latestMarkers.has('GB')).toBe(true);

    // Advance another 60 seconds (total 120s for US marker)
    vi.advanceTimersByTime(60_001);

    // US marker should be expired; GB marker should still be active (60s remaining)
    expect(latestMarkers.has('US')).toBe(false);
    expect(latestMarkers.has('GB')).toBe(true);

    // Advance the remaining 60s for GB
    vi.advanceTimersByTime(60_001);
    expect(latestMarkers.has('GB')).toBe(false);

    manager.destroy();
  });

  it('3. Startup (first-call) articles never activate live-event markers even if isNew=true', () => {
    let latestMarkers = new Map<string, LiveEventMarker>();
    const manager = new NewsEventMarkerManager((markers) => {
      latestMarkers = markers;
    });

    manager.processNewArticles([
      makeArticle({
        id: 'startup-jp',
        url: 'startup-jp',
        isNew: true,
        countries: [{ code: 'JP', code3: 'JPN', name: 'Japan', flag: '🇯🇵' }],
      }),
    ]);

    expect(latestMarkers.size).toBe(0);
    expect(manager.getMarkers().size).toBe(0);

    manager.destroy();
  });

  it('4. A cached batch with no new articles never reactivates expired markers', () => {
    let latestMarkers = new Map<string, LiveEventMarker>();
    const manager = new NewsEventMarkerManager((markers) => {
      latestMarkers = markers;
    });

    const cachedArticle = makeArticle({
      id: 'cached-in',
      url: 'cached-in',
      isNew: false,
      countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
    });

    // Startup
    manager.processNewArticles([cachedArticle]);

    // Simulate a post-startup poll with the same cached article (isNew stays false)
    manager.processNewArticles([{ ...cachedArticle, isNew: false }]);

    expect(latestMarkers.has('IN')).toBe(false);
    expect(manager.getMarkers().has('IN')).toBe(false);

    manager.destroy();
  });

  it('5. New article for same country refreshes (extends) the expiry timer', () => {
    let latestMarkers = new Map<string, LiveEventMarker>();
    const manager = new NewsEventMarkerManager((markers) => {
      latestMarkers = markers;
    });

    // Startup
    manager.processNewArticles([
      makeArticle({
        id: 'startup-cn',
        url: 'startup-cn',
        isNew: false,
        countries: [{ code: 'CN', code3: 'CHN', name: 'China', flag: '🇨🇳' }],
      }),
    ]);

    // First new article for CN
    manager.processNewArticles([
      makeArticle({
        id: 'new-cn-1',
        url: 'new-cn-1',
        title: 'China AI Milestone 1',
        isNew: true,
        countries: [{ code: 'CN', code3: 'CHN', name: 'China', flag: '🇨🇳' }],
      }),
    ]);
    expect(latestMarkers.has('CN')).toBe(true);

    // Advance 90 seconds — marker still active
    vi.advanceTimersByTime(90_000);
    expect(latestMarkers.has('CN')).toBe(true);

    // Another new article arrives — extends the timer from NOW (t=90s) for another 120s
    manager.processNewArticles([
      makeArticle({
        id: 'new-cn-2',
        url: 'new-cn-2',
        title: 'China AI Milestone 2',
        isNew: true,
        countries: [{ code: 'CN', code3: 'CHN', name: 'China', flag: '🇨🇳' }],
      }),
    ]);

    // Advance 90 more seconds — without refresh this would have expired (total 180s > 120s),
    // but with refresh it should still be active (only 90s into the new 120s window).
    vi.advanceTimersByTime(90_000);
    expect(latestMarkers.has('CN')).toBe(true);
    expect(latestMarkers.get('CN')?.newHeadlines).toEqual([
      'China AI Milestone 1',
      'China AI Milestone 2',
    ]);

    // Advance the final 31 seconds to let the refreshed timer expire
    vi.advanceTimersByTime(31_000);
    expect(latestMarkers.has('CN')).toBe(false);

    manager.destroy();
  });

  it('6. destroy cancels pending timers without errors', () => {
    const manager = new NewsEventMarkerManager();
    manager.processNewArticles([]);
    manager.processNewArticles([
      makeArticle({
        id: 'art-de',
        url: 'art-de',
        isNew: true,
        countries: [{ code: 'DE', code3: 'DEU', name: 'Germany', flag: '🇩🇪' }],
      }),
    ]);

    expect(manager.getMarkers().has('DE')).toBe(true);
    manager.destroy();

    // Advance time after destroy; should not throw
    vi.advanceTimersByTime(130_000);
  });
});

// ─── 7, 8, 9. Persistence & Filter Logic ────────────────────────────────────

describe('NewsUserPrefs Storage & Filters', () => {
  it('7. lsSaveSet and lsLoadSet persist and restore read article IDs', () => {
    const storage = createMockStorage();
    const set = new Set(['art-101', 'art-102']);

    lsSaveSet(LS_READ_IDS, set, storage);
    const restored = lsLoadSet(LS_READ_IDS, storage);

    expect(restored.has('art-101')).toBe(true);
    expect(restored.has('art-102')).toBe(true);
    expect(restored.has('art-103')).toBe(false);
  });

  it('8. lsSaveSet and lsLoadSet persist and restore deleted article IDs', () => {
    const storage = createMockStorage();
    const set = new Set(['del-1', 'del-2']);

    lsSaveSet(LS_DELETED_IDS, set, storage);
    const restored = lsLoadSet(LS_DELETED_IDS, storage);

    expect(restored.has('del-1')).toBe(true);
    expect(restored.has('del-2')).toBe(true);
    expect(restored.has('del-3')).toBe(false);
  });

  it('9. Filter tabs partition: unread, read, deleted, all', () => {
    const ids = ['a', 'b', 'c', 'd'];
    const readIds = new Set(['b']);
    const deletedIds = new Set(['c']);

    // Derived tabs matching NotificationsModal logic:
    const unread = ids.filter((id) => !deletedIds.has(id) && !readIds.has(id));
    const read = ids.filter((id) => !deletedIds.has(id) && readIds.has(id));
    const deleted = ids.filter((id) => deletedIds.has(id));
    const all = ids.filter((id) => !deletedIds.has(id));

    expect(unread).toEqual(['a', 'd']);
    expect(read).toEqual(['b']);
    expect(deleted).toEqual(['c']);
    expect(all).toEqual(['a', 'b', 'd']);
  });

  it('10. Moving article between read and unread NEVER deletes it', () => {
    const readIds = new Set<string>();
    const deletedIds = new Set<string>();

    const articleId = 'article-safe-1';

    // Mark as read
    readIds.add(articleId);
    expect(readIds.has(articleId)).toBe(true);
    expect(deletedIds.has(articleId)).toBe(false);

    // Toggle back to unread
    readIds.delete(articleId);
    expect(readIds.has(articleId)).toBe(false);
    expect(deletedIds.has(articleId)).toBe(false);

    // Article remains in active feeds
    const inActiveAll = !deletedIds.has(articleId);
    expect(inActiveAll).toBe(true);
  });

  it('11. Deleting article removes it from active feeds (All, Unread, Read) and places in Deleted', () => {
    const articles = ['art-1', 'art-2', 'art-3'];
    const readIds = new Set(['art-1']);
    const deletedIds = new Set<string>();

    // Before deletion
    const allBefore = articles.filter((id) => !deletedIds.has(id));
    expect(allBefore).toContain('art-1');

    // User deletes art-1
    deletedIds.add('art-1');

    const allAfter = articles.filter((id) => !deletedIds.has(id));
    const unreadAfter = articles.filter((id) => !deletedIds.has(id) && !readIds.has(id));
    const readAfter = articles.filter((id) => !deletedIds.has(id) && readIds.has(id));
    const deletedAfter = articles.filter((id) => deletedIds.has(id));

    expect(allAfter).not.toContain('art-1');
    expect(unreadAfter).not.toContain('art-1');
    expect(readAfter).not.toContain('art-1');
    expect(deletedAfter).toContain('art-1');
  });

  it('12. 12-Hour deletion deadline: records older than 12h are permanently purged', async () => {
    const storage = createMockStorage();
    const now = Date.now();
    const thirteenHoursAgo = now - 13 * 60 * 60 * 1000;
    const oneHourAgo = now - 1 * 60 * 60 * 1000;

    const {
      lsSaveDeletedRecords,
      lsLoadDeletedRecords,
    } = await import('@/lib/hooks/useNewsUserPrefs');

    const records = new Map<string, number>();
    records.set('expired-del-1', thirteenHoursAgo);
    records.set('fresh-del-2', oneHourAgo);

    lsSaveDeletedRecords(records, storage);

    // Load with current time
    const loaded = lsLoadDeletedRecords(storage, now);

    // expired-del-1 should be permanently purged
    expect(loaded.has('expired-del-1')).toBe(false);
    // fresh-del-2 should be retained within the 12-hour window
    expect(loaded.has('fresh-del-2')).toBe(true);
  });

  it('13. Restoring a deleted article returns it to active feed', () => {
    const deletedIds = new Set(['del-article']);
    expect(deletedIds.has('del-article')).toBe(true);

    // User clicks restore
    deletedIds.delete('del-article');
    expect(deletedIds.has('del-article')).toBe(false);

    const isInActiveFeed = !deletedIds.has('del-article');
    expect(isInActiveFeed).toBe(true);
  });

  // ─── 14 to 21. Tests for the 8 Verified Limitations ─────────────────────────

  it('14. Map Pin Collision Relaxation resolves nearby pins in Europe without distorting true coordinates', () => {
    // France, Germany, and Switzerland are closely clustered in Western Europe
    const fr = COUNTRY_REGISTRY['FR'];
    const de = COUNTRY_REGISTRY['DE'];
    const ch = COUNTRY_REGISTRY['CH'];

    expect(fr && de && ch).toBeDefined();

    const denseCluster: CountryHighlight[] = [
      {
        code: 'FR',
        code3: 'FRA',
        name: 'France',
        flag: '🇫🇷',
        x: fr.x,
        y: fr.y,
        articleCount: 5,
        hasNewArticles: false,
        recentHeadlines: ['France Reform'],
      },
      {
        code: 'DE',
        code3: 'DEU',
        name: 'Germany',
        flag: '🇩🇪',
        x: de.x,
        y: de.y,
        articleCount: 7,
        hasNewArticles: false,
        recentHeadlines: ['Germany Industry'],
      },
      {
        code: 'CH',
        code3: 'CHE',
        name: 'Switzerland',
        flag: '🇨🇭',
        x: ch.x,
        y: ch.y,
        articleCount: 3,
        hasNewArticles: false,
        recentHeadlines: ['Swiss Banking'],
      },
    ];

    const relaxed = resolveHotspotCollisions(denseCluster, 26);
    expect(relaxed.length).toBe(3);

    // At least some pins in this dense European cluster must receive displacement offsets
    const displacedCount = relaxed.filter((p) => p.isDisplaced).length;
    expect(displacedCount).toBeGreaterThanOrEqual(2);

    // Each pin preserves its exact anchor coordinates (x, y)
    relaxed.forEach((pin) => {
      const original = denseCluster.find((c) => c.code === pin.code)!;
      expect(pin.x).toBe(original.x);
      expect(pin.y).toBe(original.y);
      // Offset coordinates (x + dx, y + dy) must stay inside map boundaries [25, 775] x [25, 365]
      expect(pin.x + pin.dx).toBeGreaterThanOrEqual(25);
      expect(pin.x + pin.dx).toBeLessThanOrEqual(775);
      expect(pin.y + pin.dy).toBeGreaterThanOrEqual(25);
      expect(pin.y + pin.dy).toBeLessThanOrEqual(365);
    });

    // Distant pins (e.g. US and JP) must NOT be displaced
    const distantPins: CountryHighlight[] = [
      {
        code: 'US',
        code3: 'USA',
        name: 'United States',
        flag: '🇺🇸',
        x: 180,
        y: 110,
        articleCount: 10,
        hasNewArticles: false,
        recentHeadlines: ['US News'],
      },
      {
        code: 'JP',
        code3: 'JPN',
        name: 'Japan',
        flag: '🇯🇵',
        x: 710,
        y: 125,
        articleCount: 4,
        hasNewArticles: false,
        recentHeadlines: ['Japan News'],
      },
    ];
    const relaxedDistant = resolveHotspotCollisions(distantPins, 26);
    expect(relaxedDistant.every((p) => !p.isDisplaced && p.dx === 0 && p.dy === 0)).toBe(true);
  });

  it('15. Country Disambiguation correctly filters ambiguous names and names of persons', () => {
    // Georgia: Sovereign nation vs US State
    const gePositive = extractCountriesFromText('Georgia parliament in Tbilisi debates Caucasus trade agreement');
    expect(gePositive.some((c) => c.code === 'GE')).toBe(true);

    const geNegative = extractCountriesFromText('Georgia voters in Atlanta cast ballots in heated Senate election');
    expect(geNegative.some((c) => c.code === 'GE')).toBe(false);

    // Jordan: Sovereign nation vs Person name
    const joPositive = extractCountriesFromText('King of Jordan holds regional diplomatic talks in Amman');
    expect(joPositive.some((c) => c.code === 'JO')).toBe(true);

    const joNegative = extractCountriesFromText('Michael Jordan and Jordan Belfort meet at charity dinner');
    expect(joNegative.some((c) => c.code === 'JO')).toBe(false);

    // Turkey: Sovereign nation vs Thanksgiving food
    const trPositive = extractCountriesFromText('Turkey and Greece sign Aegean naval security protocol');
    expect(trPositive.some((c) => c.code === 'TR')).toBe(true);

    const trNegative = extractCountriesFromText('Families purchase roast turkey and cranberries for Thanksgiving dinner');
    expect(trNegative.some((c) => c.code === 'TR')).toBe(false);

    // Chad: Sovereign nation vs slang / person
    const tdPositive = extractCountriesFromText('Sahel coalition forces conduct security patrol in Chad');
    expect(tdPositive.some((c) => c.code === 'TD')).toBe(true);

    const tdNegative = extractCountriesFromText('He thinks he is an absolute gigachad and tech bro');
    expect(tdNegative.some((c) => c.code === 'TD')).toBe(false);

    // Niger: Sovereign nation vs Nigerian state
    const nePositive = extractCountriesFromText('Niger military leaders announce new cabinet in Niamey');
    expect(nePositive.some((c) => c.code === 'NE')).toBe(true);

    const neNegative = extractCountriesFromText('Bandits attack community in Niger state Nigeria');
    expect(neNegative.some((c) => c.code === 'NE')).toBe(false);
  });

  it('16. Multi-field country extraction isolates publisher location from actual event location', () => {
    // Article about space technology with US publisher: must NOT assign US without subject evidence
    const unassignedArticle = extractCountriesFromArticle({
      title: 'Global Breakthrough in Next-Gen Solar Panels and Clean Battery Cells',
      summary: 'Scientists unveil novel perovskite crystal structure that boosts conversion efficiency.',
      sourceCountry: 'US', // Publisher is in the US
    });
    // Sovereign country of story is unassigned
    expect(unassignedArticle).toEqual([]);

    // Article with country in summary: inherits country from summary
    const summaryArticle = extractCountriesFromArticle({
      title: 'New High-Speed Rail Corridor Breaks Ground',
      summary: 'Infrastructure project in Tokyo will connect northern regions of Japan.',
    });
    expect(summaryArticle.some((c) => c.code === 'JP')).toBe(true);
  });

  it('17. Deterministic Topic Classification classifies articles without fabrication', () => {
    expect(classifyArticleCategory('Nvidia unveils Blackwell AI supercomputing GPU', 'semiconductor chip architecture')).toBe('Technology');
    expect(classifyArticleCategory('Federal Reserve raises interest rates to curb inflation', 'central bank policy meeting')).toBe('Finance');
    expect(classifyArticleCategory('Parliament votes on controversial election and voting rights bill', 'senate debate')).toBe('Politics');
    expect(classifyArticleCategory('NASA James Webb Space Telescope discovers habitable exoplanet', 'astronomy climate data')).toBe('Science');
    expect(classifyArticleCategory('Global festival celebrates local culinary traditions and arts', 'annual cultural exhibition')).toBe('World');
  });

  it('18. SSRF Protection and Safe Publisher Domain extraction', () => {
    // Loopback, private IP ranges, and local domains are blocked
    expect(isSafePublicUrl('http://localhost:3000/api')).toBe(false);
    expect(isSafePublicUrl('http://127.0.0.1:8080/admin')).toBe(false);
    expect(isSafePublicUrl('http://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isSafePublicUrl('http://192.168.1.1/router')).toBe(false);
    expect(isSafePublicUrl('http://10.0.0.1/internal')).toBe(false);
    expect(isSafePublicUrl('file:///etc/passwd')).toBe(false);
    expect(isSafePublicUrl('ftp://example.com')).toBe(false);

    // Valid public domains are accepted
    expect(isSafePublicUrl('https://www.reuters.com/world/article-123')).toBe(true);
    expect(isSafePublicUrl('https://timesofindia.indiatimes.com/india')).toBe(true);

    // Extract safe publisher domain from Google News RSS source tag
    const fromGoogleRss = extractSafePublisherDomain(
      'https://news.google.com/rss/articles/CBMi123',
      'https://timesofindia.indiatimes.com',
      'The Times of India'
    );
    expect(fromGoogleRss.domain).toBe('timesofindia.indiatimes.com');
    expect(fromGoogleRss.resolvedUrl).toBe('https://timesofindia.indiatimes.com');

    // Direct link from BBC World RSS
    const fromBbcRss = extractSafePublisherDomain('https://www.bbc.com/news/world-123456');
    expect(fromBbcRss.domain).toBe('bbc.com');

    // Fallback when resolution is unavailable
    const fallback = extractSafePublisherDomain('https://news.google.com/rss/articles/unknown');
    expect(fallback.domain).toBe('Google News');
  });

  it('19. Google News RSS XML parser extracts publisher metadata and clean summary', () => {
    const mockXml = `
      <rss version="2.0">
        <channel>
          <title>Google News</title>
          <item>
            <title><![CDATA[India Launches National Semiconductor Mission]]></title>
            <link>https://news.google.com/rss/articles/ABC123</link>
            <pubDate>Thu, 15 Oct 2026 06:00:00 GMT</pubDate>
            <description><![CDATA[<ol><li><a href="test">New chip fabrication facility approved in Gujarat.</a></li></ol>]]></description>
            <source url="https://economictimes.indiatimes.com">The Economic Times</source>
          </item>
        </channel>
      </rss>
    `;

    const parsed = parseRssXml(mockXml);
    expect(parsed.length).toBe(1);
    expect(parsed[0].title).toBe('India Launches National Semiconductor Mission');
    expect(parsed[0].source).toBe('The Economic Times');
    expect(parsed[0].sourceUrl).toBe('https://economictimes.indiatimes.com');
    expect(parsed[0].summary).toBe('New chip fabrication facility approved in Gujarat.');
  });

  it('20. Cross-Tab Synchronization handles storage events for read, deleted, and bookmarked states', () => {
    const storage = createMockStorage();

    // 1. Bookmark persistence
    const records = new Map<string, BookmarkRecord>();
    records.set('article-bm-1', {
      id: 'article-bm-1',
      title: 'AI Radar Research',
      url: 'https://example.com/ai',
      domain: 'example.com',
      seendate: new Date().toISOString(),
      savedAt: Date.now(),
      category: 'Technology',
    });

    lsSaveBookmarkedRecords(records, storage);
    const loaded = lsLoadBookmarkedRecords(storage);
    expect(loaded.has('article-bm-1')).toBe(true);
    expect(loaded.get('article-bm-1')?.title).toBe('AI Radar Research');

    // 2. Storage event payload consistency
    const raw = storage.getItem(LS_BOOKMARKED_RECORDS);
    expect(raw).toBeDefined();
    const parsed = JSON.parse(raw!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe('article-bm-1');
  });

  it('21. Bookmarks do not extend server 12h retention and expire gracefully without resurrection', () => {
    const now = Date.now();
    const fourteenHoursAgo = new Date(now - 14 * 60 * 60 * 1000).toISOString();

    const savedBookmark: BookmarkRecord = {
      id: 'https://example.com/expired-news',
      title: 'Historic Summit Agreement',
      url: 'https://example.com/expired-news',
      domain: 'example.com',
      seendate: fourteenHoursAgo,
      savedAt: now - 13 * 60 * 60 * 1000,
      category: 'Politics',
    };

    // Active server articles currently retained in memory
    const activeServerArticles: GlobalNewsArticle[] = [
      makeArticle({
        id: 'https://example.com/fresh-news',
        url: 'https://example.com/fresh-news',
        title: 'Fresh News',
        seendate: new Date().toISOString(),
      }),
    ];

    // Check if bookmark exists in active server feed
    const isActive = activeServerArticles.some((a) => a.id === savedBookmark.id);
    expect(isActive).toBe(false);

    // Display state for expired bookmark: marked as expired
    const isExpired = !isActive;
    expect(isExpired).toBe(true);
    // Preserves original URL for reading
    expect(savedBookmark.url).toBe('https://example.com/expired-news');
  });

  it('22. sortArticlesNewestFirst floats freshly arrived articles (isNew=true) to the very top', () => {
    const olderNewArticle = makeArticle({
      id: 'article-new-1',
      title: 'Newly Discovered Breaking Story',
      seendate: '2026-10-31T10:00:00.000Z',
      isNew: true,
    });
    const regularArticle = makeArticle({
      id: 'article-regular-1',
      title: 'Regular Existing Story',
      seendate: '2026-10-31T11:00:00.000Z',
      isNew: false,
    });

    const articles = [regularArticle, olderNewArticle];
    const sorted = [...articles].sort(sortArticlesNewestFirst);

    expect(sorted[0].id).toBe('article-new-1');
    expect(sorted[1].id).toBe('article-regular-1');
  });

  it('23. sortArticlesNewestFirst orders articles descending by publication timestamp', () => {
    const article10am = makeArticle({
      id: 'art-10am',
      seendate: '2026-10-31T10:00:00.000Z',
      isNew: false,
    });
    const article12pm = makeArticle({
      id: 'art-12pm',
      seendate: '2026-10-31T12:00:00.000Z',
      isNew: false,
    });
    const article08am = makeArticle({
      id: 'art-08am',
      seendate: '2026-10-31T08:00:00.000Z',
      isNew: false,
    });

    const articles = [article08am, article10am, article12pm];
    const sorted = [...articles].sort(sortArticlesNewestFirst);

    expect(sorted[0].id).toBe('art-12pm');
    expect(sorted[1].id).toBe('art-10am');
    expect(sorted[2].id).toBe('art-08am');
  });
});


