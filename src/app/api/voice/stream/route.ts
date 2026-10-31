import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Sanitize sensitive strings (e.g. API keys) from log messages and responses
function sanitizeKey(msg: string, key?: string): string {
  let clean = msg || '';
  if (key) {
    clean = clean.split(key).join('***KEY_HIDDEN***');
  }
  clean = clean.replace(/key=[A-Za-z0-9_\-]+/g, 'key=***KEY_HIDDEN***');
  return clean;
}

// Clean command prefixes to extract pure task titles
function cleanTaskTitle(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(
    /^(?:please\s+|kripya\s+|bhai\s+|susi\s+|lex\s+|ek\s+)*(?:create(?:\s+a|\s+new)?\s+task|add(?:\s+a|\s+new)?\s+task|naya\s+task\s+banao|task\s+banao|task\s+likho|task\s+add\s+karo|task:?)\s*(?:named|for|called|ki|ko|ke\s+liye|hoga|bhi)?\s*[:\-]?\s*/i,
    ''
  );
  cleaned = cleaned.replace(/\s*(?:banao|add\s+karo|kar\s+do|please|likh\s+lo|kr\s+do)$/i, '').trim();
  return cleaned || 'Autonomous Task';
}

function extractFilename(text: string): string {
  const fileMatch = text.match(/([a-zA-Z0-9_\-]+\.(?:tsx|ts|jsx|js|html|css|json|py|md|sql))/i);
  if (fileMatch && fileMatch[1]) return fileMatch[1];
  const words = text.split(/\s+/);
  const candidate = words.find((w) => w.includes('.'));
  if (candidate) return candidate.replace(/[^a-zA-Z0-9._-]/g, '');
  return 'component.tsx';
}

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash-exp',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

