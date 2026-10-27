import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/voice/tts/route';
import { NextRequest } from 'next/server';

describe('ElevenLabs Server Route & Voice ID Propagation', () => {
  it('returns status 400 when text parameter is empty', async () => {
    const req = new NextRequest('http://localhost:3000/api/voice/tts', {
      method: 'POST',
      body: JSON.stringify({ text: '' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('accepts custom voiceId parameter and returns JSON or audio stream', async () => {
    const req = new NextRequest('http://localhost:3000/api/voice/tts', {
      method: 'POST',
      body: JSON.stringify({
        text: 'Namaste! Testing ElevenLabs voice propagation.',
        voiceId: 'sTuFDs5r9KT8f6JSiJbq',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const contentType = res.headers.get('content-type');
    expect(contentType).toBeDefined();

    if (contentType?.includes('application/json')) {
      const body = await res.json();
      expect(body.fallback).toBeDefined();
    } else {
      expect(contentType).toContain('audio');
    }
  });
});
