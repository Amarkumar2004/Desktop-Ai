/**
 * Voice Activity Detection (VAD) Engine
 * Detects when the user begins speaking and when they stop (silence detection).
 * Prevents sending pure silence to STT and triggers barge-in / interruption during playback.
 */

import type { IVoiceActivityDetection } from '@/types/realtimeVoice';

export interface VADOptions {
  energyThreshold?: number; // RMS threshold for voice activity (0.01 - 0.20)
  silenceDelayMs?: number;   // Milliseconds of silence to consider speech ended
  speechHoldMs?: number;     // Minimum speech duration to confirm speech start
  sampleRate?: number;
}

export class VoiceActivityDetection implements IVoiceActivityDetection {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private animFrameId: number | null = null;

  private isSpeaking = false;
  private speechStartTimestamp = 0;
  private lastAboveThresholdTimestamp = 0;

  private energyThreshold: number;
  private silenceDelayMs: number;
  private speechHoldMs: number;

  private onSpeechStartCallback: (() => void) | null = null;
  private onSpeechEndCallback: (() => void) | null = null;
  private onEnergyLevelCallback: ((level: number) => void) | null = null;

  constructor(options?: VADOptions) {
    this.energyThreshold = options?.energyThreshold ?? 0.035;
    this.silenceDelayMs = options?.silenceDelayMs ?? 900;
    this.speechHoldMs = options?.speechHoldMs ?? 150;
  }

  public setSensitivity(threshold: number): void {
    this.energyThreshold = Math.max(0.005, Math.min(0.25, threshold));
  }

  public onEnergyLevel(cb: (level: number) => void): void {
    this.onEnergyLevelCallback = cb;
  }

  public attachStream(stream: MediaStream): void {
    this.stream = stream;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }

      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      this.mediaStreamSource = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.3;
      this.mediaStreamSource.connect(this.analyser);
    } catch (err) {
      console.warn('VAD AudioContext initialization error:', err);
    }
  }

  public start(onSpeechStart: () => void, onSpeechEnd: () => void): void {
    this.onSpeechStartCallback = onSpeechStart;
    this.onSpeechEndCallback = onSpeechEnd;
    this.isSpeaking = false;
    this.speechStartTimestamp = 0;
    this.lastAboveThresholdTimestamp = 0;

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    this.runAnalysisLoop();
  }

  public stop(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.mediaStreamSource) {
      try {
        this.mediaStreamSource.disconnect();
      } catch {}
      this.mediaStreamSource = null;
    }
    if (this.analyser) {
      try {
        this.analyser.disconnect();
      } catch {}
      this.analyser = null;
    }
    this.isSpeaking = false;
  }

  private runAnalysisLoop(): void {
    if (!this.analyser) return;

    const buffer = new Float32Array(this.analyser.fftSize);

    const step = () => {
      if (!this.analyser) return;

      this.analyser.getFloatTimeDomainData(buffer);

      // Compute Root Mean Square (RMS) energy
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
      }
      const rms = Math.sqrt(sum / buffer.length);
      this.onEnergyLevelCallback?.(rms);

      const now = performance.now();

      if (rms >= this.energyThreshold) {
        this.lastAboveThresholdTimestamp = now;

        if (!this.isSpeaking) {
          if (this.speechStartTimestamp === 0) {
            this.speechStartTimestamp = now;
          } else if (now - this.speechStartTimestamp >= this.speechHoldMs) {
            // Confirmed start of speech
            this.isSpeaking = true;
            this.onSpeechStartCallback?.();
          }
        }
      } else {
        // Below threshold
        if (this.isSpeaking) {
          if (now - this.lastAboveThresholdTimestamp >= this.silenceDelayMs) {
            // Confirmed end of speech
            this.isSpeaking = false;
            this.speechStartTimestamp = 0;
            this.onSpeechEndCallback?.();
          }
        } else {
          this.speechStartTimestamp = 0;
        }
      }

      this.animFrameId = requestAnimationFrame(step);
    };

    this.animFrameId = requestAnimationFrame(step);
  }

  public isUserSpeaking(): boolean {
    return this.isSpeaking;
  }
}
