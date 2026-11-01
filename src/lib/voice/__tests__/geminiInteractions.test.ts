import { describe, it, expect } from 'vitest';
import { POST } from '@/app/api/voice/stream/route';
import { NextRequest } from 'next/server';

describe('Gemini Interactions API Route & Ollama Fallback', () => {
  it('returns valid SSE stream metadata and tokens', async () => {
    const req = new NextRequest('http://localhost:3000/api/voice/stream', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'Namaste! Test request for unit test verification.' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    if (reader) {
      const decoder = new TextDecoder();
      let streamData = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamData += decoder.decode(value);
      }

      expect(streamData).toContain('event: metadata');
      expect(streamData).toContain('event: done');
      expect(streamData).toContain('sourceProvider');
    }
  });

  it('correctly detects OPEN_APP action for "open chrome"', async () => {
    const req = new NextRequest('http://localhost:3000/api/voice/stream', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'open chrome' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    if (reader) {
      const decoder = new TextDecoder();
      let streamData = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamData += decoder.decode(value);
      }

      expect(streamData).toContain('OPEN_APP');
      expect(streamData).toContain('chrome');
    }
  });

  it('correctly detects OPEN_APP action for "open application"', async () => {
    const req = new NextRequest('http://localhost:3000/api/voice/stream', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'open application' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    if (reader) {
      const decoder = new TextDecoder();
      let streamData = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamData += decoder.decode(value);
      }

      expect(streamData).toContain('OPEN_APP');
      expect(streamData).toContain('chrome');
    }
  });

  it('correctly detects OPEN_APP action for "kholo notepad"', async () => {
    const req = new NextRequest('http://localhost:3000/api/voice/stream', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'kholo notepad' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    if (reader) {
      const decoder = new TextDecoder();
      let streamData = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        streamData += decoder.decode(value);
      }

      expect(streamData).toContain('OPEN_APP');
      expect(streamData).toContain('notepad');
    }
  });
});
