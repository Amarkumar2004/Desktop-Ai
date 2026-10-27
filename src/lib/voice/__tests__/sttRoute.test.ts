import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/voice/stt/route';
import { NextRequest } from 'next/server';

describe('/api/voice/stt Route Handler', () => {
  it('returns status 400 when no audio payload is provided', async () => {
    const formData = new FormData();
    const req = new NextRequest('http://localhost:3000/api/voice/stt', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toContain('Audio file payload is required');
  });

  it('returns status 200 with fallback indicator when audio blob is provided', async () => {
    const formData = new FormData();
    const audioBlob = new Blob(['sample audio stream'], { type: 'audio/webm' });
    formData.append('audio', audioBlob, 'speech.webm');
    formData.append('language', 'hi-IN');

    const req = new NextRequest('http://localhost:3000/api/voice/stt', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.fallback).toBe(true);
    expect(body.text).toBe('');
  });
});
