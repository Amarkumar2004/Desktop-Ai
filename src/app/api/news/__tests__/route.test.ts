import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET,
  _resetNewsCacheForTesting,
  _setNewsCacheForTesting,
  _purgeExpiredArticlesForTesting,
  _resetCircuitBreakerForTesting,
  _setCircuitBreakerForTesting,
  _clearCooldownForTesting,
  getCircuitBreakerStatus,
  parsePublicationDate,
  parseRetryAfterHeader,
  processRawArticles,
  processRawRssArticles,
  RSS_FALLBACK_URLS,
  GlobalNewsArticle,
} from '../route';

describe('GET /api/news route handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _resetNewsCacheForTesting();
  });

  it('fetches live news and derives country hotspots strictly from real article subjects', async () => {
    const mockGdeltResponse = {
      articles: [
        {
          url: 'https://timesofindia.indiatimes.com/tech/india-ai-chip-initiative/1.cms',
          title: 'India Advances Semiconductor AI Infrastructure in Gujarat',
          seendate: '20261013T060000Z',
          domain: 'timesofindia.indiatimes.com',
          language: 'English',
          sourcecountry: 'India',
        },
        {
          url: 'https://reuters.com/tech/us-quantum-cryptography/2.html',
          title: 'United States Expands Quantum Computing Defense Network in Washington',
          seendate: '20261013T061500Z',
          domain: 'reuters.com',
          language: 'English',
          sourcecountry: 'United States',
        },
        {
          url: 'https://techblog.com/breakthrough-in-battery-chemistry/3.html',
          title: 'Breakthrough in Solid-State Battery Chemistry Published by Researchers',
          seendate: '20261013T050000Z',
          domain: 'techblog.com',
          language: 'English',
          sourcecountry: 'Germany', // Publisher location only, headline has NO country
        },
      ],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockGdeltResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const req = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.articles).toHaveLength(3);

    // India article maps to India hotspot
    const inHighlight = data.countryHighlights.find((h: any) => h.code === 'IN');
    expect(inHighlight).toBeDefined();
    expect(inHighlight.name).toBe('India');
    expect(inHighlight.articleCount).toBe(1);

    // US article maps to US hotspot
    const usHighlight = data.countryHighlights.find((h: any) => h.code === 'US');
    expect(usHighlight).toBeDefined();
    expect(usHighlight.name).toBe('United States');
    expect(usHighlight.articleCount).toBe(1);

    // Germany is ONLY publisher country, not mentioned in title -> NO Germany hotspot
    const deHighlight = data.countryHighlights.find((h: any) => h.code === 'DE');
    expect(deHighlight).toBeUndefined();

    // Only countries present in actual subject mapping have hotspots
    expect(data.countryHighlights).toHaveLength(2);
    expect(data.meta.fromCache).toBe(false);
    expect(data.meta.isStale).toBe(false);
  });

  it('filters articles by country query param', async () => {
    const cachedArticles: GlobalNewsArticle[] = [
      {
        id: '1',
        url: 'https://example.com/1',
        title: 'India Innovation Boom',
        domain: 'example.com',
        seendate: '20261013T060000Z',
        timeAgo: '10m ago',
        countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
      },
      {
        id: '2',
        url: 'https://example.com/2',
        title: 'US Tech Rally',
        domain: 'example.com',
        seendate: '20261013T060000Z',
        timeAgo: '10m ago',
        countries: [{ code: 'US', code3: 'USA', name: 'United States', flag: '🇺🇸' }],
      },
    ];

    _setNewsCacheForTesting(cachedArticles);

    const req = new NextRequest('http://localhost:3000/api/news?country=IN');
    const res = await GET(req);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.articles).toHaveLength(1);
    expect(data.articles[0].countries[0].code).toBe('IN');
  });

  it('handles external rate limits and marks cached real articles as stale during API outage', async () => {
    const realCachedArticles: GlobalNewsArticle[] = [
      {
        id: '1',
        url: 'https://example.com/1',
        title: 'India Green Energy Corridor Approved',
        domain: 'example.com',
        seendate: '20261013T060000Z',
        timeAgo: '20m ago',
        countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
      },
    ];

    // Seed cache with previous REAL articles
    _setNewsCacheForTesting(realCachedArticles, Date.now() - 600000);

    // Simulate upstream 429 rate limit during refresh attempt
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response('Please limit requests to one every 5 seconds', { status: 429 })
    );

    const req = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    // Preserves previously fetched real articles
    expect(data.articles).toHaveLength(1);
    expect(data.countryHighlights).toHaveLength(1);
    expect(data.countryHighlights[0].code).toBe('IN');

    // Explicitly flags the data as stale / cached
    expect(data.meta.fromCache).toBe(true);
    expect(data.meta.isStale).toBe(true);
    expect(data.meta.rateLimited).toBe(true);
  });

  it('returns zero news hotspots when the news dataset is empty', async () => {
    _resetNewsCacheForTesting();

    // Simulate upstream returning zero articles
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ articles: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const req = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res = await GET(req);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.articles).toHaveLength(0);
    expect(data.countryHighlights).toHaveLength(0);
  });

  it('falls back to free RSS feed when primary GDELT source is rate-limited on cold start', async () => {
    _resetNewsCacheForTesting();

    const sampleRssXml = `
      <rss version="2.0">
        <channel>
          <title>World News</title>
          <item>
            <title><![CDATA[India announces major national AI research cluster]]></title>
            <link>https://www.bbc.co.uk/news/world-asia-india-12345?utm_source=rss&amp;at_medium=RSS</link>
            <pubDate>Thu, 15 Oct 2026 05:00:00 GMT</pubDate>
          </item>
          <item>
            <title>United States tech consortium launches quantum network</title>
            <link>https://www.bbc.co.uk/news/world-us-canada-67890?oc=5</link>
            <pubDate>Thu, 15 Oct 2026 05:30:00 GMT</pubDate>
          </item>
          <!-- Duplicate URL with different tracking query -->
          <item>
            <title>India announces major national AI research cluster</title>
            <link>https://www.bbc.co.uk/news/world-asia-india-12345?utm_source=twitter</link>
            <pubDate>Thu, 15 Oct 2026 05:00:00 GMT</pubDate>
          </item>
        </channel>
      </rss>
    `;

    // GDELT fails with 429; BBC RSS returns sampleRssXml; other feeds return empty XML
    const fetchMock = vi.spyOn(global, 'fetch');
    fetchMock.mockImplementation(async (urlInput: any) => {
      const urlStr = String(urlInput);
      if (urlStr.includes('api.gdeltproject.org')) {
        return new Response('Please limit requests to one every 5 seconds', { status: 429 });
      }
      if (urlStr.includes('feeds.bbci.co.uk')) {
        return new Response(sampleRssXml, {
          status: 200,
          headers: { 'Content-Type': 'application/rss+xml' },
        });
      }
      return new Response('<rss><channel></channel></rss>', {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml' },
      });
    });

    const req = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    // Deduplication should ensure only 2 unique articles exist
    expect(data.articles).toHaveLength(2);
    expect(data.meta.source).toBe('rss-fallback');
    expect(data.meta.fromCache).toBe(false);

    // Should detect India and US country hotspots
    const inSpot = data.countryHighlights.find((h: any) => h.code === 'IN');
    expect(inSpot).toBeDefined();
    expect(inSpot.articleCount).toBe(1);

    const usSpot = data.countryHighlights.find((h: any) => h.code === 'US');
    expect(usSpot).toBeDefined();
    expect(usSpot.articleCount).toBe(1);
  });

  it('assigns reliable server-ingestion timestamps and returns safe diagnostics', async () => {
    const mockGdeltResponse = {
      articles: [
        {
          url: 'https://reuters.com/world/india/space-mission-launch-1.html',
          title: 'India Space Agency Successfully Deploys Satellite',
          seendate: '20261015T060000Z',
          domain: 'reuters.com',
          language: 'English',
        },
      ],
    };

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockGdeltResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const before = Date.now();
    const req = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res = await GET(req);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.articles).toHaveLength(1);

    const article = data.articles[0];
    expect(article.firstIngestedAt).toBeDefined();
    expect(typeof article.ingestedAtMs).toBe('number');
    expect(article.ingestedAtMs).toBeGreaterThanOrEqual(before);

    // Diagnostics verified
    expect(data.diagnostics).toBeDefined();
    expect(data.diagnostics.sourceName).toBe('GDELT DOC 2.0');
    expect(data.diagnostics.retentionWindowHours).toBe(12);
    expect(data.diagnostics.totalArticles).toBe(1);
    expect(data.diagnostics.isLiveData).toBe(true);
    expect(data.diagnostics.isTestData).toBe(true);
    expect(data.diagnostics.upstreamStatus).toBe('success');
  });

  it('permanently purges articles exceeding the 12-hour server retention window', async () => {
    const now = Date.now();
    const thirteenHoursAgo = now - 13 * 60 * 60 * 1000;
    const twoHoursAgo = now - 2 * 60 * 60 * 1000;

    const testArticles: GlobalNewsArticle[] = [
      {
        id: 'https://example.com/expired-1',
        url: 'https://example.com/expired-1',
        title: 'India Old Article Over 12h',
        domain: 'example.com',
        seendate: new Date(thirteenHoursAgo).toISOString(),
        firstIngestedAt: new Date(thirteenHoursAgo).toISOString(),
        ingestedAtMs: thirteenHoursAgo,
        timeAgo: '13h ago',
        countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
      },
      {
        id: 'https://example.com/active-2',
        url: 'https://example.com/active-2',
        title: 'United States Fresh Article',
        domain: 'example.com',
        seendate: new Date(twoHoursAgo).toISOString(),
        firstIngestedAt: new Date(twoHoursAgo).toISOString(),
        ingestedAtMs: twoHoursAgo,
        timeAgo: '2h ago',
        countries: [{ code: 'US', code3: 'USA', name: 'United States', flag: '🇺🇸' }],
      },
    ];

    _setNewsCacheForTesting(testArticles);

    // Requesting news triggers purgeExpiredArticles
    const req = new NextRequest('http://localhost:3000/api/news');
    const res = await GET(req);
    const data = await res.json();

    expect(data.success).toBe(true);
    // Expired article permanently purged; only unexpired article survives
    expect(data.articles).toHaveLength(1);
    expect(data.articles[0].id).toBe('https://example.com/active-2');
    expect(data.diagnostics.expiredArticlesPurgedCount).toBe(1);
    expect(data.diagnostics.activeRetainedArticlesCount).toBe(1);
  });

  it('never resurrects permanently expired articles on upstream refresh or re-fetch', async () => {
    const now = Date.now();
    const fourteenHoursAgo = now - 14 * 60 * 60 * 1000;

    const oldArticle: GlobalNewsArticle = {
      id: 'https://example.com/no-resurrect',
      url: 'https://example.com/no-resurrect',
      title: 'Breaking Defense Breakthrough in India',
      domain: 'example.com',
      seendate: new Date(fourteenHoursAgo).toISOString(),
      firstIngestedAt: new Date(fourteenHoursAgo).toISOString(),
      ingestedAtMs: fourteenHoursAgo,
      timeAgo: '14h ago',
      countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
    };

    const activeArticle: GlobalNewsArticle = {
      id: 'https://example.com/active-article',
      url: 'https://example.com/active-article',
      title: 'Fresh Technology Advance in India',
      domain: 'example.com',
      seendate: new Date(now - 60000).toISOString(),
      firstIngestedAt: new Date(now - 60000).toISOString(),
      ingestedAtMs: now - 60000,
      timeAgo: '1m ago',
      countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
    };

    // Seed both articles and purge the expired one into tombstones
    _setNewsCacheForTesting([oldArticle, activeArticle]);
    const purged = _purgeExpiredArticlesForTesting(now);
    expect(purged).toBe(1);

    // Upstream returns the exact same expired article in a refresh poll
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          articles: [
            {
              url: 'https://example.com/no-resurrect',
              title: 'Breaking Defense Breakthrough in India',
              seendate: '20261015T060000Z',
              domain: 'example.com',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const req2 = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res2 = await GET(req2);
    const data2 = await res2.json();

    // Resurrection guard prevents this article from being re-added
    const resurrected = data2.articles.find((a: any) => a.id === 'https://example.com/no-resurrect');
    expect(resurrected).toBeUndefined();
  });

  it('P0: GDELT circuit breaker trips after 2 consecutive failures and skips GDELT during 10-minute cooldown', async () => {
    _resetCircuitBreakerForTesting();

    let gdeltAttempts = 0;
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async (urlInput: any) => {
      const urlStr = String(urlInput);
      if (urlStr.includes('api.gdeltproject.org')) {
        gdeltAttempts++;
        if (gdeltAttempts === 1) {
          return new Response('Please limit requests to one every 5 seconds', { status: 429 });
        }
        return new Response('Gateway Timeout', { status: 504 });
      }
      return new Response('<rss><channel></channel></rss>', {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml' },
      });
    });

    const req1 = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res1 = await GET(req1);
    const data1 = await res1.json();

    expect(data1.diagnostics.circuitBreaker.consecutiveFailures).toBe(1);
    expect(data1.diagnostics.circuitBreaker.isOpen).toBe(false);

    // Clear cooldown to allow immediate second refresh in test
    _clearCooldownForTesting();

    const req2 = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res2 = await GET(req2);
    const data2 = await res2.json();

    expect(data2.diagnostics.circuitBreaker.consecutiveFailures).toBe(2);
    expect(data2.diagnostics.circuitBreaker.isOpen).toBe(true);
    expect(data2.diagnostics.circuitBreaker.cooldownRemainingSec).toBeGreaterThan(0);

    // 3rd call: Circuit breaker is OPEN -> GDELT is skipped immediately without making an HTTP call to GDELT
    _clearCooldownForTesting();
    fetchSpy.mockClear();

    const req3 = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res3 = await GET(req3);
    const data3 = await res3.json();

    expect(data3.diagnostics.circuitBreaker.isOpen).toBe(true);
    // GDELT URL was NOT called
    const gdeltCall = fetchSpy.mock.calls.find((call) =>
      String(call[0]).includes('api.gdeltproject.org')
    );
    expect(gdeltCall).toBeUndefined();
  });

  it('P0: GDELT circuit breaker resets upon a successful response', async () => {
    _resetCircuitBreakerForTesting();
    // Simulate 1 previous failure
    _setCircuitBreakerForTesting({ consecutiveFailures: 1 });
    expect(getCircuitBreakerStatus().consecutiveFailures).toBe(1);

    // Upstream returns 200 OK with valid articles
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          articles: [
            {
              url: 'https://example.com/gdelt-healthy',
              title: 'Successful GDELT Headline In India',
              seendate: '20261015T060000Z',
              domain: 'example.com',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const req = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res = await GET(req);
    const data = await res.json();

    expect(data.diagnostics.circuitBreaker.consecutiveFailures).toBe(0);
    expect(data.diagnostics.circuitBreaker.isOpen).toBe(false);
  });

  it('P1: Multi-source fallback RSS syndicate includes BBC, Google News, Al Jazeera, and DW', () => {
    expect(RSS_FALLBACK_URLS).toHaveLength(4);
    expect(RSS_FALLBACK_URLS).toContain('https://feeds.bbci.co.uk/news/world/rss.xml');
    expect(RSS_FALLBACK_URLS).toContain('https://news.google.com/rss?hl=en-IN&gl=IN&ceid=IN:en');
    expect(RSS_FALLBACK_URLS).toContain('https://www.aljazeera.com/xml/rss/all.xml');
    expect(RSS_FALLBACK_URLS).toContain('https://rss.dw.com/xml/rss-en-all');
  });

  describe('parseRetryAfterHeader', () => {
    it('correctly parses integer seconds', () => {
      expect(parseRetryAfterHeader('120')).toBe(120);
      expect(parseRetryAfterHeader('60')).toBe(60);
      expect(parseRetryAfterHeader('0')).toBe(0);
      expect(parseRetryAfterHeader('-10')).toBe(0);
      expect(parseRetryAfterHeader('')).toBe(0);
      expect(parseRetryAfterHeader(null)).toBe(0);
    });

    it('correctly parses HTTP-Date header format', () => {
      const now = 1700000000000;
      const futureDate = new Date(now + 45000).toUTCString();
      const pastDate = new Date(now - 10000).toUTCString();

      expect(parseRetryAfterHeader(futureDate, now)).toBe(45);
      expect(parseRetryAfterHeader(pastDate, now)).toBe(0);
      expect(parseRetryAfterHeader('Invalid Date String', now)).toBe(0);
    });
  });

  describe('parsePublicationDate', () => {
    it('parses GDELT compact format (YYYYMMDDTHHMMSSZ)', () => {
      const parsed = parsePublicationDate('20261015T063000Z');
      expect(parsed).toBe('2026-10-15T06:30:00.000Z');
    });

    it('parses standard ISO and RFC 2822 date strings', () => {
      const parsedIso = parsePublicationDate('2026-10-15T07:00:00.000Z');
      expect(parsedIso).toBe('2026-10-15T07:00:00.000Z');

      const parsedRfc = parsePublicationDate('Thu, 15 Oct 2026 05:00:00 GMT');
      expect(parsedRfc).toBe('2026-10-15T05:00:00.000Z');
    });

    it('rejects invalid or missing dates by returning null', () => {
      expect(parsePublicationDate('not-a-date')).toBeNull();
      expect(parsePublicationDate('')).toBeNull();
      expect(parsePublicationDate(null)).toBeNull();
      expect(parsePublicationDate(undefined)).toBeNull();
    });
  });

  it('rejects raw articles and RSS items with invalid publication dates without inventing timestamps', () => {
    const rawGdelt = [
      {
        url: 'https://example.com/valid-gdelt',
        title: 'Valid GDELT Headline In India',
        seendate: '20261015T060000Z',
      },
      {
        url: 'https://example.com/invalid-gdelt',
        title: 'Invalid Date GDELT Headline In India',
        seendate: 'invalid-garbage-date',
      },
      {
        url: 'https://example.com/no-date-gdelt',
        title: 'Missing Date GDELT Headline In India',
      },
    ];

    const processedGdelt = processRawArticles(rawGdelt);
    expect(processedGdelt).toHaveLength(1);
    expect(processedGdelt[0].id).toBe('https://example.com/valid-gdelt');
    expect(processedGdelt[0].seendate).toBe('2026-10-15T06:00:00.000Z');

    const rawRss = [
      {
        link: 'https://example.com/valid-rss',
        title: 'Valid RSS Headline In India',
        pubDate: 'Thu, 15 Oct 2026 05:00:00 GMT',
      },
      {
        link: 'https://example.com/invalid-rss',
        title: 'Invalid Date RSS Headline In India',
        pubDate: 'broken-date-value',
      },
      {
        link: 'https://example.com/no-date-rss',
        title: 'Missing Date RSS Headline In India',
      },
    ];

    const processedRss = processRawRssArticles(rawRss as any);
    expect(processedRss).toHaveLength(1);
    expect(processedRss[0].id).toBe('https://example.com/valid-rss');
    expect(processedRss[0].seendate).toBe('2026-10-15T05:00:00.000Z');
  });

  it('enforces Retry-After backoff immediately on HTTP 429 response', async () => {
    _resetCircuitBreakerForTesting();

    vi.spyOn(global, 'fetch').mockImplementation(async (urlInput: any) => {
      const urlStr = String(urlInput);
      if (urlStr.includes('api.gdeltproject.org')) {
        return new Response('Rate limited', {
          status: 429,
          headers: { 'Retry-After': '90' },
        });
      }
      return new Response('<rss><channel></channel></rss>', {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml' },
      });
    });

    const req = new NextRequest('http://localhost:3000/api/news?refresh=true');
    const res = await GET(req);
    const data = await res.json();

    expect(data.diagnostics.circuitBreaker.consecutiveFailures).toBe(1);
    expect(data.diagnostics.circuitBreaker.isOpen).toBe(true);
    expect(data.diagnostics.circuitBreaker.cooldownRemainingSec).toBeGreaterThanOrEqual(85);
  });

  it('coalesces concurrent requests so upstream is called only once and does not race failure counter', async () => {
    _resetCircuitBreakerForTesting();

    let gdeltCallCount = 0;
    vi.spyOn(global, 'fetch').mockImplementation(async (urlInput: any) => {
      const urlStr = String(urlInput);
      if (urlStr.includes('api.gdeltproject.org')) {
        gdeltCallCount++;
        // Small delay to ensure all concurrent requests pile up during in-flight promise
        await new Promise((r) => setTimeout(r, 40));
        return new Response('Rate limited', { status: 429 });
      }
      return new Response('<rss><channel></channel></rss>', {
        status: 200,
        headers: { 'Content-Type': 'application/rss+xml' },
      });
    });

    // Launch 5 concurrent requests simultaneously
    const requests = Array.from({ length: 5 }, () =>
      GET(new NextRequest('http://localhost:3000/api/news?refresh=true'))
    );

    const responses = await Promise.all(requests);
    expect(responses).toHaveLength(5);
    for (const res of responses) {
      expect(res.status).toBe(200);
    }

    // GDELT should have been fetched exactly ONCE via in-flight coalescence
    expect(gdeltCallCount).toBe(1);

    // Failures should have incremented exactly ONCE, not 5 times
    const cbStatus = getCircuitBreakerStatus();
    expect(cbStatus.consecutiveFailures).toBe(1);
  });
});


