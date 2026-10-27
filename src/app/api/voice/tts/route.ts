import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/voice/tts
 * Server-side ElevenLabs Text-to-Speech API integration with browser fallback.
 * Securely reads ELEVENLABS_API_KEY without exposing it to client JavaScript.
 */
export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const text = (body.text || '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Text parameter is required' }, { status: 400 });
    }

    const rawApiKey = process.env.ELEVENLABS_API_KEY || '';
    const apiKey = rawApiKey.trim();
    const hasKey = apiKey.length > 5;
    const isPlaceholder = !hasKey || apiKey.includes('YOUR_') || apiKey.includes('your_') || apiKey.includes('xxx');

    // Safe diagnostics: never print key value or secret headers
    console.log(`[ElevenLabs TTS] Key check: exists=${hasKey}, isPlaceholder=${isPlaceholder}, length=${apiKey.length}`);

    const requestedVoice = (body.voiceId || body.voice || '').trim();
    const configuredVoiceId = (process.env.ELEVENLABS_VOICE_ID || 'sTuFDs5r9KT8f6JSiJbq').trim();
    const voiceId = (requestedVoice && requestedVoice.length > 5 && !requestedVoice.includes('kalpana'))
      ? requestedVoice
      : configuredVoiceId;

    if (hasKey && !isPlaceholder) {
      const voiceCandidates = [voiceId];
      // Fallback premade voice for free plans if configured library voice requires paid plan
      if (voiceId !== 'EXAVITQu4vr4xnSDxMaL') {
        voiceCandidates.push('EXAVITQu4vr4xnSDxMaL');
      }

      let lastErrorText = '';

      for (const currentVoice of voiceCandidates) {
        try {
          console.log(`[ElevenLabs TTS] Requesting speech synthesis for voiceId "${currentVoice}" (text length: ${text.length})`);
          const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${currentVoice}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'xi-api-key': apiKey,
              Accept: 'audio/mpeg',
            },
            body: JSON.stringify({
              text,
              model_id: 'eleven_multilingual_v2',
              voice_settings: {
                stability: 0.5,
                similarity_boost: 0.75,
              },
            }),
            signal: AbortSignal.timeout(15000),
          });

          if (response.ok) {
            const audioArrayBuffer = await response.arrayBuffer();
            if (audioArrayBuffer.byteLength > 0) {
              console.log(`[ElevenLabs TTS] Successfully synthesized ${audioArrayBuffer.byteLength} bytes of audio using voice "${currentVoice}".`);
              return new Response(audioArrayBuffer, {
                headers: {
                  'Content-Type': 'audio/mpeg',
                  'Cache-Control': 'no-cache',
                },
              });
            }
          } else {
            lastErrorText = await response.text();
            console.warn(`[ElevenLabs TTS] API returned status ${response.status} for voice "${currentVoice}": ${lastErrorText.slice(0, 150)}`);
            // If error is paid plan requirement (402), try fallback premade voice in loop
            if (response.status !== 402) {
              break;
            }
          }
        } catch (err: any) {
          lastErrorText = err?.message || 'Network request failed';
          console.warn(`[ElevenLabs TTS] Request failed for voice "${currentVoice}": ${lastErrorText}`);
        }
      }

      return NextResponse.json({
        fallback: true,
        message: `ElevenLabs synthesis failed: ${lastErrorText.slice(0, 120)}. Using browser SpeechSynthesis fallback.`,
      });
    }

    // Return JSON indicating browser SpeechSynthesis fallback should be used if key is missing/placeholder
    return NextResponse.json({
      fallback: true,
      message: 'ELEVENLABS_API_KEY environment variable is missing or invalid. Using browser SpeechSynthesis fallback.',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'TTS synthesis failed';
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
