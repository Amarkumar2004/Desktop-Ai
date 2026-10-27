import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceEngine } from '../VoiceEngine';
import { SpeechToText } from '../SpeechToText';

class MockAudioContext {
  state = 'running';
  createMediaStreamSource() {
    return { connect: vi.fn(), disconnect: vi.fn() };
  }
  createAnalyser() {
    return { connect: vi.fn(), disconnect: vi.fn(), fftSize: 512, smoothingTimeConstant: 0.3 };
  }
  resume() {
    return Promise.resolve();
  }
}

describe('Voice Assistant Lifecycle & Mic Toggle Safeguards', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('window', {
      AudioContext: MockAudioContext,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('1. ON -> OFF: sets micEnabled = false and stops STT & VAD', async () => {
    const engine = new VoiceEngine();
    expect(engine.isMicEnabled()).toBe(false);

    const stt = (engine as any).stt as SpeechToText;
    vi.spyOn(stt, 'startListening').mockResolvedValue(undefined as any);
    vi.spyOn(stt, 'stopListening').mockResolvedValue('Hello SUSI');

    // Turn ON
    await engine.startListening();
    expect(engine.isMicEnabled()).toBe(true);
    expect(engine.getState()).toBe('listening');

    // Turn OFF
    await engine.stopListening();
    expect(engine.isMicEnabled()).toBe(false);
    expect(engine.getState()).toBe('idle');
  });

  it('2. ON -> OFF -> wait 10 seconds: no automatic listening or restart occurs', async () => {
    const engine = new VoiceEngine();
    const stt = (engine as any).stt as SpeechToText;
    vi.spyOn(stt, 'startListening').mockResolvedValue(undefined as any);
    vi.spyOn(stt, 'stopListening').mockResolvedValue('');

    await engine.startListening();
    await engine.stopListening();

    expect(engine.isMicEnabled()).toBe(false);
    expect(engine.getState()).toBe('idle');

    // Advance 10 seconds
    vi.advanceTimersByTime(10000);

    // Should remain OFF and idle
    expect(engine.isMicEnabled()).toBe(false);
    expect(engine.getState()).toBe('idle');
  });

  it('3. Deduplicates repeated final transcript submissions within 3 seconds', async () => {
    const engine = new VoiceEngine();
    vi.spyOn((engine as any).router, 'routeIntent').mockResolvedValue({
      isLocal: false,
      confidence: 1,
      type: 'chat',
      rawPrompt: 'test',
    });
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('event: token\ndata: {"token":"Haan "}\n\n'));
          controller.close();
        }
      });
      return new Response(stream, { status: 200 });
    }));

    // First processing call
    const res1 = await engine.processCommandStreaming('Namaste aap kaise hain');
    expect(res1).not.toBeNull();

    // Immediate duplicate call within 3s
    const res2 = await engine.processCommandStreaming('Namaste aap kaise hain');
    expect(res2).toBeNull();
  });

  it('4. ON -> OFF -> ON: creates fresh session and invalidates previous session callbacks', async () => {
    const stt = new SpeechToText();
    expect(stt.isMicEnabled()).toBe(false);

    // Start session 1
    const p1 = stt.startListening().catch(() => {});
    expect(stt.isMicEnabled()).toBe(true);

    // Stop session 1
    await stt.stopListening();
    expect(stt.isMicEnabled()).toBe(false);

    // Start session 2
    stt.startListening().catch(() => {});
    expect(stt.isMicEnabled()).toBe(true);

    stt.cleanup();
    expect(stt.isMicEnabled()).toBe(false);
  });

  it('5. OFF while speaking: prevents microphone auto-restart after playback completes', () => {
    const engine = new VoiceEngine();
    const audioQueue = (engine as any).audioQueue;

    // Simulate speaking state with mic OFF
    (engine as any).setState('speaking');
    (engine as any).micEnabled = false;

    // Trigger queue empty event (speech completed)
    audioQueue.onQueueEmptyCallback?.();

    // Advance timers
    vi.advanceTimersByTime(2000);

    // Engine should transition to idle and NOT start listening
    expect(engine.getState()).toBe('idle');
    expect(engine.isMicEnabled()).toBe(false);
  });

  it('6. Cleanup is safe and idempotent', () => {
    const engine = new VoiceEngine();
    expect(() => {
      engine.cleanup();
      engine.cleanup();
      engine.cleanup();
    }).not.toThrow();
    expect(engine.isMicEnabled()).toBe(false);
    expect(engine.getState()).toBe('idle');
  });
});