async function tryOllamaFallback(prompt: string, history: any[], sendEvent: any): Promise<boolean> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  try {
    const tagsRes = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!tagsRes.ok) return false;
    const tagsData = await tagsRes.json();
    const models = tagsData.models || [];
    if (models.length === 0) return false;

    const configuredModel = process.env.OLLAMA_MODEL;
    const preferredModel = (configuredModel && models.some((m: any) => m.name.includes(configuredModel)))
      ? models.find((m: any) => m.name.includes(configuredModel))?.name
      : models.find((m: any) => 
          m.name.includes('qwen') || m.name.includes('llama') || m.name.includes('mistral')
        )?.name || models[0].name;

    console.log(`[Ollama AI] Dispatching local inference request to model: ${preferredModel}`);

    const chatRes = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: preferredModel,
        messages: [
          ...history.slice(-4).map((m: any) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content,
          })),
          {
            role: 'user',
            content: `You are SUSI, a warm, super-friendly conversational AI desktop assistant. User query: "${prompt}". Reply naturally in 1-2 spoken sentences (Hindi/English/Hinglish).`,
          },
        ],
        stream: true,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!chatRes.ok || !chatRes.body) return false;

    const reader = chatRes.body.getReader();
    const decoder = new TextDecoder();
    let fullReply = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line.trim());
          const token = parsed.message?.content || parsed.response || '';
          if (token) {
            fullReply += token;
            sendEvent('token', { token });
          }
        } catch {}
      }
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        const token = parsed.message?.content || parsed.response || '';
        if (token) {
          fullReply += token;
          sendEvent('token', { token });
        }
      } catch {}
    }

    if (fullReply.trim()) {
      console.log(`[Ollama AI] Completed successfully. Length: ${fullReply.length}`);
      sendEvent('done', {
        fullReply,
        sourceProvider: 'ollama',
        modelName: `Ollama (${preferredModel})`,
        modeUsed: 'offline',
      });
      return true;
    }
  } catch (err: any) {
    console.warn(`[Ollama AI] Local fallback failed: ${err?.message || err}`);
  }
  return false;
}

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400 });
  }

  const prompt = (body.prompt || '').trim();
  const history: Array<{ role: string; content: string }> = Array.isArray(body.history) ? body.history : [];
  const lower = prompt.toLowerCase();

  // Extract tools & actions
  let action: any = { type: 'CHAT_REPLY' };
  let assignedAgent: 'LEX' | 'SUSI' | 'SPY' | 'YORU' = 'SUSI';

  if (
    lower.includes('task') &&
    (lower.includes('create') || lower.includes('add') || lower.includes('banao') || lower.includes('likho') || lower.includes('naya'))
  ) {
    const taskTitle = cleanTaskTitle(prompt);
    assignedAgent = 'SUSI';
    action = {
      type: 'CREATE_TASK',
      payload: {
        title: taskTitle.charAt(0).toUpperCase() + taskTitle.slice(1),
        priority: lower.includes('urgent') || lower.includes('critical') ? 'Critical' : 'High',
        agent: 'SUSI',
      },
    };
  } else if ((lower.includes('file') || lower.includes('component')) && (lower.includes('create') || lower.includes('banao') || lower.includes('make'))) {
    const filename = extractFilename(prompt);
    assignedAgent = 'YORU';
    action = {
      type: 'CREATE_FILE',
      payload: {
        filename,
        content: `// Autonomously created by SUSI AI\nexport default function Module() {\n  return <div>${filename} Ready</div>;\n}\n`,
      },
    };
  } else if (lower.includes('code') && (lower.includes('tab') || lower.includes('kholo') || lower.includes('open'))) {
    assignedAgent = 'YORU';
    action = { type: 'NAVIGATE_TAB', payload: { tab: 'code' } };
  } else if (lower.includes('task') && (lower.includes('tab') || lower.includes('kholo') || lower.includes('open') || lower.includes('board'))) {
    assignedAgent = 'SUSI';
    action = { type: 'NAVIGATE_TAB', payload: { tab: 'tasks' } };
  } else if (lower.includes('agent') && (lower.includes('tab') || lower.includes('kholo') || lower.includes('open'))) {
    assignedAgent = 'LEX';
    action = { type: 'NAVIGATE_TAB', payload: { tab: 'agents' } };
  } else if (lower.includes('telemetry') || lower.includes('system') || lower.includes('cpu')) {
    assignedAgent = 'LEX';
    action = { type: 'SYSTEM_INFO', payload: { cpu: 28, memory: 52, uptime: '2d 14h' } };
  }

  const stream = new ReadableStream({
    async start(controller) {
      let isClosed = false;

      const sendEvent = (type: string, data: any) => {
        if (isClosed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch (err: any) {
          isClosed = true;
          console.warn(`[AI Router] Send event skipped (${type}): ${err?.message || err}`);
        }
      };

      const closeController = () => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.close();
        } catch (err: any) {
          console.warn(`[AI Router] Controller close skipped: ${err?.message || err}`);
        }
      };

      // Emit metadata first
      sendEvent('metadata', {
        assignedAgent,
        action,
        timestamp: new Date().toISOString(),
      });

      // -----------------------------------------------------------------------
      // STREAM DIRECTLY VIA GOOGLE GEMINI API (gemini-3.5-flash & gemini-3.8-flash)
      // -----------------------------------------------------------------------
      const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || body.apiKey;
      const isValidKey = Boolean(geminiKey && geminiKey.trim().length > 5);

      if (isValidKey) {
        console.log(`[Gemini API] Requesting Gemini for prompt: "${prompt.slice(0, 50)}..."`);
        const candidateModels = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash'];
        const historyText = history
          .slice(-4)
          .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
          .join('\n');
        const fullPrompt = `System: You are SUSI, a warm, super-friendly conversational AI desktop assistant. Reply naturally in 1-2 spoken sentences (Hindi/English/Hinglish). Do not use asterisks or markdown formatting. Keep it concise for voice.\n${
          historyText ? `History:\n${historyText}\n` : ''
        }User Query: ${prompt}`;

        for (const model of candidateModels) {
          try {
            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [
                    {
                      parts: [{ text: fullPrompt }],
                    },
                  ],
                }),
                signal: AbortSignal.timeout(15000),
              }
            );

            console.log(`[Gemini API] Response status (${model}): ${geminiRes.status}`);

            if (geminiRes.ok) {
              const resData = await geminiRes.json();
              const replyText =
                resData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

              if (replyText) {
                console.log(`[Gemini API] Received reply (${replyText.length} chars) from ${model}. Streaming to voice engine...`);
                // Stream words as tokens for natural typing & speech synthesis
                const words = replyText.split(' ');
                for (let i = 0; i < words.length; i++) {
                  const token = (i === 0 ? '' : ' ') + words[i];
                  sendEvent('token', { token });
                }

                sendEvent('done', {
                  fullReply: replyText,
                  sourceProvider: 'gemini',
                  modelName: `Google Gemini (${model})`,
                  modeUsed: 'online',
                });
                closeController();
                return;
              }
            } else {
              const errText = await geminiRes.text();
              console.warn(
                `[Gemini API] ${model} returned status ${geminiRes.status}: ${sanitizeKey(
                  errText,
                  geminiKey
                )}`
              );
            }
          } catch (err: any) {
            console.warn(
              `[Gemini API] ${model} request failed: ${sanitizeKey(
                err?.message || '',
                geminiKey
              )}`
            );
          }
        }
      }

      // -----------------------------------------------------------------------
      // FALLBACK TO LOCAL OLLAMA INFERENCE IF GEMINI IS UNAVAILABLE
      // -----------------------------------------------------------------------
      console.log('[AI Router] Gemini unavailable or key missing. Attempting Ollama local LLM fallback...');
      const ollamaSuccess = await tryOllamaFallback(prompt, history, sendEvent);
      if (ollamaSuccess) {
        closeController();
        return;
      }

      // Fallback message if providers are temporarily inactive
      const fallbackText = isValidKey
        ? `Haan ji, maine "${prompt}" sun liya hai. Cloud server par momentary load tha, kripya ek baar dobara boliye!`
        : `Haan ji, maine "${prompt}" sun liya hai. Gemini API key add karte hi ya Ollama start hote hi full AI active ho jayega!`;
      sendEvent('token', { token: fallbackText });
      sendEvent('done', {
        fullReply: fallbackText,
        sourceProvider: 'local_smart',
        modelName: 'SUSI System Assistant',
        modeUsed: 'offline',
      });
      closeController();
    },
    cancel() {
      // Client disconnect / stream abort handler
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}


