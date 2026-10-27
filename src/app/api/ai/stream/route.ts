import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ProviderPayload {
  apiKey?: string;
  baseUrl?: string;
  selectedModel?: string;
}

interface StreamRequestBody {
  prompt?: string;
  systemPrompt?: string;
  history?: ChatMessage[];
  mode?: 'code' | 'chat' | 'voice';
  selectedModel?: string; // 'auto' or '${providerId}:${modelName}'
  userProviders?: Record<string, ProviderPayload>;
}

// System prompts tailored for SUSI AI Code Assistant & Chat
const DEFAULT_CODE_SYSTEM_PROMPT = `You are SUSI AI Code Assistant, an expert senior full-stack software engineer and UI architect.
The user's project stack is:
- Framework: Next.js 16 (App Router), React 19
- Styling: Tailwind CSS v4, Lucide React icons
- Architecture: Modular, accessible, clean, responsive, production-ready.

When asked to generate code:
1. Provide a brief 1-2 sentence architectural summary.
2. Provide clean, modern, fully functional code in markdown code blocks.
3. For multi-file implementations, prefix code blocks with file path comments (e.g., // File: components/Card.tsx).
4. Always prioritize React 19 best practices, Tailwind v4 utility classes, and avoid outdated packages.`;

const DEFAULT_CHAT_SYSTEM_PROMPT = `You are SUSI AI, an advanced, intelligent, and helpful autonomous AI assistant.
Respond clearly, concisely, and helpfully. Adapt to user language (English, Hindi, Hinglish, etc.).`;

/**
 * Resolves effective provider credentials from user request or server environment.
 */
function resolveCredentials(
  providerId: string,
  userProviders?: Record<string, ProviderPayload>
): { apiKey: string; baseUrl: string } {
  const user = userProviders?.[providerId] || {};

  switch (providerId) {
    case 'freellm':
      return {
        apiKey: (user.apiKey || process.env.FREELLM_API_KEY || 'free_demo_key').trim(),
        baseUrl: (user.baseUrl || process.env.FREELLM_BASE_URL || 'https://api.freellmmap.com/v1').replace(/\/+$/, ''),
      };
    case 'google_gemini':
      return {
        apiKey: (user.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim(),
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      };
    case 'anthropic':
      return {
        apiKey: (user.apiKey || process.env.ANTHROPIC_API_KEY || '').trim(),
        baseUrl: 'https://api.anthropic.com/v1',
      };
    case 'groq':
      return {
        apiKey: (user.apiKey || process.env.GROQ_API_KEY || '').trim(),
        baseUrl: 'https://api.groq.com/openai/v1',
      };
    case 'openai':
      return {
        apiKey: (user.apiKey || process.env.OPENAI_API_KEY || '').trim(),
        baseUrl: (user.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, ''),
      };
    case 'openrouter':
      return {
        apiKey: (user.apiKey || process.env.OPENROUTER_API_KEY || '').trim(),
        baseUrl: 'https://openrouter.ai/api/v1',
      };
    case 'custom_openai':
    default:
      return {
        apiKey: (user.apiKey || '').trim(),
        baseUrl: (user.baseUrl || 'http://localhost:11434/v1').replace(/\/+$/, ''),
      };
  }
}

/**
 * Streams response using OpenAI-compatible chat completions protocol.
 */
async function streamOpenAiCompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder
): Promise<boolean> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      stream: true,
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenAI-compatible endpoint returned status ${res.status}: ${errorText}`);
  }

  if (!res.body) {
    throw new Error('Response body is empty');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const dataStr = trimmed.replace(/^data:\s*/, '').trim();
      if (dataStr === '[DONE]') continue;

      try {
        const parsed = JSON.parse(dataStr);
        const token = parsed.choices?.[0]?.delta?.content || '';
        if (token) {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ token })}\n\n`)
          );
        }
      } catch {
        // Skip unparseable chunks
      }
    }
  }

  return true;
}

/**
 * Streams response using Google Gemini v1beta streamGenerateContent protocol.
 */
