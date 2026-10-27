/**
 * Local Piper-compatible Text-To-Speech (TTS) Engine
 * Synthesizes and plays audio with instant barge-in / cancellation support.
 * Zero paid APIs required.
 */

import type { ITextToSpeech, VoiceLang } from '@/types/realtimeVoice';

export interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  language?: VoiceLang;
}

export class TextToSpeech implements ITextToSpeech {
  private isCurrentlySpeaking = false;
  private currentAbortController: AbortController | null = null;
  private currentAudio: HTMLAudioElement | null = null;
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private audioContext: AudioContext | null = null;
  private synth: SpeechSynthesis | null = null;
  private selectedBrowserVoice: SpeechSynthesisVoice | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private keepAliveInterval: NodeJS.Timeout | null = null;
  private language: VoiceLang = 'hi-IN';

  constructor(language: VoiceLang = 'hi-IN') {
    this.language = language;
    if (typeof window !== 'undefined') {
      this.synth = window.speechSynthesis;
      this.initVoices();
    }
  }

  public setLanguage(lang: VoiceLang): void {
    this.language = lang;
    this.initVoices();
  }

  private initVoices(): void {
    if (!this.synth) return;

    const pickBestVoice = () => {
      const voices = this.synth?.getVoices() || [];
      if (voices.length === 0) return;

      const hindiVoice = voices.find(
        (v) =>
          v.lang.toLowerCase().includes('hi') ||
          v.name.toLowerCase().includes('hindi') ||
          v.name.toLowerCase().includes('kalpana') ||
          v.name.toLowerCase().includes('swara') ||
          v.name.toLowerCase().includes('hemant')
      );

      const indianVoice = voices.find(
        (v) =>
          v.lang.toLowerCase().includes('in') ||
          v.name.toLowerCase().includes('india') ||
          v.name.toLowerCase().includes('ravi') ||
          v.name.toLowerCase().includes('heera') ||
          v.name.toLowerCase().includes('neerja')
      );

      const naturalVoice =
        voices.find((v) => v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Neural')) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];

      this.selectedBrowserVoice = hindiVoice || indianVoice || naturalVoice || null;
    };

    pickBestVoice();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = pickBestVoice;
    }
  }

  public cleanTextForSpeech(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, 'Code block generated.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*#_~>{}[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  public async synthesize(text: string, options?: TTSOptions): Promise<ArrayBuffer | Blob | null> {
    const cleaned = this.cleanTextForSpeech(text);
    if (!cleaned) return null;

    const controller = new AbortController();
    this.currentAbortController = controller;

    try {
      const res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleaned,
          voice: options?.voice || 'hi_IN-kalpana-medium',
          rate: options?.rate || 1.05,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`TTS API returned ${res.status}`);
      }

      if (res.headers.get('content-type')?.includes('audio')) {
        return await res.arrayBuffer();
      }
      return null;
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        return null;
      }
      return null;
    }
  }

  public async speak(
    text: string,
    options?: {
      voice?: string;
      rate?: number;
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: Error) => void;
    }
  ): Promise<void> {
    // Instant Barge-in: Stop any existing playback first
    this.stop();

    const cleanText = this.cleanTextForSpeech(text);
    if (!cleanText) {
      options?.onEnd?.();
      return;
    }

    this.isCurrentlySpeaking = true;
    options?.onStart?.();

    // 1. Try local Piper audio synthesis via API
    try {
      const audioResult = await this.synthesize(cleanText, {
        voice: options?.voice,
        rate: options?.rate || 1.05,
      });

      if (audioResult && this.isCurrentlySpeaking) {
        const buffer = audioResult instanceof Blob ? await audioResult.arrayBuffer() : audioResult;
        if (buffer.byteLength > 0) {
          await this.playAudioBuffer(buffer, options?.onEnd);
          return;
        }
      }
    } catch {
      // Piper endpoint not running audio buffer, fallback to high-quality browser synthesis
    }

    // 2. High-quality local browser speech synthesis fallback
    if (!this.isCurrentlySpeaking) return;

    this.speakViaBrowserSynth(cleanText, options);
  }

  private async playAudioBuffer(buffer: ArrayBuffer, onEnd?: () => void): Promise<void> {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) throw new Error('No AudioContext');

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      const decoded = await this.audioContext.decodeAudioData(buffer.slice(0));
      if (!this.isCurrentlySpeaking) return;

      const source = this.audioContext.createBufferSource();
      source.buffer = decoded;
      source.connect(this.audioContext.destination);

      source.onended = () => {
        if (this.currentSourceNode === source) {
          this.currentSourceNode = null;
          this.isCurrentlySpeaking = false;
          onEnd?.();
        }
      };

      this.currentSourceNode = source;
      source.start(0);
    } catch {
      // If Web Audio decoding fails, fallback to HTML5 Audio Element or SpeechSynthesis
      const blob = new Blob([buffer], { type: 'audio/wav' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      this.currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        this.isCurrentlySpeaking = false;
        onEnd?.();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(url);
        this.currentAudio = null;
        this.isCurrentlySpeaking = false;
        onEnd?.();
      };

      await audio.play();
    }
  }

  private speakViaBrowserSynth(
    text: string,
    options?: {
      voice?: string;
      rate?: number;
      onEnd?: () => void;
      onError?: (err: Error) => void;
    }
  ): void {
    if (typeof window === 'undefined' || !this.synth) {
      this.isCurrentlySpeaking = false;
      options?.onEnd?.();
      return;
    }

    try {
      this.synth.cancel();
      this.synth.resume();

      const utterance = new SpeechSynthesisUtterance(text);
      if (this.selectedBrowserVoice) {
        utterance.voice = this.selectedBrowserVoice;
      }
      utterance.rate = options?.rate || 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const finishHandler = () => {
        this.clearTimers();
        this.isCurrentlySpeaking = false;
        options?.onEnd?.();
      };

      utterance.onstart = () => {
        // Safety Watchdog in case browser synthesis drops event
        const estimatedDurationMs = Math.max(3000, Math.min(30000, text.length * 90 + 2000));
        this.watchdogTimer = setTimeout(() => {
          if (this.isCurrentlySpeaking) {
            console.warn('TTS watchdog triggered, recovering speech state.');
            finishHandler();
          }
        }, estimatedDurationMs);
      };

      utterance.onend = finishHandler;
      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis event:', e);
        finishHandler();
      };

      this.synth.speak(utterance);
      if (this.synth.paused) {
        this.synth.resume();
      }
    } catch (err) {
      console.warn('Browser TTS error:', err);
      this.isCurrentlySpeaking = false;
      options?.onEnd?.();
    }
  }

  public stop(): void {
    this.clearTimers();

    // Abort active fetch requests
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }

    // Stop Web Audio node
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {}
      this.currentSourceNode = null;
    }

    // Stop Audio element
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch {}
      this.currentAudio = null;
    }

    // Stop SpeechSynthesis
    if (typeof window !== 'undefined' && this.synth) {
      try {
        this.synth.cancel();
      } catch {}
    }

    this.isCurrentlySpeaking = false;
  }

  public isSpeaking(): boolean {
    return this.isCurrentlySpeaking;
  }

  private clearTimers(): void {
    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  public cleanup(): void {
    this.stop();
  }
}
