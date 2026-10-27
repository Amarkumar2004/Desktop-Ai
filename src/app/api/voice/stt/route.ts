import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/voice/stt
 * Server-side Speech-to-Text (STT) transcription endpoint.
 * Supports OpenAI / Groq Whisper API integrations with graceful browser Web Speech STT fallback.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as Blob | File | null;
    const language = (formData.get('language') as string) || 'hi';

    if (!audioFile || audioFile.size === 0) {
      return NextResponse.json({ error: 'Audio file payload is required' }, { status: 400 });
    }

    const groqKey = process.env.GROQ_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const whisperBaseUrl = process.env.WHISPER_BASE_URL;

    // 1. Try Groq Whisper API (High speed, ultra low latency)
    if (groqKey && groqKey.trim().length > 5) {
      try {
        console.log(`[Whisper STT] Requesting Groq transcription for audio size: ${audioFile.size} bytes`);
        const whisperFormData = new FormData();
        whisperFormData.append('file', audioFile, 'speech.webm');
        whisperFormData.append('model', 'whisper-large-v3-turbo');
        whisperFormData.append('language', language.slice(0, 2));

        const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${groqKey.trim()}`,
          },
          body: whisperFormData,
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text) {
            console.log(`[Whisper STT] Groq transcription successful: "${data.text.slice(0, 40)}..."`);
            return NextResponse.json({ text: data.text, source: 'groq_whisper' });
          }
        }
      } catch (err: any) {
        console.warn(`[Whisper STT] Groq transcription attempt failed: ${err?.message || err}`);
      }
    }

    // 2. Try OpenAI Whisper API
    if (openaiKey && openaiKey.trim().length > 5) {
      try {
        console.log(`[Whisper STT] Requesting OpenAI transcription for audio size: ${audioFile.size} bytes`);
        const whisperFormData = new FormData();
        whisperFormData.append('file', audioFile, 'speech.webm');
        whisperFormData.append('model', 'whisper-1');
        whisperFormData.append('language', language.slice(0, 2));

        const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${openaiKey.trim()}`,
          },
          body: whisperFormData,
          signal: AbortSignal.timeout(10000),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text) {
            console.log(`[Whisper STT] OpenAI transcription successful: "${data.text.slice(0, 40)}..."`);
            return NextResponse.json({ text: data.text, source: 'openai_whisper' });
          }
        }
      } catch (err: any) {
        console.warn(`[Whisper STT] OpenAI transcription attempt failed: ${err?.message || err}`);
      }
    }

    // 3. Try Local Whisper Server (e.g. whisper.cpp / local whisper container)
    if (whisperBaseUrl) {
      try {
        console.log(`[Whisper STT] Requesting local Whisper transcription at ${whisperBaseUrl}`);
        const whisperFormData = new FormData();
        whisperFormData.append('file', audioFile, 'speech.webm');
        whisperFormData.append('language', language.slice(0, 2));

        const res = await fetch(`${whisperBaseUrl}/inference`, {
          method: 'POST',
          body: whisperFormData,
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.text) {
            return NextResponse.json({ text: data.text, source: 'local_whisper' });
          }
        }
      } catch (err: any) {
        console.warn(`[Whisper STT] Local Whisper transcription failed: ${err?.message || err}`);
      }
    }

    // 4. Return clean 200 response signaling browser Web Speech STT fallback
    return NextResponse.json({
      fallback: true,
      text: '',
      message: 'No external STT API key configured. Browser Web Speech STT fallback active.',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'STT processing failed';
    console.error('[Whisper STT] Error processing request:', errorMsg);
    return NextResponse.json({ error: errorMsg, fallback: true, text: '' }, { status: 500 });
  }
}
