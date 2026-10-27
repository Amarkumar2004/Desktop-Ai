import { describe, it, expect } from 'vitest';
import {
  extractCountriesFromText,
  normalizeCountryCode,
  COUNTRY_REGISTRY,
} from '../countryDetection';

describe('Country Detection & Geographic Normalization', () => {
  it('correctly identifies India from headline mentioning India or Indian cities', () => {
    const r1 = extractCountriesFromText('India launches new solar mission in Sriharikota');
    expect(r1.map((c) => c.code)).toContain('IN');
    expect(r1[0].code3).toBe('IND');
    expect(r1[0].name).toBe('India');

    const r2 = extractCountriesFromText('New Delhi summit discusses semiconductor supply chains');
    expect(r2.map((c) => c.code)).toContain('IN');

    const r3 = extractCountriesFromText('Indian tech startups reach $100B in cumulative funding');
    expect(r3.map((c) => c.code)).toContain('IN');
  });

  it('correctly identifies United States from headline mentioning US or America', () => {
    const r1 = extractCountriesFromText('US Federal Reserve holds interest rate steady');
    expect(r1.map((c) => c.code)).toContain('US');
    expect(r1[0].code3).toBe('USA');

    const r2 = extractCountriesFromText('White House announces new clean energy initiative');
    expect(r2.map((c) => c.code)).toContain('US');

    const r3 = extractCountriesFromText('American aerospace manufacturer tests reusable rocket stage');
    expect(r3.map((c) => c.code)).toContain('US');
  });

  it('correctly identifies multiple countries when genuinely associated', () => {
    const result = extractCountriesFromText(
      'India and United States deepen strategic technology alliance during bilateral summit'
    );
    const codes = result.map((c) => c.code);
    expect(codes).toContain('IN');
    expect(codes).toContain('US');
    expect(result.length).toBe(2);
  });

  it('does NOT highlight random countries for unassignable news headlines', () => {
    const unassignable = [
      'Breakthrough in solid-state quantum battery efficiency announced in peer-reviewed paper',
      'Global cyber defense protocols upgraded across distributed server swarms',
      'Artificial intelligence reasoning model sets new benchmark in mathematical verification',
      'Tech stocks experience moderate rally following quarterly earnings season',
    ];

    for (const title of unassignable) {
      const result = extractCountriesFromText(title);
      expect(result).toEqual([]);
    }
  });

  it('never treats common English words ("in", "us", "it", "is", "no", "at") as country codes', () => {
    const ambiguous = [
      'Scientists in the laboratory discover new enzyme',
      'Join us for the annual developer keynote livestream',
      'Is it possible to achieve true zero-latency streaming?',
      'No issues reported during database migration at midnight',
    ];

    for (const text of ambiguous) {
      const result = extractCountriesFromText(text);
      expect(result).toEqual([]);
    }
  });

  it('normalizes country names and ISO codes properly', () => {
    expect(normalizeCountryCode('India')?.code).toBe('IN');
    expect(normalizeCountryCode('IND')?.code).toBe('IN');
    expect(normalizeCountryCode('in')?.code).toBe('IN');
    expect(normalizeCountryCode('United States')?.code).toBe('US');
    expect(normalizeCountryCode('USA')?.code).toBe('US');
    expect(normalizeCountryCode('NonExistentLand')).toBeNull();
  });

  it('has valid coordinates within the Natural Earth 800x390 SVG map for all registry entries', () => {
    for (const country of Object.values(COUNTRY_REGISTRY)) {
      expect(country.x).toBeGreaterThan(0);
      expect(country.x).toBeLessThan(800);
      expect(country.y).toBeGreaterThan(0);
      expect(country.y).toBeLessThan(390);
      expect(country.flag).toBeDefined();
      expect(country.code3.length).toBe(3);
    }
  });
});
