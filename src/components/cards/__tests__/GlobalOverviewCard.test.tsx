import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GlobalOverviewCard, { MapPinSymbol } from '../GlobalOverviewCard';
import { CountryHighlight } from '@/lib/countryDetection';

describe('GlobalOverviewCard - Country Hotspot Reused Map Pin Symbols', () => {
  it('MapPinSymbol renders the exact teardrop pin SVG path and center dots', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <MapPinSymbol color="#F97316" pinType="pin" />
      </svg>
    );

    // Verify original teardrop path d attribute
    expect(markup).toContain('d="M 0 10 C -4 5, -6.5 2.5, -6.5 -1.5 C -6.5 -5.8, -3.6 -9, 0 -9 C 3.6 -9, 6.5 -5.8, 6.5 -1.5 C 6.5 2.5, 4 5, 0 10 Z"');
    // Verify drop shadow filter and white border stroke
    expect(markup).toContain('filter="url(#pinShadow)"');
    expect(markup).toContain('stroke="#FFFFFF"');
    expect(markup).toContain('stroke-width="1.3"');
    // Verify teardrop body fill color
    expect(markup).toContain('fill="#F97316"');
    // Verify ground shadow ellipse
    expect(markup).toContain('<ellipse cx="0" cy="11" rx="4.5" ry="1.5"');
    // Verify center dot bulls-eye (white outer circle and colored inner circle)
    expect(markup).toContain('<circle cx="0" cy="-2" r="2.2" fill="#FFFFFF"');
    expect(markup).toContain('<circle cx="0" cy="-2" r="1.1" fill="#F97316"');
  });

  it('MapPinSymbol renders the shield pin when pinType="shield"', () => {
    const markup = renderToStaticMarkup(
      <svg>
        <MapPinSymbol color="#2563EB" pinType="shield" />
      </svg>
    );

    // Verify shield path d attribute
    expect(markup).toContain('d="M 0 10 L -6 2 C -6 -6, -4 -9, 0 -9 C 4 -9, 6 -6, 6 2 Z"');
    expect(markup).toContain('fill="#2563EB"');
    expect(markup).toContain('<circle cx="0" cy="-1.5" r="2.2" fill="#FFFFFF"');
    expect(markup).toContain('<circle cx="0" cy="-1.5" r="1.1" fill="#2563EB"');
  });

  it('renders country hotspots using the exact reused MapPinSymbol with country colors instead of generic circular dots', () => {
    const mockHighlights: CountryHighlight[] = [
      {
        code: 'IN',
        code3: 'IND',
        name: 'India',
        flag: '🇮🇳',
        x: 550,
        y: 175,
        articleCount: 5,
        recentHeadlines: ['India tech hub expands AI cluster'],
        hasNewArticles: true,
      },
      {
        code: 'US',
        code3: 'USA',
        name: 'United States',
        flag: '🇺🇸',
        x: 165,
        y: 135,
        articleCount: 12,
        recentHeadlines: ['US market rallies'],
        hasNewArticles: false,
      },
    ];

    const markup = renderToStaticMarkup(
      <GlobalOverviewCard highlightedCountries={mockHighlights} />
    );

    // Country hotspots container with transformed coordinates
    expect(markup).toContain('country-spot-IN');
    expect(markup).toContain('country-spot-US');

    // Both country hotspots reuse the teardrop path
    const teardropPathMatches = markup.match(/M 0 10 C -4 5, -6.5 2.5, -6.5 -1.5 C -6.5 -5.8, -3.6 -9, 0 -9 C 3.6 -9, 6.5 -5.8, 6.5 -1.5 C 6.5 2.5, 4 5, 0 10 Z/g);
    // Exactly 2 country hotspots teardrop pins (zero demo pins rendered)
    expect(teardropPathMatches?.length).toBe(2);

    // Old demo nodes are completely absent
    expect(markup).not.toContain('node-us-west');
    expect(markup).not.toContain('node-us-east');
    expect(markup).not.toContain('node-eu-central');
    expect(markup).not.toContain('Silicon Valley');
    expect(markup).not.toContain('Nodes');

    // Country hotspots have their respective fills on the teardrop markers
    expect(markup).toContain('fill="#F97316"'); // India saffron/orange
    expect(markup).toContain('fill="#0284C7"'); // US electric blue

    // Does NOT render plain circular dots as the hotspot landmark marker
    // (Previous plain circular dots were r="2.5" / r="3.5" with filter="url(#pinShadow)")
    expect(markup).not.toContain('r="2.5" fill="#F97316"');
    expect(markup).not.toContain('r="3.5" fill="#F97316"');
    expect(markup).not.toContain('r="2.5" fill="#0284C7"');

    // Retains country pill badge hovering right above the pin
    expect(markup).toContain('transform="translate(0, -14)"');
    expect(markup).toContain('IN');
    expect(markup).toContain('5');
    expect(markup).toContain('US');
    expect(markup).toContain('12');

    // Retains glowing beacon for countries with new articles
    expect(markup).toContain('animate-ping');
  });

  it('renders zero markers when news dataset is empty or coordinates are invalid', () => {
    // 1. Empty news dataset
    const markupEmpty = renderToStaticMarkup(<GlobalOverviewCard highlightedCountries={[]} />);
    const teardropsEmpty = markupEmpty.match(/M 0 10 C -4 5, -6.5 2.5, -6.5 -1.5 C -6.5 -5.8, -3.6 -9, 0 -9 C 3.6 -9, 6.5 -5.8, 6.5 -1.5 C 6.5 2.5, 4 5, 0 10 Z/g);
    expect(teardropsEmpty).toBeNull();
    expect(markupEmpty).toContain('0 Hotspots');
    expect(markupEmpty).not.toContain('Nodes');
    expect(markupEmpty).not.toContain('country-spot-');

    // 2. Invalid or missing coordinates (e.g. NaN, 0, or negative)
    const invalidHighlights: CountryHighlight[] = [
      {
        code: 'XX',
        code3: 'XXX',
        name: 'Invalid Country',
        flag: '🏳️',
        x: NaN,
        y: 0,
        articleCount: 5,
        recentHeadlines: ['Invalid coords test'],
        hasNewArticles: false,
      },
    ];
    const markupInvalid = renderToStaticMarkup(
      <GlobalOverviewCard highlightedCountries={invalidHighlights} />
    );
    const teardropsInvalid = markupInvalid.match(/M 0 10 C -4 5, -6.5 2.5, -6.5 -1.5 C -6.5 -5.8, -3.6 -9, 0 -9 C 3.6 -9, 6.5 -5.8, 6.5 -1.5 C 6.5 2.5, 4 5, 0 10 Z/g);
    expect(teardropsInvalid).toBeNull();
    expect(markupInvalid).not.toContain('country-spot-XX');
  });

  it('renders active filter banner and selection styling when a country is selected', () => {
    const mockHighlights: CountryHighlight[] = [
      {
        code: 'JP',
        code3: 'JPN',
        name: 'Japan',
        flag: '🇯🇵',
        x: 712,
        y: 138,
        articleCount: 4,
        recentHeadlines: ['Robotics milestone in Tokyo'],
        hasNewArticles: false,
      },
    ];

    const markup = renderToStaticMarkup(
      <GlobalOverviewCard
        highlightedCountries={mockHighlights}
        selectedCountryCode="JP"
      />
    );

    // Active filter banner is displayed
    expect(markup).toContain('Filtering map &amp; feed for');
    expect(markup).toContain('Japan');

    // Selection dashed halo on the selected hotspot
    expect(markup).toContain('stroke-dasharray="3 2"');
    expect(markup).toContain('country-spot-JP');
  });
});