async function streamGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemInstruction: string,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder
): Promise<boolean> {
  if (!apiKey) {
    throw new Error('Gemini API key is required');
  }

  const cleanModel = model.replace(/^google_gemini:/, '') || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:streamGenerateContent?key=${apiKey}&alt=sse`;

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const payload: any = {
    contents,
    generationConfig: {
      temperature: 0.4,
    },
  };

  if (systemInstruction) {
    payload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API returned status ${res.status}: ${errorText}`);
  }

  if (!res.body) {
    throw new Error('Response body is empty');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const dataStr = trimmed.replace(/^data:\s*/, '').trim();
      try {
        const parsed = JSON.parse(dataStr);
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ token: text })}\n\n`)
          );
        }
      } catch {
        // Skip unparseable chunks
      }
    }
  }

  return true;
}

/**
 * Streams response using Anthropic Claude messages protocol.
 */
async function streamAnthropic(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  systemInstruction: string,
  writer: WritableStreamDefaultWriter<Uint8Array>,
  encoder: TextEncoder
): Promise<boolean> {
  if (!apiKey) {
    throw new Error('Anthropic API key is required');
  }

  const cleanModel = model.replace(/^anthropic:/, '') || 'claude-3-7-sonnet-latest';
  const url = 'https://api.anthropic.com/v1/messages';

  const nonSystemMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

  const payload: any = {
    model: cleanModel,
    messages: nonSystemMessages,
    max_tokens: 4096,
    temperature: 0.4,
    stream: true,
  };

  if (systemInstruction) {
    payload.system = systemInstruction;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API returned status ${res.status}: ${errorText}`);
  }

  if (!res.body) {
    throw new Error('Response body is empty');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) continue;

      const dataStr = trimmed.replace(/^data:\s*/, '').trim();
      try {
        const parsed = JSON.parse(dataStr);
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify({ token: parsed.delta.text })}\n\n`)
          );
        }
      } catch {
        // Skip unparseable chunks
      }
    }
  }

  return true;
}

export async function POST(req: NextRequest) {
  let body: StreamRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const prompt = (body.prompt || '').trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'Prompt is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const mode = body.mode || 'code';
  const systemPrompt =
    body.systemPrompt ||
    (mode === 'code' ? DEFAULT_CODE_SYSTEM_PROMPT : DEFAULT_CHAT_SYSTEM_PROMPT);

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...(body.history || []),
    { role: 'user', content: prompt },
  ];

  const selectedModel = body.selectedModel || 'auto';
  const userProviders = body.userProviders || {};

  // Build candidate provider execution list
  interface Candidate {
    providerId: string;
    model: string;
    label: string;
  }

  const candidates: Candidate[] = [];

  if (selectedModel !== 'auto' && selectedModel.includes(':')) {
    const [pId, ...mParts] = selectedModel.split(':');
    candidates.push({
      providerId: pId,
      model: mParts.join(':'),
      label: selectedModel,
    });
  } else {
    // Smart Auto-Pilot: order candidates based on mode and available keys
    if (userProviders['freellm']?.apiKey) {
      candidates.push({
        providerId: 'freellm',
        model: mode === 'code' ? 'claude-3-5-sonnet' : 'deepseek/deepseek-chat',
        label: 'FreeLLMMap Gateway',
      });
    }

    if (userProviders['anthropic']?.apiKey || process.env.ANTHROPIC_API_KEY) {
      candidates.push({
        providerId: 'anthropic',
        model: 'claude-3-7-sonnet-latest',
        label: 'Anthropic Claude',
      });
    }

    if (userProviders['google_gemini']?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
      candidates.push({
        providerId: 'google_gemini',
        model: 'gemini-2.0-flash',
        label: 'Google Gemini',
      });
    }

    if (userProviders['groq']?.apiKey || process.env.GROQ_API_KEY) {
      candidates.push({
        providerId: 'groq',
        model: 'llama-3.3-70b-versatile',
        label: 'Groq Llama 3.3',
      });
    }

    if (userProviders['openai']?.apiKey || process.env.OPENAI_API_KEY) {
      candidates.push({
        providerId: 'openai',
        model: 'gpt-4o',
        label: 'OpenAI GPT-4o',
      });
    }

    // Default fallback to Gemini or FreeLLMMap demo
    if (candidates.length === 0) {
      candidates.push({
        providerId: 'google_gemini',
        model: 'gemini-2.0-flash',
        label: 'Google Gemini (Default)',
      });
      candidates.push({
        providerId: 'freellm',
        model: 'deepseek/deepseek-chat',
        label: 'FreeLLMMap Gateway (Fallback)',
      });
    }
  }

  // Set up SSE Response stream
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Process candidates in background with automatic failover
  (async () => {
    let success = false;
    let lastError: any = null;

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const creds = resolveCredentials(candidate.providerId, userProviders);

      try {
        // Send meta info on candidate start
        await writer.write(
          encoder.encode(
            `data: ${JSON.stringify({
              meta: {
                provider: candidate.providerId,
                model: candidate.model,
                label: candidate.label,
                isFailover: i > 0,
              },
            })}\n\n`
          )
        );

        if (candidate.providerId === 'google_gemini') {
          await streamGemini(
            creds.apiKey,
            candidate.model,
            messages,
            systemPrompt,
            writer,
            encoder
          );
        } else if (candidate.providerId === 'anthropic') {
          await streamAnthropic(
            creds.apiKey,
            candidate.model,
            messages,
            systemPrompt,
            writer,
            encoder
          );
        } else {
          // FreeLLMMap, Groq, OpenAI, OpenRouter, Custom
          await streamOpenAiCompatible(
            creds.baseUrl,
            creds.apiKey,
            candidate.model,
            messages,
            writer,
            encoder
          );
        }

        success = true;
        break; // Successfully streamed!
      } catch (err: any) {
        lastError = err;
        console.warn(
          `[AI Stream] Candidate ${candidate.label} failed: ${err?.message || err}. Attempting failover...`
        );
        if (i < candidates.length - 1) {
          const nextCandidate = candidates[i + 1];
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({
                status: `Primary model unavailable. Auto-switching to ${nextCandidate.label}...`,
              })}\n\n`
            )
          );
        }
      }
    }

    if (!success) {
      // If all candidates failed, emit safe fallback message
      const fallbackNotice = `// [SUSI AI Note: Live model endpoints are currently unreachable or rate-limited: ${lastError?.message || 'Upstream timeout'}]
// Fallback demonstration code generated safely:
export default function PreviewComponent() {
  return (
    <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-sm text-stone-800">
      <h2 className="text-base font-bold text-stone-900 mb-2">Request Processed</h2>
      <p className="text-xs text-stone-500 mb-4">${prompt.replace(/"/g, '&quot;')}</p>
      <div className="text-xs font-mono bg-stone-50 p-3 rounded-lg border border-stone-100">
        Status: Add your FreeLLMMap or Gemini API key in Settings → AI Providers to enable continuous streaming.
      </div>
    </div>
  );
}`;
      await writer.write(
        encoder.encode(`data: ${JSON.stringify({ token: fallbackNotice })}\n\n`)
      );
    }

    // Done signal
    await writer.write(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
    await writer.close();
  })();

  return new Response(responseStream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
