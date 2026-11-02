/**
 * SUSI AI — Research Retrieval Service for SPY
 *
 * Provides genuine web search and technical documentation retrieval.
 * - Queries verifiable external search APIs (e.g. Wikipedia Search API, DuckDuckGo)
 * - Returns authentic source URLs, titles, and evidence snippets
 * - Never hallucinates or fabricates fake sources or citations
 * - Reports tool unavailability honestly if network or search provider is unresponsive
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

export class ResearchRetrievalService {
  /**
   * Executes genuine technical search and retrieval for SPY.
   */
  async retrieveEvidence(
    query: string,
    options: { signal?: AbortSignal; maxResults?: number } = {}
  ): Promise<ResearchRetrievalResult> {
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        toolStatus: 'no_results',
        query: '',
        sources: [],
        retrievedAt: new Date().toISOString(),
        diagnosticNotes: 'Empty search query provided.',
      };
    }

    const maxResults = options.maxResults || 5;

    try {
      // 1. Attempt genuine Wikipedia technical article search
      const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        trimmed
      )}&format=json&utf8=1&srlimit=${maxResults}`;

      const res = await fetch(wikiUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'SUSI-AI-Desktop/2.1 (contact@susi.ai) TechnicalResearchBot/1.0',
          Accept: 'application/json',
        },
        signal: options.signal,
      });

      if (!res.ok) {
        throw new Error(`Upstream retrieval API HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      const searchItems = data?.query?.search || [];

      if (searchItems.length === 0) {
        return {
          toolStatus: 'no_results',
          query: trimmed,
          sources: [],
          retrievedAt: new Date().toISOString(),
          diagnosticNotes: `Search query "${trimmed}" returned 0 verified results from technical retrieval source.`,
        };
      }

      const sources: RetrievedSource[] = searchItems.map((item: { title?: string; snippet?: string }) => {
        // Strip HTML tags from snippet
        const cleanSnippet = String(item.snippet || '')
          .replace(/<span class="searchmatch">/gi, '')
          .replace(/<\/span>/gi, '')
          .replace(/<[^>]+>/g, '')
          .trim();

        return {
          title: String(item.title || 'Untitled Reference'),
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(
            String(item.title).replace(/\s+/g, '_')
          )}`,
          snippet: cleanSnippet,
          sourceType: 'web',
        };
      });

      return {
        toolStatus: 'retrieved',
        query: trimmed,
        sources,
        retrievedAt: new Date().toISOString(),
        diagnosticNotes: `Retrieved ${sources.length} verified technical source(s) from upstream reference index.`,
      };
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        toolStatus: 'unavailable',
        query: trimmed,
        sources: [],
        retrievedAt: new Date().toISOString(),
        error: errorMsg,
        diagnosticNotes: `External research retrieval tool is currently unavailable: ${errorMsg}. Model must not fabricate artificial citations.`,
      };
    }
  }
}

export const researchRetrievalService = new ResearchRetrievalService();
