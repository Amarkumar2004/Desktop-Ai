/**
 * Local Whisper-based Speech-To-Text (STT) Client Engine
 * Integrates Microphone Capture, Audio Recording, Local Whisper STT Endpoint,
 * and live interim transcription fallback.
 */

import type { ISpeechToText, VoiceLang } from '@/types/realtimeVoice';

interface IWindowSpeechRecognition {
  SpeechRecognition?: new () => ISpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => ISpeechRecognitionInstance;
}

interface ISpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
  onspeechstart: (() => void) | null;
  onspeechend: (() => void) | null;
  onnomatch: (() => void) | null;
  onresult: ((event: any) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export interface STTEventHandlers {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (err: Error, code: string) => void;
  onAudioStream?: (stream: MediaStream) => void;
  onSpeechEnd?: () => void;
}

export class SpeechToText implements ISpeechToText {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private recognition: ISpeechRecognitionInstance | null = null;
  private isRecording = false;
  private micEnabled = false;
  private sessionId = 0;
  private speechEndTriggered = false;
  private language: VoiceLang = 'hi-IN';

  private interimTranscript = '';
  private finalTranscript = '';
  private handlers: STTEventHandlers = {};

  private restartTimeout: NodeJS.Timeout | null = null;

  constructor(language: VoiceLang = 'hi-IN', handlers?: STTEventHandlers) {
    this.language = language;
    if (handlers) {
      this.handlers = handlers;
    }
  }

  public setLanguage(lang: VoiceLang): void {
    this.language = lang;
    if (this.recognition) {
      this.recognition.lang = lang;
    }
  }

  public setHandlers(handlers: STTEventHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  public isMicEnabled(): boolean {
    return this.micEnabled;
  }

  public async getMicrophoneStream(): Promise<MediaStream> {
    if (this.mediaStream && this.mediaStream.active) {
      return this.mediaStream;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('Microphone mediaDevices API not available in this environment.');
      this.handlers.onError?.(err, 'MIC_UNAVAILABLE');
      throw err;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });

      this.mediaStream = stream;
      this.handlers.onAudioStream?.(stream);
      return stream;
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        this.handlers.onError?.(error, 'MIC_PERMISSION_DENIED');
      } else {
        this.handlers.onError?.(error, 'AUDIO_DEVICE_ERROR');
      }
      throw error;
    }
  }

  public async startListening(): Promise<void> {
    if (this.isRecording) return;

    try {
      this.micEnabled = true;
      this.sessionId = Date.now();
      this.speechEndTriggered = false;
      const stream = await this.getMicrophoneStream();
      this.isRecording = true;
      this.audioChunks = [];
      this.interimTranscript = '';
      this.finalTranscript = '';

      // 1. Initialize MediaRecorder for Whisper audio blob capture
      try {
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : MediaRecorder.isTypeSupported('audio/ogg')
              ? 'audio/ogg'
              : '';

        const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            this.audioChunks.push(e.data);
          }
        };
        this.mediaRecorder = recorder;
        recorder.start(100);
      } catch (recErr) {
        console.warn('MediaRecorder setup note:', recErr);
      }

      // 2. Start Web Speech recognition for low-latency live feedback stream
      this.startInterimRecognition();
    } catch (err) {
      this.isRecording = false;
      this.micEnabled = false;
      throw err;
    }
  }

  private startInterimRecognition(): void {
    if (typeof window === 'undefined' || !this.micEnabled) return;
    const currentSessionId = this.sessionId;
    const win = window as unknown as IWindowSpeechRecognition;
    const SR = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SR) return;

    try {
      if (this.recognition) {
        try {
          this.recognition.abort();
        } catch { }
      }

      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = this.language;

      rec.onstart = () => {
        console.log('[STT] SpeechRecognition event: start (listening active)');
      };

      rec.onaudiostart = () => {
        console.log('[STT] SpeechRecognition event: audiostart');
      };

      rec.onspeechstart = () => {
        console.log('[STT] SpeechRecognition event: speechstart');
      };

      rec.onspeechend = () => {
        console.log('[STT] SpeechRecognition event: speechend');
        if (this.micEnabled && this.sessionId === currentSessionId && !this.speechEndTriggered) {
          this.speechEndTriggered = true;
          this.handlers.onSpeechEnd?.();
        }
      };

      rec.onnomatch = () => {
        console.warn('[STT] SpeechRecognition event: nomatch');
      };

      rec.onresult = (event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean;[index: number]: { transcript: string } }> }) => {
        if (!this.micEnabled || this.sessionId !== currentSessionId) return;

        let interim = '';
        let hasFinalResult = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            hasFinalResult = true;
            this.finalTranscript += item[0].transcript + ' ';
          } else {
            interim += item[0].transcript;
          }
        }
        this.interimTranscript = interim;
        const currentText = (this.finalTranscript + interim).trim();
        console.log(`[STT] SpeechRecognition result (isFinal=${hasFinalResult}): "${currentText}"`);
        if (currentText) {
          this.handlers.onTranscript?.(currentText, hasFinalResult);
          if (hasFinalResult && !this.speechEndTriggered) {
            this.speechEndTriggered = true;
            this.handlers.onSpeechEnd?.();
          }
        }
      };

      rec.onerror = (e: { error: string }) => {
        if (e.error !== 'no-speech' && e.error !== 'aborted') {
          console.warn('[STT] SpeechRecognition event error:', e.error);
        }
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          this.handlers.onError?.(new Error('Microphone permission denied'), 'MIC_PERMISSION_DENIED');
        }
      };

      rec.onend = () => {
        console.log('[STT] SpeechRecognition event: end');
        if (this.isRecording && this.micEnabled && this.sessionId === currentSessionId) {
          if (this.restartTimeout) clearTimeout(this.restartTimeout);
          this.restartTimeout = setTimeout(() => {
            if (this.isRecording && this.micEnabled && this.sessionId === currentSessionId && this.recognition === rec) {
              try {
                console.log('[STT] Auto-restarting continuous SpeechRecognition...');
                rec.start();
              } catch (err) {
                console.warn('[STT] SpeechRecognition restart note:', err);
              }
            }
          }, 300);
        }
      };

      this.recognition = rec;
      rec.start();
    } catch (err) {
      console.warn('Interim recognition start error:', err);
    }
  }

  public async stopListening(): Promise<string> {
    console.log('[STT] Explicit stop listening called. Releasing microphone stream and tracks.');
    this.isRecording = false;
    this.micEnabled = false;
    this.sessionId = 0;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    // Stop live recognition
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch { }
      this.recognition = null;
    }

    // Stop MediaRecorder and grab audio Blob
    let audioBlob: Blob | null = null;
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        if (!this.mediaRecorder) return resolve();
        const timeout = setTimeout(() => resolve(), 500);
        this.mediaRecorder.onstop = () => {
          clearTimeout(timeout);
          resolve();
        };
        try {
          this.mediaRecorder.stop();
        } catch {
          clearTimeout(timeout);
          resolve();
        }
      });
      if (this.audioChunks.length > 0) {
        audioBlob = new Blob(this.audioChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
      }
    }

    // Stop and release all microphone MediaStream tracks
    if (this.mediaStream) {
      console.log('[STT] Stopping active MediaStream tracks.');
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }

    const fallbackSpokenText = (this.finalTranscript + ' ' + this.interimTranscript).trim();

    // If audio blob is available, attempt Whisper transcription
    if (audioBlob && audioBlob.size > 200) {
      try {
        const whisperResult = await this.transcribe(audioBlob, this.language);
        if (whisperResult && whisperResult.text && whisperResult.text.trim()) {
          const resultText = whisperResult.text.trim();
          this.handlers.onTranscript?.(resultText, true);
          return resultText;
        }
      } catch (err) {
        console.warn('Whisper STT request note:', err);
      }
    }

    if (fallbackSpokenText) {
      this.handlers.onTranscript?.(fallbackSpokenText, true);
    }
    return fallbackSpokenText;
  }

  public async transcribe(audioBlob: Blob, language?: string): Promise<{ text: string; language?: string }> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'speech.webm');
    formData.append('language', language || this.language);

    const res = await fetch('/api/voice/stt', {
      method: 'POST',
      body: formData,
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      throw new Error(`STT server returned status ${res.status}`);
    }

    const data = await res.json();
    return {
      text: data.text || '',
      language: data.language || language,
    };
  }

  public cleanup(): void {
    this.isRecording = false;
    this.micEnabled = false;
    this.sessionId = 0;
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch { }
      this.recognition = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.stop();
      } catch { }
      this.mediaRecorder = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    this.audioChunks = [];
  }
}
