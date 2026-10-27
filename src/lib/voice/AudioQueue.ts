/**
 * Dedicated Asynchronous Audio Queue
 * Handles ordered, gapless playback of streaming TTS chunks with instant barge-in cancellation.
 * Prevents overlapping speech, duplicate playback, and recovers automatically from failed items.
 */

export interface AudioQueueItem {
  id: string;
  text: string;
  audioBuffer?: ArrayBuffer;
  synthesizer: () => Promise<ArrayBuffer | Blob | null>;
  onStart?: () => void;
  onEnd?: () => void;
}

export class AudioQueue {
  private queue: AudioQueueItem[] = [];
  private isProcessing = false;
  private isCancelled = false;
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private currentAudioElement: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private activeSynthUtterance: SpeechSynthesisUtterance | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;

  private onPlaybackStateChangeCallback?: (isPlaying: boolean) => void;
  private onQueueEmptyCallback?: () => void;

  constructor() {
    if (typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
  }

  public onPlaybackStateChange(cb: (isPlaying: boolean) => void): void {
    this.onPlaybackStateChangeCallback = cb;
  }

  public onQueueEmpty(cb: () => void): void {
    this.onQueueEmptyCallback = cb;
  }

  public enqueue(item: AudioQueueItem): void {
    if (this.isCancelled) return;
    this.queue.push(item);
    if (!this.isProcessing) {
      this.processNext();
    }
  }

  public isBusy(): boolean {
    return this.isProcessing || this.queue.length > 0;
  }

  public async processNext(): Promise<void> {
    if (this.isCancelled || this.queue.length === 0) {
      this.isProcessing = false;
      this.onPlaybackStateChangeCallback?.(false);
      this.onQueueEmptyCallback?.();
      return;
    }

    this.isProcessing = true;
    this.onPlaybackStateChangeCallback?.(true);

    const item = this.queue.shift()!;
    item.onStart?.();

    try {
      // 1. Synthesize audio buffer if not already pre-synthesized
      let audioBuffer: ArrayBuffer | null = item.audioBuffer || null;
      if (!audioBuffer) {
        const synthResult = await item.synthesizer();
        if (this.isCancelled) return;
        if (synthResult) {
          audioBuffer = synthResult instanceof Blob ? await synthResult.arrayBuffer() : synthResult;
        }
      }

      if (this.isCancelled) return;

      // 2. Play synthesized buffer via Web Audio API or fallback to browser speech
      if (audioBuffer && audioBuffer.byteLength > 0) {
        await this.playBuffer(audioBuffer);
      } else if (item.text.trim()) {
        await this.playSpeechSynthFallback(item.text);
      }

      item.onEnd?.();
    } catch (err) {
      console.warn(`AudioQueue chunk playback note for item "${item.id}":`, err);
    }

    if (!this.isCancelled) {
      this.processNext();
    }
  }

  private async playBuffer(buffer: ArrayBuffer): Promise<void> {
    return new Promise<void>((resolve) => {
      try {
        if (!this.audioContext || this.audioContext.state === 'closed') {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) this.audioContext = new AudioCtx();
        }

        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {});
        }

        if (!this.audioContext) {
          return resolve();
        }

        this.audioContext.decodeAudioData(
          buffer.slice(0),
          (decoded) => {
            if (this.isCancelled || !this.audioContext) return resolve();

            const source = this.audioContext.createBufferSource();
            source.buffer = decoded;
            source.connect(this.audioContext.destination);

            source.onended = () => {
              if (this.currentSourceNode === source) {
                this.currentSourceNode = null;
              }
              resolve();
            };

            this.currentSourceNode = source;
            source.start(0);
          },
          () => {
            // Decoding failed, resolve smoothly
            resolve();
          }
        );
      } catch {
        resolve();
      }
    });
  }

  private async playSpeechSynthFallback(text: string): Promise<void> {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    return new Promise<void>((resolve) => {
      try {
        const synth = window.speechSynthesis;
        if (synth.paused) {
          synth.resume();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.05;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;

        const isHindi = /[\u0900-\u097F]/.test(text);
        utterance.lang = isHindi ? 'hi-IN' : 'en-IN';

        const voices = synth.getVoices() || [];
        if (isHindi) {
          const hiVoice =
            voices.find((v) => v.lang.toLowerCase().includes('hi') || v.name.toLowerCase().includes('hindi') || v.name.toLowerCase().includes('kalpana') || v.name.toLowerCase().includes('swara')) ||
            voices.find((v) => v.lang.toLowerCase().includes('in'));
          if (hiVoice) utterance.voice = hiVoice;
        } else {
          const enVoice =
            voices.find((v) => v.lang.toLowerCase().includes('in') || v.name.toLowerCase().includes('india') || v.name.toLowerCase().includes('ravi') || v.name.toLowerCase().includes('heera')) ||
            voices.find((v) => v.name.includes('Natural') || v.name.includes('Google')) ||
            voices.find((v) => v.lang.startsWith('en')) ||
            voices[0] ||
            null;
          if (enVoice) utterance.voice = enVoice;
        }

        let finished = false;
        const finish = (isSuccess = true, reason = 'completed') => {
          if (finished) return;
          finished = true;
          if (this.watchdogTimer) {
            clearTimeout(this.watchdogTimer);
            this.watchdogTimer = null;
          }
          this.activeSynthUtterance = null;
          if (isSuccess) {
            console.log('[VoiceEngine] Text-to-speech completed for phrase.');
          } else {
            console.warn(`[AudioQueue] Text-to-speech phrase interrupted/failed (${reason}).`);
          }
          resolve();
        };

        utterance.onend = () => finish(true, 'ended');
        utterance.onerror = (e: any) => {
          const errType = e?.error || 'unknown';
          const isInterrupted = errType === 'interrupted' || errType === 'canceled';
          if (isInterrupted) {
            this.isCancelled = true;
          }
          finish(false, errType);
        };

        // Safety Watchdog
        this.watchdogTimer = setTimeout(() => finish(false, 'timeout'), Math.max(2000, text.length * 90 + 1500));
        this.activeSynthUtterance = utterance;

        console.log('[VoiceEngine] Text-to-speech started for phrase:', text.slice(0, 40));

        synth.speak(utterance);
        if (synth.paused) {
          synth.resume();
        }
      } catch (err) {
        console.warn('[VoiceEngine] SpeechSynthesis error:', err);
        resolve();
      }
    });
  }

  /**
   * Immediately halts current audio playback and purges all queued chunks
   */
  public clear(reason = 'Explicit cancellation / User barge-in'): void {
    console.log(`[AudioQueue] Clearing queue & stopping playback. Reason: ${reason}`);
    this.isCancelled = true;
    this.queue = [];

    if (this.watchdogTimer) {
      clearTimeout(this.watchdogTimer);
      this.watchdogTimer = null;
    }

    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {}
      this.currentSourceNode = null;
    }

    if (this.currentAudioElement) {
      try {
        this.currentAudioElement.pause();
        this.currentAudioElement.currentTime = 0;
      } catch {}
      this.currentAudioElement = null;
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
      this.activeSynthUtterance = null;
    }

    this.isProcessing = false;
    this.isCancelled = false;
    this.onPlaybackStateChangeCallback?.(false);
  }
}
