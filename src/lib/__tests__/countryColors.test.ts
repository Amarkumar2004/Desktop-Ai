import { describe, it, expect } from 'vitest';
import {
  getCountryHotspotColor,
  COUNTRY_HOTSPOT_COLORS,
} from '../countryDetection';

describe('Country Hotspot Colors (Task 1)', () => {
  it('assigns saffron/orange to India (IN)', () => {
    const color = getCountryHotspotColor('IN');
    expect(color.primary).toBe('#F97316'); // Saffron / Orange
    expect(color.border).toBe('#FB923C');
    expect(color.badgeBg).toBe('#431407');
    expect(color.badgeText).toBe('#FFEDD5');
  });

  it('assigns electric blue to United States (US)', () => {
    const color = getCountryHotspotColor('US');
    expect(color.primary).toBe('#0284C7'); // Electric Blue
    expect(color.border).toBe('#38BDF8');
    expect(color.badgeBg).toBe('#082F49');
    expect(color.badgeText).toBe('#E0F2FE');
  });

  it('assigns purple to United Kingdom (GB)', () => {
    const color = getCountryHotspotColor('GB');
    expect(color.primary).toBe('#8B5CF6'); // Purple
    expect(color.border).toBe('#A78BFA');
    expect(color.badgeBg).toBe('#2E1065');
    expect(color.badgeText).toBe('#EDE9FE');
  });

  it('assigns red/pink to Japan (JP)', () => {
    const color = getCountryHotspotColor('JP');
    expect(color.primary).toBe('#F43F5E'); // Red / Pink
    expect(color.border).toBe('#FB7185');
    expect(color.badgeBg).toBe('#4C0519');
    expect(color.badgeText).toBe('#FFE4E6');
  });

  it('normalizes lowercase or whitespace country codes', () => {
    expect(getCountryHotspotColor('in').primary).toBe('#F97316');
    expect(getCountryHotspotColor(' us ').primary).toBe('#0284C7');
    expect(getCountryHotspotColor('gb').primary).toBe('#8B5CF6');
    expect(getCountryHotspotColor('jp').primary).toBe('#F43F5E');
  });

  it('returns deterministic accessible colors for arbitrary countries', () => {
    const color1 = getCountryHotspotColor('SG'); // Singapore
    const color2 = getCountryHotspotColor('SG');
    expect(color1).toEqual(color2);
    expect(color1.primary).toBeDefined();
    expect(color1.border).toBeDefined();
    expect(color1.badgeBg).toBeDefined();

    const colorNZ1 = getCountryHotspotColor('NZ');
    const colorNZ2 = getCountryHotspotColor('NZ');
    expect(colorNZ1).toEqual(colorNZ2);
  });

  it('handles null or empty country codes gracefully', () => {
    const fallback = getCountryHotspotColor(null);
    expect(fallback).toBeDefined();
    expect(fallback.primary).toBeDefined();
    expect(getCountryHotspotColor('')).toBeDefined();
  });
});
