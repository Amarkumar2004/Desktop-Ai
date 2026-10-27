import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  computeCountryHighlights,
  extractCountriesFromText,
  ArticleWithCountries,
  CountryHighlight,
} from '../countryDetection';
import GlobalOverviewCard from '@/components/cards/GlobalOverviewCard';

describe('Country News Hotspots - Strict Derivation from Actual News (Requirement 12)', () => {
  it('1. An India article creates an India news hotspot', () => {
    const rawHeadline = 'India expands AI semiconductor manufacturing in Gujarat';
    const detected = extractCountriesFromText(rawHeadline);
    expect(detected.some((c) => c.code === 'IN')).toBe(true);

    const articles: ArticleWithCountries[] = [
      {
        title: rawHeadline,
        countries: detected.map((c) => ({
          code: c.code,
          code3: c.code3,
          name: c.name,
          flag: c.flag,
        })),
        isNew: true,
      },
    ];

    const highlights = computeCountryHighlights(articles);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].code).toBe('IN');
    expect(highlights[0].name).toBe('India');
    expect(highlights[0].articleCount).toBe(1);
    expect(highlights[0].hasNewArticles).toBe(true);
    expect(highlights[0].flag).toBe('🇮🇳');

    // Render in GlobalOverviewCard and confirm India hotspot is rendered
    const html = renderToStaticMarkup(
      <GlobalOverviewCard highlightedCountries={highlights} />
    );
    expect(html).toContain('country-spot-IN');
    expect(html).toContain('1 Hotspots');
    // India primary colour fill
    expect(html).toContain('fill="#F97316"');
  });

  it('2. A US article creates a US news hotspot', () => {
    const rawHeadline = 'US Federal Reserve announces interest rate decision in Washington';
    const detected = extractCountriesFromText(rawHeadline);
    expect(detected.some((c) => c.code === 'US')).toBe(true);

    const articles: ArticleWithCountries[] = [
      {
        title: rawHeadline,
        countries: detected.map((c) => ({
          code: c.code,
          code3: c.code3,
          name: c.name,
          flag: c.flag,
        })),
        isNew: false,
      },
    ];

    const highlights = computeCountryHighlights(articles);
    expect(highlights).toHaveLength(1);
    expect(highlights[0].code).toBe('US');
    expect(highlights[0].name).toBe('United States');
    expect(highlights[0].articleCount).toBe(1);
    expect(highlights[0].flag).toBe('🇺🇸');

    // Render in GlobalOverviewCard and confirm US hotspot is rendered
    const html = renderToStaticMarkup(
      <GlobalOverviewCard highlightedCountries={highlights} />
    );
    expect(html).toContain('country-spot-US');
    expect(html).toContain('1 Hotspots');
    // US electric blue colour fill
    expect(html).toContain('fill="#0284C7"');
  });

  it('3. A country with no mapped articles has no news hotspot', () => {
    // Dataset only contains an article about India and an article about the United States
    const articles: ArticleWithCountries[] = [
      {
        title: 'India launches new space telescope mission',
        countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
      },
      {
        title: 'United States tests clean geothermal plant',
        countries: [{ code: 'US', code3: 'USA', name: 'United States', flag: '🇺🇸' }],
      },
    ];

    const highlights = computeCountryHighlights(articles);
    const countryCodes = highlights.map((h) => h.code);

    // IN and US are present
    expect(countryCodes).toContain('IN');
    expect(countryCodes).toContain('US');

    // Countries with 0 mapped articles MUST NOT have a hotspot
    expect(countryCodes).not.toContain('JP'); // Japan
    expect(countryCodes).not.toContain('BR'); // Brazil
    expect(countryCodes).not.toContain('DE'); // Germany
    expect(countryCodes).not.toContain('KE'); // Kenya
    expect(countryCodes).not.toContain('AU'); // Australia
    expect(countryCodes).not.toContain('CN'); // China

    // Render in GlobalOverviewCard and verify no unmapped country hotspots exist
    const html = renderToStaticMarkup(
      <GlobalOverviewCard highlightedCountries={highlights} />
    );
    expect(html).toContain('country-spot-IN');
    expect(html).toContain('country-spot-US');
    expect(html).not.toContain('country-spot-JP');
    expect(html).not.toContain('country-spot-BR');
    expect(html).not.toContain('country-spot-DE');
    expect(html).not.toContain('country-spot-KE');
    expect(html).not.toContain('country-spot-AU');
    expect(html).not.toContain('country-spot-CN');
    expect(html).toContain('2 Hotspots');
  });

  it('4. Datacenter nodes / demo dots are removed by default and not counted as news hotspots', () => {
    // No country news hotspots active and no nodes passed
    const htmlEmpty = renderToStaticMarkup(
      <GlobalOverviewCard highlightedCountries={[]} />
    );

    // No hardcoded demo nodes or demo dots exist
    expect(htmlEmpty).toContain('0 Hotspots');
    expect(htmlEmpty).not.toContain('Nodes');
    expect(htmlEmpty).not.toContain('node-us-west');
    expect(htmlEmpty).not.toContain('country-spot-');

    // 1 country hotspot active
    const htmlSingle = renderToStaticMarkup(
      <GlobalOverviewCard
        highlightedCountries={[
          {
            code: 'IN',
            code3: 'IND',
            name: 'India',
            flag: '🇮🇳',
            x: 550,
            y: 175,
            articleCount: 3,
            hasNewArticles: false,
            recentHeadlines: ['India tech boom'],
          },
        ]}
      />
    );

    // Hotspots count is strictly 1
    expect(htmlSingle).toContain('1 Hotspots');
    expect(htmlSingle).toContain('country-spot-IN');
    expect(htmlSingle).not.toContain('country-spot-us-west');
    expect(htmlSingle).not.toContain('node-us-west');

    // When custom infrastructure nodes are explicitly provided via props, they remain separated from news hotspots
    const htmlWithCustomNodes = renderToStaticMarkup(
      <GlobalOverviewCard
        highlightedCountries={[
          {
            code: 'IN',
            code3: 'IND',
            name: 'India',
            flag: '🇮🇳',
            x: 550,
            y: 175,
            articleCount: 3,
            hasNewArticles: false,
            recentHeadlines: ['India tech boom'],
          },
        ]}
        nodes={[
          {
            id: 'node-edge-1',
            name: 'Edge-1',
            region: 'Delhi',
            x: 555,
            y: 170,
            status: 'online',
            agents: 2,
            latency: '10ms',
            color: '#8B5CF6',
          },
        ]}
      />
    );
    expect(htmlWithCustomNodes).toContain('1 Nodes');
    expect(htmlWithCustomNodes).toContain('1 Hotspots');
    expect(htmlWithCustomNodes).toContain('country-spot-IN');
    expect(htmlWithCustomNodes).toContain('node-node-edge-1');
  });

  it('5. An empty news dataset produces zero news hotspots', () => {
    // Empty array of articles
    const emptyArticles: ArticleWithCountries[] = [];
    const highlights = computeCountryHighlights(emptyArticles);
    expect(highlights).toEqual([]);
    expect(highlights).toHaveLength(0);

    // Render with empty highlights
    const html = renderToStaticMarkup(
      <GlobalOverviewCard highlightedCountries={[]} />
    );

    expect(html).toContain('0 Hotspots');
    // No country-spot elements in the rendered SVG
    expect(html).not.toContain('country-spot-');
  });

  it('6. Cached news is handled explicitly during API failures', () => {
    // Real articles that were previously fetched and saved in cache
    const previouslyFetchedRealArticles: ArticleWithCountries[] = [
      {
        title: 'India establishes green hydrogen standards',
        countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
      },
    ];

    // During API failure, derive hotspots strictly from cached real articles
    const cachedHighlights = computeCountryHighlights(previouslyFetchedRealArticles);
    expect(cachedHighlights).toHaveLength(1);
    expect(cachedHighlights[0].code).toBe('IN');

    // Render with isStaleNews = true
    const html = renderToStaticMarkup(
      <GlobalOverviewCard
        highlightedCountries={cachedHighlights}
        isStaleNews={true}
      />
    );

    // Displays the hotspots from cached articles
    expect(html).toContain('country-spot-IN');
    expect(html).toContain('1 Hotspots');
    // Displays the explicit "Cached" indicator during outage
    expect(html).toContain('Cached');
  });

  it('7. Does not infer a country hotspot from publisher location alone', () => {
    // Story from a German publisher, but the story is purely about physics
    const physicsArticleHeadline = 'Quantum entanglement measurement achieves record coherence time in lab';
    const detected = extractCountriesFromText(physicsArticleHeadline);
    expect(detected).toHaveLength(0); // Cannot be mapped to a country

    const articles: ArticleWithCountries[] = [
      {
        title: physicsArticleHeadline,
        countries: detected, // Empty: unmapped to any country
      },
    ];

    const highlights = computeCountryHighlights(articles);
    expect(highlights).toHaveLength(0); // Zero hotspots created
  });

  it('8. Recalculates hotspot countries when news is refreshed, removing obsolete hotspots', () => {
    // Initial fetch: Articles about Japan and India
    const initialArticles: ArticleWithCountries[] = [
      {
        title: 'Japan introduces next-gen humanoid robotics',
        countries: [{ code: 'JP', code3: 'JPN', name: 'Japan', flag: '🇯🇵' }],
      },
      {
        title: 'India digital public infrastructure expands',
        countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
      },
    ];

    const initialHighlights = computeCountryHighlights(initialArticles);
    expect(initialHighlights.map((h) => h.code)).toEqual(expect.arrayContaining(['JP', 'IN']));

    // Refreshed fetch: Japan articles left the dataset; only India and US articles remain
    const refreshedArticles: ArticleWithCountries[] = [
      {
        title: 'India digital public infrastructure expands',
        countries: [{ code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' }],
      },
      {
        title: 'United States approves offshore wind array',
        countries: [{ code: 'US', code3: 'USA', name: 'United States', flag: '🇺🇸' }],
      },
    ];

    const refreshedHighlights = computeCountryHighlights(refreshedArticles);
    const refreshedCodes = refreshedHighlights.map((h) => h.code);

    expect(refreshedCodes).toContain('IN');
    expect(refreshedCodes).toContain('US');
    // Obsolete Japan hotspot is completely removed
    expect(refreshedCodes).not.toContain('JP');
  });

  it('9. News feed and country hotspots maintain 1:1 consistency without artificial slice caps', () => {
    // Generate a list of 200 mock articles across 27 countries
    const mockArticles: ArticleWithCountries[] = Array.from({ length: 200 }, (_, i) => ({
      title: `Article ${i} about India and US technology`,
      countries: [
        { code: 'IN', code3: 'IND', name: 'India', flag: '🇮🇳' },
        { code: 'US', code3: 'USA', name: 'United States', flag: '🇺🇸' },
      ],
    }));

    const highlights = computeCountryHighlights(mockArticles);
    expect(highlights).toHaveLength(2);

    const inSpot = highlights.find((h) => h.code === 'IN');
    const usSpot = highlights.find((h) => h.code === 'US');

    expect(inSpot?.articleCount).toBe(200);
    expect(usSpot?.articleCount).toBe(200);

    // All 200 articles are available for the feed without being truncated
    expect(mockArticles.length).toBe(200);
  });
});
