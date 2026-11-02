/**
 * SUSI AI — Multi-Agent AI Provider Service
 *
 * Provides robust inference execution for SUSI, SPY, EURO, and LEX agents.
 * Connects to configured AI providers (Gemini, OpenAI, Anthropic, Groq, OpenRouter, Ollama)
 * without hardcoded fake success. Fails closed with honest provider diagnostics if all fail.
 */

export interface AiInferenceOptions {
  systemPrompt?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  preferredProvider?: 'google_gemini' | 'openai' | 'anthropic' | 'groq' | 'openrouter' | 'ollama' | 'auto';
  modelOverride?: string;
}

export interface AiInferenceResult {
  text: string;
  provider: string;
  model: string;
  tokensUsed?: number;
}

interface ProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  baseUrl: string;
  defaultModel: string;
}

/**
 * Resolves active provider configurations from server environment variables.
 */
export function getAvailableProviders(): ProviderConfig[] {
  const providers: ProviderConfig[] = [];

  // 1. Google Gemini
  const geminiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  if (geminiKey) {
    providers.push({
      id: 'google_gemini',
      name: 'Google Gemini',
      apiKey: geminiKey,
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      defaultModel: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
    });
  }

  // 2. Groq (High-speed Llama / Mixtral inference)
  const groqKey = (process.env.GROQ_API_KEY || '').trim();
  if (groqKey) {
    providers.push({
      id: 'groq',
      name: 'Groq Cloud',
      apiKey: groqKey,
      baseUrl: 'https://api.groq.com/openai/v1',
      defaultModel: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
    });
  }

  // 3. OpenAI
  const openaiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (openaiKey) {
    providers.push({
      id: 'openai',
      name: 'OpenAI',
      apiKey: openaiKey,
      baseUrl: (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    });
  }

  // 4. Anthropic
  const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  if (anthropicKey) {
    providers.push({
      id: 'anthropic',
      name: 'Anthropic',
      apiKey: anthropicKey,
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022',
    });
  }

  // 5. OpenRouter
  const openrouterKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (openrouterKey) {
    providers.push({
      id: 'openrouter',
      name: 'OpenRouter',
      apiKey: openrouterKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct',
    });
  }

  // 6. Local Ollama (Always check if available locally)
  const ollamaBase = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/+$/, '');
  providers.push({
    id: 'ollama',
    name: 'Local Ollama',
    baseUrl: `${ollamaBase}/v1`,
    defaultModel: process.env.OLLAMA_MODEL || 'llama3:latest',
  });

  return providers;
}

/**
 * Calls OpenAI-compatible chat completions endpoint with timeout and abort support.
 */
async function callOpenAiCompatible(
  provider: ProviderConfig,
  model: string,
  systemPrompt: string | undefined,
  userPrompt: string,
  temperature: number,
  signal?: AbortSignal
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (provider.apiKey) {
    headers['Authorization'] = `Bearer ${provider.apiKey}`;
  }

  const messages: { role: 'system' | 'user'; content: string }[] = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: userPrompt });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000); // 25s per provider call

  const combinedSignal = signal
    ? anySignal([signal, controller.signal])
    : controller.signal;

  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: false,
      }),
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`[${provider.name}] HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error(`[${provider.name}] Returned empty content`);
    }
    return content.trim();
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Calls Google Gemini REST generateContent endpoint.
 */
async function callGemini(
  provider: ProviderConfig,
  model: string,
  systemPrompt: string | undefined,
  userPrompt: string,
  temperature: number,
  signal?: AbortSignal
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  const combinedSignal = signal
    ? anySignal([signal, controller.signal])
    : controller.signal;

  try {
    const cleanModel = model.replace(/^models\//, '');
    const url = `${provider.baseUrl}/models/${cleanModel}:generateContent?key=${provider.apiKey}`;

    const body: Record<string, unknown> = {
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature,
      },
    };

    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText);
      throw new Error(`[Google Gemini] HTTP ${res.status}: ${errText.slice(0, 300)}`);
    }

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const text = candidate?.content?.parts?.map((p: { text?: string }) => p.text || '').join('');
    if (!text || !text.trim()) {
      throw new Error(`[Google Gemini] Empty candidate parts response`);
    }
    return text.trim();
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    throw err;
  }
}

/**
 * Combines multiple AbortSignals safely.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const s of signals) {
    if (s.aborted) {
      controller.abort();
      return controller.signal;
    }
    s.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller.signal;
}

/**
 * Executes an AI completion request across configured providers with sequential fallback.
 * Strictly avoids fake success. Throws explicit diagnostic error if all providers fail.
 */
export async function executeAiInference(options: AiInferenceOptions): Promise<AiInferenceResult> {
  const allProviders = getAvailableProviders();
  const errors: string[] = [];

  // Filter or prioritize providers based on preferredProvider option
  const candidates = [...allProviders];
  if (options.preferredProvider && options.preferredProvider !== 'auto') {
    candidates.sort((a, b) => {
      if (a.id === options.preferredProvider) return -1;
      if (b.id === options.preferredProvider) return 1;
      return 0;
    });
  }

  for (const provider of candidates) {
    if (options.signal?.aborted) {
      throw new Error('AI inference cancelled by client');
    }

    // Skip cloud providers with missing API keys
    if (provider.id !== 'ollama' && !provider.apiKey) {
      continue;
    }

    const model = options.modelOverride || provider.defaultModel;
    const temp = options.temperature ?? 0.3;

    try {
      let resultText: string;
      if (provider.id === 'google_gemini') {
        resultText = await callGemini(
          provider,
          model,
          options.systemPrompt,
          options.prompt,
          temp,
          options.signal
        );
      } else {
        resultText = await callOpenAiCompatible(
          provider,
          model,
          options.systemPrompt,
          options.prompt,
          temp,
          options.signal
        );
      }

      return {
        text: resultText,
        provider: provider.id,
        model,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`[${provider.name}] ${msg}`);
      // Continue to next configured candidate
    }
  }

  throw new Error(
    `All configured AI providers failed for multi-agent inference:\n${errors.join('\n')}\n` +
    `Please configure an API key for Google Gemini, Groq, or OpenAI in Settings, or run local Ollama.`
  );
}
