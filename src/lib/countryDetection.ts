/**
 * Country Detection and Geographic Mapping Module
 *
 * Provides accurate ISO 3166-1 alpha-2 and alpha-3 identification for news articles,
 * projected coordinates on the Natural Earth 800x390 SVG map, and robust keyword
 * and boundary-safe regex matching that avoids false positives.
 */

export interface CountryData {
  code: string; // ISO 3166-1 alpha-2 (e.g. 'IN')
  code3: string; // ISO 3166-1 alpha-3 (e.g. 'IND')
  name: string; // Official common name (e.g. 'India')
  flag: string; // Unicode flag emoji (e.g. '🇮🇳')
  x: number; // Projected x coordinate on 800x390 Natural Earth map
  y: number; // Projected y coordinate on 800x390 Natural Earth map
  aliases: string[]; // Country names, demonyms, key cities
}

export interface DetectedCountry extends CountryData {
  matchedKeywords: string[];
}

export interface CountryHighlight {
  code: string;
  code3: string;
  name: string;
  flag: string;
  x: number;
  y: number;
  articleCount: number;
  hasNewArticles: boolean;
  recentHeadlines: string[];
}

export interface CountryHotspotColor {
  primary: string;
  glow: string;
  border: string;
  badgeBg: string;
  badgeText: string;
}

/**
 * Predefined accessible color palette for global news hotspot markers.
 * Required:
 * - India: saffron/orange
 * - United States: electric blue
 * - United Kingdom: purple
 * - Japan: red/pink
 * - Other countries: deterministic colors from predefined accessible palette.
 */
export const COUNTRY_HOTSPOT_COLORS: Record<string, CountryHotspotColor> = {
  IN: {
    primary: '#F97316', // Saffron / Orange
    glow: 'rgba(249, 115, 22, 0.45)',
    border: '#FB923C',
    badgeBg: '#431407',
    badgeText: '#FFEDD5',
  },
  US: {
    primary: '#0284C7', // Electric Blue
    glow: 'rgba(2, 132, 199, 0.45)',
    border: '#38BDF8',
    badgeBg: '#082F49',
    badgeText: '#E0F2FE',
  },
  GB: {
    primary: '#8B5CF6', // Purple
    glow: 'rgba(139, 92, 246, 0.45)',
    border: '#A78BFA',
    badgeBg: '#2E1065',
    badgeText: '#EDE9FE',
  },
  JP: {
    primary: '#F43F5E', // Red / Pink
    glow: 'rgba(244, 63, 94, 0.45)',
    border: '#FB7185',
    badgeBg: '#4C0519',
    badgeText: '#FFE4E6',
  },
  CN: {
    primary: '#DC2626', // Crimson Red
    glow: 'rgba(220, 38, 38, 0.45)',
    border: '#F87171',
    badgeBg: '#450A0A',
    badgeText: '#FEE2E2',
  },
  DE: {
    primary: '#10B981', // Emerald Green
    glow: 'rgba(16, 185, 129, 0.45)',
    border: '#34D399',
    badgeBg: '#064E3B',
    badgeText: '#D1FAE5',
  },
  FR: {
    primary: '#06B6D4', // Cyan
    glow: 'rgba(6, 182, 212, 0.45)',
    border: '#22D3EE',
    badgeBg: '#164E63',
    badgeText: '#CFFAFE',
  },
  AU: {
    primary: '#14B8A6', // Teal
    glow: 'rgba(20, 184, 166, 0.45)',
    border: '#2DD4BF',
    badgeBg: '#134E4A',
    badgeText: '#CCFBF1',
  },
  CA: {
    primary: '#EF4444', // Scarlet
    glow: 'rgba(239, 68, 68, 0.45)',
    border: '#FCA5A5',
    badgeBg: '#450A0A',
    badgeText: '#FEE2E2',
  },
  BR: {
    primary: '#16A34A', // Leaf Green
    glow: 'rgba(22, 163, 74, 0.45)',
    border: '#4ADE80',
    badgeBg: '#052E16',
    badgeText: '#DCFCE7',
  },
};

