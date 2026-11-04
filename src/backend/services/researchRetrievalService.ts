/**
 * SPY research retrieval from independent, fixed public sources.
 * Sources are fetched concurrently; unavailable sources never produce fabricated citations.
 */
export interface RetrievedSource {
  title: string;
  url: string;
  snippet: string;
  sourceType: 'web' | 'documentation' | 'local_reference';
}

export interface ResearchRetrievalResult {
  toolStatus: 'retrieved' | 'unavailable' | 'no_results';
  query: string;
  sources: RetrievedSource[];
  retrievedAt: string;
  diagnosticNotes?: string;
  error?: string;
}

type SearchOutcome = { source: RetrievedSource[]; provider: string };

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchWithTimeout(url: string, signal?: AbortSignal): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    return await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        Accept: 'application/json, text/html;q=0.9',
        'User-Agent': 'SUSI-AI-Research/1.0',
      },
      cache: 'no-store',
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export class ResearchRetrievalService {
  async retrieveEvidence(
    query: string,
    options: { signal?: AbortSignal; maxResults?: number } = {}
  ): Promise<ResearchRetrievalResult> {
    const trimmed = query.trim();
    const maxResults = Math.min(10, Math.max(1, options.maxResults ?? 5));
    const retrievedAt = () => new Date().toISOString();

    if (!trimmed) {
      return { toolStatus: 'no_results', query: '', sources: [], retrievedAt: retrievedAt(), diagnosticNotes: 'Empty search query.' };
    }

    const providers: Array<() => Promise<SearchOutcome>> = [
      async () => {
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(trimmed)}&sort=stars&per_page=${maxResults}`;
        const response = await fetchWithTimeout(url, options.signal);
        if (!response.ok) throw new Error(`GitHub Search HTTP ${response.status}`);
        const data = await response.json();
        const items = Array.isArray(data.items) ? data.items : [];
        return {
          provider: 'GitHub',
          source: items.map((item: { full_name?: string; html_url?: string; description?: string }) => ({
            title: String(item.full_name || 'GitHub repository'),
            url: String(item.html_url || ''),
            snippet: String(item.description || 'No repository description supplied.'),
            sourceType: 'documentation' as const,
          })).filter((item: RetrievedSource) => item.url.startsWith('https://github.com/')).slice(0, maxResults),
        };
      },
      async () => {
        const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(trimmed)}&format=json&utf8=1&srlimit=${maxResults}`;
        const response = await fetchWithTimeout(url, options.signal);
        if (!response.ok) throw new Error(`Wikipedia Search HTTP ${response.status}`);
        const data = await response.json();
        const items = Array.isArray(data?.query?.search) ? data.query.search : [];
        return {
          provider: 'Wikipedia',
          source: items.map((item: { title?: string; snippet?: string }) => {
            const title = String(item.title || 'Wikipedia reference');
            return {
              title,
              url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
              snippet: decodeHtml(String(item.snippet || '')),
              sourceType: 'web' as const,
            };
          }),
        };
      },
      async () => {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(trimmed)}`;
        const response = await fetchWithTimeout(url, options.signal);
        if (!response.ok) throw new Error(`DuckDuckGo Search HTTP ${response.status}`);
        const html = await response.text();
        const results: RetrievedSource[] = [];
        const pattern = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(html)) && results.length < maxResults) {
          let href = match[1].replace(/&amp;/g, '&');
          try {
            const parsed = new URL(href, 'https://duckduckgo.com');
            const redirected = parsed.searchParams.get('uddg');
            if (redirected) href = decodeURIComponent(redirected);
            const target = new URL(href);
            if (target.protocol !== 'https:') continue;
          } catch { continue; }
          results.push({
            title: decodeHtml(match[2]),
            url: href,
            snippet: decodeHtml(match[3]),
            sourceType: 'web',
          });
        }
        return { provider: 'DuckDuckGo', source: results };
      },
    ];

    const outcomes = await Promise.allSettled(providers.map((provider) => provider()));
    const sources: RetrievedSource[] = [];
    const successfulProviders: string[] = [];
    const errors: string[] = [];

    for (const outcome of outcomes) {
      if (outcome.status === 'fulfilled') {
        successfulProviders.push(outcome.value.provider);
        sources.push(...outcome.value.source);
      } else {
        errors.push(outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason));
      }
    }

    const unique = new Map<string, RetrievedSource>();
    for (const source of sources) {
      if (!source.url || !source.title) continue;
      if (!unique.has(source.url)) unique.set(source.url, source);
    }
    const finalSources = [...unique.values()].slice(0, maxResults);

    if (finalSources.length) {
      return {
        toolStatus: 'retrieved',
        query: trimmed,
        sources: finalSources,
        retrievedAt: retrievedAt(),
        diagnosticNotes: `Retrieved ${finalSources.length} source(s) from: ${successfulProviders.join(', ')}.`,
      };
    }

    const allUnavailable = successfulProviders.length === 0;
    return {
      toolStatus: allUnavailable ? 'unavailable' : 'no_results',
      query: trimmed,
      sources: [],
      retrievedAt: retrievedAt(),
      error: allUnavailable ? errors.join('; ').slice(0, 500) : undefined,
      diagnosticNotes: allUnavailable
        ? `All configured public research sources were unavailable: ${errors.join('; ').slice(0, 500)}`
        : `No results were returned by available sources: ${successfulProviders.join(', ')}.`,
    };
  }
}

export const researchRetrievalService = new ResearchRetrievalService();