const DETERMINISTIC_PALETTE: CountryHotspotColor[] = [
  { primary: '#06B6D4', glow: 'rgba(6, 182, 212, 0.45)', border: '#22D3EE', badgeBg: '#164E63', badgeText: '#CFFAFE' }, // Cyan
  { primary: '#10B981', glow: 'rgba(16, 185, 129, 0.45)', border: '#34D399', badgeBg: '#064E3B', badgeText: '#D1FAE5' }, // Emerald
  { primary: '#EC4899', glow: 'rgba(236, 72, 153, 0.45)', border: '#F472B6', badgeBg: '#500724', badgeText: '#FCE7F3' }, // Pink
  { primary: '#6366F1', glow: 'rgba(99, 102, 241, 0.45)', border: '#818CF8', badgeBg: '#1E1B4B', badgeText: '#E0E7FF' }, // Indigo
  { primary: '#EAB308', glow: 'rgba(234, 179, 8, 0.45)', border: '#FACC15', badgeBg: '#422006', badgeText: '#FEF08A' },  // Amber/Gold
  { primary: '#14B8A6', glow: 'rgba(20, 184, 166, 0.45)', border: '#2DD4BF', badgeBg: '#134E4A', badgeText: '#CCFBF1' }, // Teal
  { primary: '#A855F7', glow: 'rgba(168, 85, 247, 0.45)', border: '#C084FC', badgeBg: '#3B0764', badgeText: '#F3E8FF' }, // Violet
  { primary: '#F97316', glow: 'rgba(249, 115, 22, 0.45)', border: '#FB923C', badgeBg: '#431407', badgeText: '#FFEDD5' }, // Orange
];

/**
 * Returns a deterministic, visually pleasing, accessible color set for any country code.
 */
export function getCountryHotspotColor(countryCode: string | null | undefined): CountryHotspotColor {
  const code = (countryCode || '').trim().toUpperCase();
  if (COUNTRY_HOTSPOT_COLORS[code]) {
    return COUNTRY_HOTSPOT_COLORS[code];
  }
  if (!code) {
    return DETERMINISTIC_PALETTE[0];
  }
  let hash = 0;
  for (let i = 0; i < code.length; i++) {
    hash = (hash << 5) - hash + code.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % DETERMINISTIC_PALETTE.length;
  return DETERMINISTIC_PALETTE[index];
}

/**
 * Registry of countries with coordinates aligned to the existing Natural Earth
 * projection in GlobalOverviewCard (viewBox 0 0 800 390).
 */
export const COUNTRY_REGISTRY: Record<string, CountryData> = {
  IN: {
    code: 'IN',
    code3: 'IND',
    name: 'India',
    flag: '🇮🇳',
    x: 565,
    y: 175,
    aliases: ['india', 'indian', 'bharat', 'hindustan', 'new delhi', 'delhi', 'mumbai', 'bengaluru', 'bangalore', 'isro'],
  },
  US: {
    code: 'US',
    code3: 'USA',
    name: 'United States',
    flag: '🇺🇸',
    x: 165,
    y: 135,
    aliases: ['united states', 'usa', 'u.s.', 'america', 'american', 'white house', 'capitol hill', 'pentagon', 'federal reserve', 'washington'],
  },
  GB: {
    code: 'GB',
    code3: 'GBR',
    name: 'United Kingdom',
    flag: '🇬🇧',
    x: 388,
    y: 92,
    aliases: ['united kingdom', 'uk', 'u.k.', 'britain', 'british', 'england', 'london', 'downing street', 'westminster'],
  },
  CN: {
    code: 'CN',
    code3: 'CHN',
    name: 'China',
    flag: '🇨🇳',
    x: 645,
    y: 130,
    aliases: ['china', 'chinese', 'beijing', 'shanghai', 'xi jinping'],
  },
  JP: {
    code: 'JP',
    code3: 'JPN',
    name: 'Japan',
    flag: '🇯🇵',
    x: 712,
    y: 138,
    aliases: ['japan', 'japanese', 'tokyo', 'osaka'],
  },
  DE: {
    code: 'DE',
    code3: 'DEU',
    name: 'Germany',
    flag: '🇩🇪',
    x: 412,
    y: 96,
    aliases: ['germany', 'german', 'berlin', 'frankfurt', 'bundesrat'],
  },
  FR: {
    code: 'FR',
    code3: 'FRA',
    name: 'France',
    flag: '🇫🇷',
    x: 395,
    y: 108,
    aliases: ['france', 'french', 'paris', 'macron'],
  },
  AU: {
    code: 'AU',
    code3: 'AUS',
    name: 'Australia',
    flag: '🇦🇺',
    x: 734,
    y: 325,
    aliases: ['australia', 'australian', 'canberra', 'sydney', 'melbourne'],
  },
  CA: {
    code: 'CA',
    code3: 'CAN',
    name: 'Canada',
    flag: '🇨🇦',
    x: 185,
    y: 88,
    aliases: ['canada', 'canadian', 'ottawa', 'toronto', 'vancouver'],
  },
  BR: {
    code: 'BR',
    code3: 'BRA',
    name: 'Brazil',
    flag: '🇧🇷',
    x: 283,
    y: 285,
    aliases: ['brazil', 'brazilian', 'brasil', 'brasilia', 'brasília', 'são paulo', 'sao paulo'],
  },
  RU: {
    code: 'RU',
    code3: 'RUS',
    name: 'Russia',
    flag: '🇷🇺',
    x: 550,
    y: 78,
    aliases: ['russia', 'russian', 'moscow', 'kremlin', 'putin'],
  },
  UA: {
    code: 'UA',
    code3: 'UKR',
    name: 'Ukraine',
    flag: '🇺🇦',
    x: 450,
    y: 96,
    aliases: ['ukraine', 'ukrainian', 'kyiv', 'kiev', 'zelensky', 'zelenskyy'],
  },
  KR: {
    code: 'KR',
    code3: 'KOR',
    name: 'South Korea',
    flag: '🇰🇷',
    x: 685,
    y: 134,
    aliases: ['south korea', 'korean', 'seoul'],
  },
  SA: {
    code: 'SA',
    code3: 'SAU',
    name: 'Saudi Arabia',
    flag: '🇸🇦',
    x: 488,
    y: 170,
    aliases: ['saudi arabia', 'saudi', 'riyadh'],
  },
  AE: {
    code: 'AE',
    code3: 'ARE',
    name: 'United Arab Emirates',
    flag: '🇦🇪',
    x: 512,
    y: 172,
    aliases: ['united arab emirates', 'uae', 'u.a.e.', 'dubai', 'abu dhabi'],
  },
  IL: {
    code: 'IL',
    code3: 'ISR',
    name: 'Israel',
    flag: '🇮🇱',
    x: 462,
    y: 150,
    aliases: ['israel', 'israeli', 'jerusalem', 'tel aviv'],
  },
  SG: {
    code: 'SG',
    code3: 'SGP',
    name: 'Singapore',
    flag: '🇸🇬',
    x: 640,
    y: 236,
    aliases: ['singapore', 'singaporean'],
  },
  ZA: {
    code: 'ZA',
    code3: 'ZAF',
    name: 'South Africa',
    flag: '🇿🇦',
    x: 440,
    y: 320,
    aliases: ['south africa', 'south african', 'johannesburg', 'cape town'],
  },
  IT: {
    code: 'IT',
    code3: 'ITA',
    name: 'Italy',
    flag: '🇮🇹',
    x: 416,
    y: 115,
    aliases: ['italy', 'italian', 'rome', 'milan'],
  },
  ES: {
    code: 'ES',
    code3: 'ESP',
    name: 'Spain',
    flag: '🇪🇸',
    x: 382,
    y: 120,
    aliases: ['spain', 'spanish', 'madrid', 'barcelona'],
  },
  MX: {
    code: 'MX',
    code3: 'MEX',
    name: 'Mexico',
    flag: '🇲🇽',
    x: 145,
    y: 185,
    aliases: ['mexico', 'mexican', 'mexico city'],
  },
  EG: {
    code: 'EG',
    code3: 'EGY',
    name: 'Egypt',
    flag: '🇪🇬',
    x: 455,
    y: 160,
    aliases: ['egypt', 'egyptian', 'cairo'],
  },
  TR: {
    code: 'TR',
    code3: 'TUR',
    name: 'Turkey',
    flag: '🇹🇷',
    x: 460,
    y: 120,
    aliases: ['turkey', 'türkiye', 'turkish', 'ankara', 'istanbul', 'erdogan'],
  },
  ID: {
    code: 'ID',
    code3: 'IDN',
    name: 'Indonesia',
    flag: '🇮🇩',
    x: 660,
    y: 245,
    aliases: ['indonesia', 'indonesian', 'jakarta'],
  },
  PK: {
    code: 'PK',
    code3: 'PAK',
    name: 'Pakistan',
    flag: '🇵🇰',
    x: 535,
    y: 160,
    aliases: ['pakistan', 'pakistani', 'islamabad', 'karachi'],
  },
  BD: {
    code: 'BD',
    code3: 'BGD',
    name: 'Bangladesh',
    flag: '🇧🇩',
    x: 595,
    y: 172,
    aliases: ['bangladesh', 'bangladeshi', 'dhaka'],
  },
  VN: {
    code: 'VN',
    code3: 'VNM',
    name: 'Vietnam',
    flag: '🇻🇳',
    x: 635,
    y: 195,
    aliases: ['vietnam', 'vietnamese', 'hanoi', 'ho chi minh'],
  },
  PH: {
    code: 'PH',
    code3: 'PHL',
    name: 'Philippines',
    flag: '🇵🇭',
    x: 685,
    y: 200,
    aliases: ['philippines', 'philippine', 'filipino', 'manila'],
  },
  KE: {
    code: 'KE',
    code3: 'KEN',
    name: 'Kenya',
    flag: '🇰🇪',
    x: 473,
    y: 238,
    aliases: ['kenya', 'kenyan', 'nairobi'],
  },
  NG: {
    code: 'NG',
    code3: 'NGA',
    name: 'Nigeria',
    flag: '🇳🇬',
    x: 405,
    y: 215,
    aliases: ['nigeria', 'nigerian', 'lagos', 'abuja'],
  },
  AR: {
    code: 'AR',
    code3: 'ARG',
    name: 'Argentina',
    flag: '🇦🇷',
    x: 250,
    y: 340,
    aliases: ['argentina', 'argentine', 'argentinian', 'buenos aires'],
  },
  SE: {
    code: 'SE',
    code3: 'SWE',
    name: 'Sweden',
    flag: '🇸🇪',
    x: 425,
    y: 65,
    aliases: ['sweden', 'swedish', 'stockholm'],
  },
  NO: {
    code: 'NO',
    code3: 'NOR',
    name: 'Norway',
    flag: '🇳🇴',
    x: 408,
    y: 65,
    aliases: ['norway', 'norwegian', 'oslo'],
  },
  PL: {
    code: 'PL',
    code3: 'POL',
    name: 'Poland',
    flag: '🇵🇱',
    x: 432,
    y: 92,
    aliases: ['poland', 'polish', 'warsaw'],
  },
  CH: {
    code: 'CH',
    code3: 'CHE',
    name: 'Switzerland',
    flag: '🇨🇭',
    x: 405,
    y: 104,
    aliases: ['switzerland', 'swiss', 'geneva', 'zurich', 'bern'],
  },
  NL: {
    code: 'NL',
    code3: 'NLD',
    name: 'Netherlands',
    flag: '🇳🇱',
    x: 400,
    y: 90,
    aliases: ['netherlands', 'dutch', 'amsterdam', 'the hague'],
  },
  NZ: {
    code: 'NZ',
    code3: 'NZL',
    name: 'New Zealand',
    flag: '🇳🇿',
    x: 775,
    y: 350,
    aliases: ['new zealand', 'auckland', 'wellington'],
  },
  IR: {
    code: 'IR',
    code3: 'IRN',
    name: 'Iran',
    flag: '🇮🇷',
    x: 505,
    y: 145,
    aliases: ['iran', 'iranian', 'tehran'],
  },
  GE: {
    code: 'GE',
    code3: 'GEO',
    name: 'Georgia',
    flag: '🇬🇪',
    x: 480,
    y: 118,
    aliases: ['georgia', 'georgian', 'tbilisi', 'caucasus'],
  },
  JO: {
    code: 'JO',
    code3: 'JOR',
    name: 'Jordan',
    flag: '🇯🇴',
    x: 468,
    y: 155,
    aliases: ['jordan', 'jordanian', 'amman', 'hashemite'],
  },
  TD: {
    code: 'TD',
    code3: 'TCD',
    name: 'Chad',
    flag: '🇹🇩',
    x: 445,
    y: 200,
    aliases: ['chad', 'chadian', "n'djamena", 'ndjamena'],
  },
  NE: {
    code: 'NE',
    code3: 'NER',
    name: 'Niger',
    flag: '🇳🇪',
    x: 418,
    y: 198,
    aliases: ['niger', 'nigerien', 'niamey'],
  },
};

/**
 * Words that are ambiguous and must NOT be matched case-insensitively as country codes
 */
const AMBIGUOUS_WORDS = new Set([
  'in', 'us', 'it', 'is', 'no', 'at', 'be', 'so', 'an', 'to', 'or', 'do', 'by', 'my', 'al', 'am', 'me', 'id',
  'ge', 'jo', 'td', 'ne', 'as', 'we', 'he', 'of', 'on', 'up'
]);

/**
 * Contextual disambiguation guards for words that may refer to persons, US states,
 * foods, or rivers rather than sovereign countries.
 */
export function isAmbiguousFalsePositive(code: string, matchedWord: string, fullText: string): boolean {
  const lower = fullText.toLowerCase();

  // GE: Georgia (Caucasus country vs US state of Georgia)
  if (code === 'GE') {
    // If text contains strong US state / US politics signals, it's the US state
    if (/\b(?:atlanta|savannah|athens|kemp|warnock|us state|georgia state|georgia tech|bulldogs|southern|georgia voters?|georgia election|georgia senate|fani willis)\b/i.test(lower)) {
      return true;
    }
    // Require sovereign country context when only the bare word "georgia" is present
    const hasSovereignContext = /\b(?:tbilisi|caucasus|black sea|south ossetia|abkhazia|former soviet|country of georgia|nation of georgia|georgian president|georgian prime minister|georgian parliament|zourabichvili|kobakhidze)\b/i.test(lower);
    if (!hasSovereignContext && /\b(?:senate|senator|governor|gop|democrat|ballot|voter|trump|biden)\b/i.test(lower)) {
      return true;
    }
  }

  // JO: Jordan (Middle East kingdom vs person name Jordan)
  if (code === 'JO') {
    // Common person names (athlete, coach, actor, public figures)
    if (/\b(?:michael jordan|jordan belfort|jim jordan|jordan henderson|jordan poole|jordan peterson|deandre jordan|jordan love|jordan pickford|actor jordan|coach jordan|montell jordan)\b/i.test(lower)) {
      return true;
    }
    // Person name pattern: "Firstname Jordan" or "Jordan Lastname" without Middle East sovereign signals
    const hasSovereignContext = /\b(?:amman|king abdullah|hashemite|middle east|west bank|border with syria|kingdom of jordan|jordanian government|jordanian army|jordanian)\b/i.test(lower);
    if (!hasSovereignContext && /\b(?:said jordan|jordan said|mr\.? jordan|coach jordan|guard jordan|quarterback jordan)\b/i.test(lower)) {
      return true;
    }
  }

  // TD: Chad (Sahel country vs person name or slang)
  if (code === 'TD') {
    const hasSovereignContext = /\b(?:n'djamena|ndjamena|sahel|lake chad|chadian|central africa|republic of chad|president of chad|deby|debym)\b/i.test(lower);
    if (!hasSovereignContext) {
      return true; // Disqualify Chad unless sovereign context is explicitly present
    }
  }

  // TR: Turkey / Türkiye (Sovereign nation vs bird/food)
  if (code === 'TR') {
    if (/\b(?:wild turkey|roast turkey|thanksgiving turkey|turkey sandwich|turkey dinner|cook(?:ing)? (?:a )?turkey|turkey breast|smoked turkey|turkey bowl)\b/i.test(lower)) {
      return true;
    }
  }

  // NE: Niger (Sahel country vs Nigerian state / Niger River)
  if (code === 'NE') {
    if (/\b(?:niger delta|niger river|niger state)\b/i.test(lower)) {
      return true;
    }
    const hasSovereignContext = /\b(?:niamey|sahel|republic of niger|nigerien|niger's junta|tchiani|general tchiani)\b/i.test(lower);
    if (!hasSovereignContext && /\b(?:nigeria|nigerian)\b/i.test(lower)) {
      return true;
    }
  }

  return false;
}

/**
 * Normalizes a country name or code string to a registered CountryData item.
 */
export function normalizeCountryCode(input: string | undefined | null): CountryData | null {
  if (!input) return null;
  const clean = input.trim();
  if (!clean) return null;

  // Exact ISO alpha-2 check
  const upper = clean.toUpperCase();
  if (COUNTRY_REGISTRY[upper]) {
    return COUNTRY_REGISTRY[upper];
  }

  // Exact ISO alpha-3 check
  for (const country of Object.values(COUNTRY_REGISTRY)) {
    if (country.code3 === upper) {
      return country;
    }
  }

  // Common name / alias check
  const lower = clean.toLowerCase();
  for (const country of Object.values(COUNTRY_REGISTRY)) {
    if (country.name.toLowerCase() === lower) {
      return country;
    }
    for (const alias of country.aliases) {
      if (alias === lower) {
        return country;
      }
    }
  }

  return null;
}

/**
 * Identifies explicit countries mentioned in an article title or description.
 * Applies disambiguation guards for ambiguous words (Georgia, Jordan, Chad, Turkey, Niger).
 */
export function extractCountriesFromText(text: string | undefined | null): DetectedCountry[] {
  if (!text || typeof text !== 'string') return [];

  const matchedCountries: Map<string, DetectedCountry> = new Map();

  // Test against each registered country
  for (const country of Object.values(COUNTRY_REGISTRY)) {
    const hits: string[] = [];

    // 1. Check exact country name
    const nameRegex = new RegExp(`\\b${escapeRegex(country.name)}\\b`, 'i');
    if (nameRegex.test(text)) {
      hits.push(country.name);
    }

    // 2. Check uppercase ISO codes ONLY (never lowercase to avoid "in", "us", "it", etc.)
    if (!AMBIGUOUS_WORDS.has(country.code.toLowerCase())) {
      const codeRegex = new RegExp(`\\b${country.code}\\b`);
      if (codeRegex.test(text)) {
        hits.push(country.code);
      }
    } else {
      // For US / UK / UAE, allow uppercase acronyms or dotted versions
      if (country.code === 'US') {
        const usRegex = /\b(?:U\.S\.A?\b|US\b)/;
        if (usRegex.test(text)) hits.push('US');
      } else if (country.code === 'GB') {
        const ukRegex = /\b(?:U\.K\.|UK\b)/;
        if (ukRegex.test(text)) hits.push('UK');
      }
    }

    // Check ISO-3 code (e.g. IND, USA, GBR)
    const code3Regex = new RegExp(`\\b${country.code3}\\b`, 'i');
    if (code3Regex.test(text)) {
      hits.push(country.code3);
    }

    // 3. Check aliases and demonyms (e.g., 'Indian', 'American', 'Tokyo', 'New Delhi')
    for (const alias of country.aliases) {
      if (alias === country.name.toLowerCase()) continue;
      if (AMBIGUOUS_WORDS.has(alias)) continue;

      const aliasRegex = new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i');
      if (aliasRegex.test(text)) {
        hits.push(alias);
      }
    }

    // Filter out ambiguous false positives
    const validHits = hits.filter((h) => !isAmbiguousFalsePositive(country.code, h, text));

    if (validHits.length > 0) {
      matchedCountries.set(country.code, {
        ...country,
        matchedKeywords: Array.from(new Set(validHits)),
      });
    }
  }

  return Array.from(matchedCountries.values());
}

export interface ArticleCountryDetectionInput {
  title?: string;
  summary?: string;
  description?: string;
  sourceCountry?: string; // Publisher location: strictly info, NEVER sole inference
  publisherCountry?: string; // Alias for sourceCountry
}

/**
 * Multi-field country association:
 * Inspects title first (primary weight), then summary/description if title has no country.
 * When evidence is insufficient, returns [] (Global / Unassigned) rather than inventing a country.
 * Never assigns a country solely based on publisher/sourceCountry.
 */
export function extractCountriesFromArticle(
  input: ArticleCountryDetectionInput | string | null | undefined
): DetectedCountry[] {
  if (!input) return [];

  const title = typeof input === 'string' ? input : (input.title || '');
  const summary = typeof input === 'string' ? '' : (input.summary || input.description || '');

  // 1. Primary check: title
  const titleMatches = extractCountriesFromText(title);
  if (titleMatches.length > 0) {
    return titleMatches;
  }

  // 2. Secondary check: summary/description
  if (summary && summary.trim().length > 0) {
    const summaryMatches = extractCountriesFromText(summary);
    if (summaryMatches.length > 0) {
      return summaryMatches;
    }
  }

  // 3. Insufficient evidence -> Global / Unassigned
  return [];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ArticleWithCountries {
  id?: string;
  url?: string;
  title?: string;
  isNew?: boolean;
  countries: {
    code: string;
    code3?: string;
    name?: string;
    flag?: string;
  }[];
}

/**
 * Computes geographic news hotspot highlights strictly from actual country-mapped articles.
 *
 * Rules:
 * 1. An article only contributes to a country hotspot if its country is present in article.countries.
 * 2. If a country has zero mapped articles in the dataset, NO hotspot is created for it.
 * 3. An empty news dataset produces zero country hotspots ([]).
 * 4. Datacenter nodes are network infrastructure and are NEVER counted or included here.
 * 5. Publisher location/sourceCountry alone is never used to infer a hotspot.
 */
export function computeCountryHighlights(articles: ArticleWithCountries[]): CountryHighlight[] {
  if (!Array.isArray(articles) || articles.length === 0) {
    return [];
  }

  const countryMap = new Map<string, { count: number; headlines: string[]; hasNew: boolean }>();

  for (const art of articles) {
    if (!art.countries || !Array.isArray(art.countries)) continue;

    // Deduplicate multiple mentions of the same country within a single article
    const seenInArticle = new Set<string>();

    for (const c of art.countries) {
      if (!c.code) continue;
      const upperCode = c.code.toUpperCase();
      if (seenInArticle.has(upperCode)) continue;
      seenInArticle.add(upperCode);

      const entry = countryMap.get(upperCode) || { count: 0, headlines: [], hasNew: false };
      entry.count += 1;
      if (art.title && entry.headlines.length < 3) {
        entry.headlines.push(art.title);
      }
      if (art.isNew) {
        entry.hasNew = true;
      }
      countryMap.set(upperCode, entry);
    }
  }

  const highlights: CountryHighlight[] = [];
  for (const [code, info] of countryMap.entries()) {
    if (info.count <= 0) continue;
    const reg = COUNTRY_REGISTRY[code];
    if (
      reg &&
      typeof reg.x === 'number' &&
      typeof reg.y === 'number' &&
      !isNaN(reg.x) &&
      !isNaN(reg.y) &&
      reg.x > 0 &&
      reg.y > 0
    ) {
      highlights.push({
        code: reg.code,
        code3: reg.code3,
        name: reg.name,
        flag: reg.flag,
        x: reg.x,
        y: reg.y,
        articleCount: info.count,
        hasNewArticles: info.hasNew,
        recentHeadlines: info.headlines,
      });
    }
  }

  // Sort by highest article count
  highlights.sort((a, b) => b.articleCount - a.articleCount);
  return highlights;
}

export interface PositionedCountryHighlight extends CountryHighlight {
  dx: number; // Collision offset x
  dy: number; // Collision offset y
  isDisplaced: boolean;
}

/**
 * Resolves overlapping map pins using deterministic radial/tangent relaxation.
 * Preserves the true country coordinates as the anchor point, and provides
 * non-overlapping badge coordinates (x + dx, y + dy) with hairline leaders.
 */
export function resolveHotspotCollisions(
  hotspots: CountryHighlight[],
  collisionThreshold = 26
): PositionedCountryHighlight[] {
  if (!hotspots || hotspots.length === 0) return [];

  // Sort deterministically by country code
  const list = [...hotspots].sort((a, b) => a.code.localeCompare(b.code));
  const n = list.length;

  // Build adjacency clusters where pairwise distance < collisionThreshold
  const clusters: number[][] = [];
  const visited = new Set<number>();

  for (let i = 0; i < n; i++) {
    if (visited.has(i)) continue;
    const cluster = [i];
    visited.add(i);

    for (let j = 0; j < n; j++) {
      if (i === j || visited.has(j)) continue;
      const dist = Math.hypot(list[i].x - list[j].x, list[i].y - list[j].y);
      if (dist < collisionThreshold) {
        cluster.push(j);
        visited.add(j);
      }
    }
    clusters.push(cluster);
  }

  const result: PositionedCountryHighlight[] = new Array(n);

  for (const cluster of clusters) {
    if (cluster.length === 1) {
      const idx = cluster[0];
      result[idx] = { ...list[idx], dx: 0, dy: 0, isDisplaced: false };
      continue;
    }

    // Centroid of cluster
    let sumX = 0;
    let sumY = 0;
    for (const idx of cluster) {
      sumX += list[idx].x;
      sumY += list[idx].y;
    }
    const centroidX = sumX / cluster.length;
    const centroidY = sumY / cluster.length;

    // Distribute around centroid with radius R
    const count = cluster.length;
    const radius = 15 + Math.min(count, 5) * 3;

    for (let k = 0; k < count; k++) {
      const idx = cluster[k];
      const angle = (2 * Math.PI * k) / count - Math.PI / 2;
      const targetX = centroidX + radius * Math.cos(angle);
      const targetY = centroidY + radius * Math.sin(angle);

      // Clamp within map viewBox bounds [25, 775] x [25, 365]
      const clampedX = Math.max(25, Math.min(775, targetX));
      const clampedY = Math.max(25, Math.min(365, targetY));

      const dx = Math.round(clampedX - list[idx].x);
      const dy = Math.round(clampedY - list[idx].y);

      result[idx] = {
        ...list[idx],
        dx,
        dy,
        isDisplaced: Math.abs(dx) > 2 || Math.abs(dy) > 2,
      };
    }
  }

  return result;
}

export type NewsCategory = 'All' | 'Technology' | 'Politics' | 'Finance' | 'Science' | 'World';

/**
 * Deterministically classifies an article into a top-level category
 * based on headline and summary text. No fake or fabricated categories.
 */
export function classifyArticleCategory(title: string, summary?: string): NewsCategory {
  const text = `${title} ${summary || ''}`.toLowerCase();

  // Science & Health & Astronomy
  if (/\b(?:science|scientist|climate|carbon|physics|biology|cancer|medical|vaccine|disease|virus|health|astronomy|nasa|planet|telescope|exoplanet|space|satellite|fossil|species|ebola|epidemic)\b/i.test(text)) {
    return 'Science';
  }

  // Technology
  if (/\b(?:ai|artificial intelligence|robotics?|semiconductors?|chips?|software|cybersecurity|cyber|quantum|computing|tech|algorithm|nvidia|openai|microsoft|apple|google|crypto|blockchain|gadget|hardware)\b/i.test(text)) {
    return 'Technology';
  }

  // Politics & Defense
  if (/\b(?:election|parliament|congress|senate|minister|president|diplomat|treaty|bill|military|defense|pentagon|war|ceasefire|sanctions|court|judge|protest|government|regime|junta)\b/i.test(text)) {
    return 'Politics';
  }

  // Finance & Business
  if (/\b(?:economy|economic|market|stock|inflation|bank|banking|gdp|trade|tariff|fed|federal reserve|investor|shares|revenue|profit|imf|interest rate|currency|bonds|wall street)\b/i.test(text)) {
    return 'Finance';
  }

  return 'World';
}

/**
 * Format GDELT seendate or ISO date to relative time ("12m ago", "1h ago")
 */
export function formatTimeAgo(seendateStr: string): string {
  try {
    let date: Date;
    if (/^\d{8}T\d{6}Z$/.test(seendateStr)) {
      const year = parseInt(seendateStr.substring(0, 4), 10);
      const month = parseInt(seendateStr.substring(4, 6), 10) - 1;
      const day = parseInt(seendateStr.substring(6, 8), 10);
      const hour = parseInt(seendateStr.substring(9, 11), 10);
      const min = parseInt(seendateStr.substring(11, 13), 10);
      const sec = parseInt(seendateStr.substring(13, 15), 10);
      date = new Date(Date.UTC(year, month, day, hour, min, sec));
    } else {
      date = new Date(seendateStr);
    }

    if (isNaN(date.getTime())) return 'Recently';

    const now = Date.now();
    const diffMs = Math.max(0, now - date.getTime());
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return 'Recently';
  }
}

