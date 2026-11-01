/**
 * Upgraded Real-Time Asynchronous Voice Engine
 * Architecture:
 * Mic → VAD → Low-Latency STT → ConversationManager → Streaming LLM → TextChunker → AudioQueue → Speaker
 * Supports continuous conversation, true barge-in, parallel task orchestration, and local/global routing.
 */

'use client';

import type {
  VoiceMode,
  VoiceState,
  VoiceLang,
  VoiceProcessResult,
} from '@/types/realtimeVoice';
import { VoiceActivityDetection } from './VoiceActivityDetection';
import { SpeechToText } from './SpeechToText';
import { TextToSpeech } from './TextToSpeech';
import { WakeWordDetector } from './WakeWordDetector';
import { AIModelRouter } from './AIModelRouter';
import { ToolExecutor } from './ToolExecutor';
import { TextChunker } from './TextChunker';
import { AudioQueue } from './AudioQueue';
import { BargeInController } from './BargeInController';
import { ConversationManager } from './ConversationManager';
import { TaskOrchestrator } from './TaskOrchestrator';
import { permissionManager } from '@/lib/security/permissionManager';
import { ApprovalService } from '@/lib/security/approvalService';

export interface VoiceTimingMetrics {
  sttDurationMs: number;
  firstTokenMs: number;
  firstAudioPhraseMs: number;
  totalDurationMs: number;
}

export class VoiceEngine {
  private mode: VoiceMode = 'auto';
  private state: VoiceState = 'idle';
  private language: VoiceLang = 'hi-IN';
  private continuousMode = true;
  private micEnabled = false;
  private lastProcessedUtterance: { text: string; timestamp: number } | null = null;

  // Subsystem instances
  private vad: VoiceActivityDetection;
  private stt: SpeechToText;
  private tts: TextToSpeech;
  private wakeWord: WakeWordDetector;
  private router: AIModelRouter;
  private tools: ToolExecutor;
  private chunker: TextChunker;
  private audioQueue: AudioQueue;
  private bargeIn: BargeInController;
  private conversation: ConversationManager;
  private taskOrchestrator: TaskOrchestrator;

  // Active state management
  private autoListenTimer: NodeJS.Timeout | null = null;
  private activeAbortController: AbortController | null = null;
  private unsubscribePermission: (() => void) | null = null;
  private lastMetrics: VoiceTimingMetrics = {
    sttDurationMs: 0,
    firstTokenMs: 0,
    firstAudioPhraseMs: 0,
    totalDurationMs: 0,
  };

  // Listeners
  private stateChangeListeners: Set<(state: VoiceState) => void> = new Set();
  private transcriptListeners: Set<(text: string, isFinal: boolean) => void> = new Set();
  private responseListeners: Set<(res: VoiceProcessResult) => void> = new Set();
  private errorListeners: Set<(err: string) => void> = new Set();

  constructor() {
    this.vad = new VoiceActivityDetection({ energyThreshold: 0.008, silenceDelayMs: 900 });
    this.stt = new SpeechToText(this.language);
    this.tts = new TextToSpeech(this.language);
    this.wakeWord = new WakeWordDetector();
    this.router = new AIModelRouter();
    this.tools = new ToolExecutor();
    this.chunker = new TextChunker();
    this.audioQueue = new AudioQueue();
    this.bargeIn = new BargeInController(this.audioQueue);
    this.conversation = new ConversationManager(12);
    this.taskOrchestrator = new TaskOrchestrator();

    this.setupSubsystemHooks();
  }

  public isMicEnabled(): boolean {
    return this.micEnabled;
  }

  private setupSubsystemHooks(): void {
    // 1. STT Stream hook -> Connect to VAD for continuous energy monitoring
    this.stt.setHandlers({
      onAudioStream: (stream) => {
        this.vad.attachStream(stream);
      },
      onTranscript: (text, isFinal) => {
        if (!text.trim()) return;

        // Check wake-word triggers ("Hey SUSI", "सूसी")
        this.wakeWord.processTranscript(text);

        this.transcriptListeners.forEach((cb) => cb(text, isFinal));
      },
      onSpeechEnd: () => {
        if (this.state === 'listening' && this.micEnabled) {
          console.log('[VoiceEngine] Speech end signal received. Processing command...');
          this.handleSpeechComplete().catch(() => {});
        }
      },
      onError: (err, code) => {
        console.warn(`[VoiceEngine] STT error (${code}):`, err?.message || err);
        if (code === 'MIC_PERMISSION_DENIED') {
          this.micEnabled = false;
          this.setState('error');
          this.errorListeners.forEach((cb) => cb('Microphone permission denied. Please allow microphone access.'));
        }
      },
    });

    // 2. AudioQueue state hooks
    this.audioQueue.onPlaybackStateChange((isPlaying) => {
      this.bargeIn.setSpeakingState(isPlaying);
      if (isPlaying && this.state !== 'listening') {
        console.log('[VoiceEngine] TTS Audio playback started.');
        this.setState('speaking');
      }
    });

    this.audioQueue.onQueueEmpty(() => {
      if (this.state === 'speaking') {
        console.log('[VoiceEngine] TTS Audio playback completed.');
        this.setState('idle');
        if (this.continuousMode && this.micEnabled) {
          this.scheduleAutoListen(400);
        }
      }
    });

    // 3. Barge-in Interruption hook
    this.bargeIn.setOnInterrupt(() => {
      this.chunker.reset();
      if (this.micEnabled) {
        this.setState('listening');
      } else {
        this.setState('idle');
      }
    });

    // 4. Wake-Word trigger hook
    this.wakeWord.start(() => {
      if (this.state === 'speaking' || this.audioQueue.isBusy()) {
        this.bargeIn.triggerInterruption();
      }
    });

    // 5. Permission Gatekeeper hook (speaks permission prompt to user)
    this.unsubscribePermission = permissionManager.subscribe((req) => {
      if (req && req.status === 'PENDING') {
        const promptToSpeak =
          this.language === 'hi-IN'
            ? req.voicePromptHi || 'Kya aap is action ki ijazat dete hain?'
            : req.voicePromptEn || 'Do you authorize this action?';

        console.log(`[VoiceEngine] Speaking permission request: "${promptToSpeak}"`);
        this.enqueueChunkToAudioQueue(promptToSpeak);
        this.setState('speaking');
      }
    });
  }

  public setMode(mode: VoiceMode): void {
    this.mode = mode;
  }

  public getMode(): VoiceMode {
    return this.mode;
  }

  public setLanguage(lang: VoiceLang): void {
    this.language = lang;
    this.stt.setLanguage(lang);
    this.tts.setLanguage(lang);
  }

  public getLanguage(): VoiceLang {
    return this.language;
  }

  public setContinuousMode(enabled: boolean): void {
    this.continuousMode = enabled;
    if (!enabled && this.autoListenTimer) {
      clearTimeout(this.autoListenTimer);
      this.autoListenTimer = null;
    }
  }

  public isContinuousMode(): boolean {
    return this.continuousMode;
  }

  public getState(): VoiceState {
    return this.state;
  }

  public getTimingMetrics(): VoiceTimingMetrics {
    return { ...this.lastMetrics };
  }

  public getTaskOrchestrator(): TaskOrchestrator {
    return this.taskOrchestrator;
  }

  public onStateChange(cb: (state: VoiceState) => void): () => void {
    this.stateChangeListeners.add(cb);
    return () => this.stateChangeListeners.delete(cb);
  }

  public onTranscript(cb: (text: string, isFinal: boolean) => void): () => void {
    this.transcriptListeners.add(cb);
    return () => this.transcriptListeners.delete(cb);
  }

  public onResponse(cb: (res: VoiceProcessResult) => void): () => void {
    this.responseListeners.add(cb);
    return () => this.responseListeners.delete(cb);
  }

  public onError(cb: (err: string) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  private setState(state: VoiceState): void {
    this.state = state;
    this.stateChangeListeners.forEach((cb) => cb(state));
  }

  /**
   * Start listening pipeline
   */
  public async startListening(): Promise<void> {
    if (typeof window === 'undefined') return;

    if (this.autoListenTimer) {
      clearTimeout(this.autoListenTimer);
      this.autoListenTimer = null;
    }

    this.micEnabled = true;

    // Stop speaking immediately on active listen start
    this.stopSpeaking();

    try {
      console.log('[VoiceEngine] Microphone started listening.');
      this.setState('listening');
      await this.stt.startListening();

      // Continuous VAD listening loop
      this.vad.start(
        () => {
          // Speech Start detected
          if (this.state === 'speaking' || this.audioQueue.isBusy()) {
            console.log('[VoiceEngine] User spoke during assistant playback (barge-in triggered).');
            this.bargeIn.triggerInterruption();
            if (this.micEnabled) {
              this.setState('listening');
            }
          }
        },
        async () => {
          // Speech End detected (silence threshold passed)
          if (this.state === 'listening' && this.micEnabled) {
            await this.handleSpeechComplete();
          }
        }
      );
    } catch (err: unknown) {
      this.micEnabled = false;
      this.setState('error');
      const msg = err instanceof Error ? err.message : 'Microphone access failed';
      console.error('[VoiceEngine] Microphone start error:', msg);
      this.errorListeners.forEach((cb) => cb(msg));
    }
  }

  private async handleSpeechComplete(): Promise<void> {
    if (this.state !== 'listening' || !this.micEnabled) return;
    this.setState('thinking');

    const sttStartTime = performance.now();
    const rawSpokenText = await this.stt.stopListening();
    this.vad.stop();

    this.lastMetrics.sttDurationMs = Math.round(performance.now() - sttStartTime);
    const cleaned = this.wakeWord.stripWakeWord(rawSpokenText).trim();

    console.log('[VoiceEngine] Microphone stopped. Recognized transcript:', cleaned || '(empty)');

    if (!this.micEnabled) {
      console.log('[VoiceEngine] Microphone was disabled during STT stop. Ignoring command.');
      this.setState('idle');
      return;
    }

    if (cleaned) {
      await this.processCommandStreaming(cleaned);
    } else {
      console.warn('[VoiceEngine] No speech detected in transcript.');
      this.setState('idle');
      this.errorListeners.forEach((cb) => cb('No speech recognized. Please speak clearly into the microphone.'));
      if (this.continuousMode && this.micEnabled) {
        this.scheduleAutoListen(1200);
      }
    }
  }

  public async stopListening(): Promise<void> {
    console.log('[VoiceEngine] stopListening called - turning microphone OFF completely.');
    this.micEnabled = false;
    if (this.autoListenTimer) {
      clearTimeout(this.autoListenTimer);
      this.autoListenTimer = null;
    }
    this.vad.stop();
    await this.stt.stopListening();
    if (this.state !== 'speaking') {
      this.setState('idle');
    }
  }

  /**
   * Real-Time Streaming Command Processor
   * Streams LLM tokens, chunks into natural phrases, and feeds AudioQueue immediately
   */
  public async processCommandStreaming(text: string): Promise<VoiceProcessResult | null> {
    const trimmed = text.trim();
    if (!trimmed) return null;

    // Deduplicate repeated final speech-recognition results using transcript + timestamp guard
    const now = Date.now();
    if (
      this.lastProcessedUtterance &&
      this.lastProcessedUtterance.text === trimmed &&
      now - this.lastProcessedUtterance.timestamp < 3000
    ) {
      console.log('[VoiceEngine] Skipping duplicate utterance submission:', trimmed);
      return null;
    }
    this.lastProcessedUtterance = { text: trimmed, timestamp: now };

    // 0. Permission Gatekeeper Interceptor: Check if active permission request is awaiting decision
    const activePerm = permissionManager.getActiveRequest();
    if (activePerm && activePerm.status === 'PENDING') {
      const voiceDecision = ApprovalService.handleVoiceInput(trimmed);
      if (voiceDecision.handled) {
        const isApproved = voiceDecision.decision === 'APPROVED';
        const reply = isApproved
          ? (this.language === 'hi-IN' ? 'Ijazat mil gayi hai. Action execute kiya ja raha hai.' : 'Permission granted. Executing action.')
          : (this.language === 'hi-IN' ? 'Action cancel kar diya gaya hai.' : 'Action has been cancelled.');

        this.conversation.addUserTurn(trimmed);
        this.conversation.addAssistantTurn(reply);
        this.transcriptListeners.forEach((cb) => cb(trimmed, true));
        this.enqueueChunkToAudioQueue(reply);
        this.setState('speaking');

        const result: VoiceProcessResult = {
          replyText: reply,
          assignedAgent: 'SUSI',
          modeUsed: 'offline',
          sourceProvider: 'local_smart',
          modelName: 'Permission Gatekeeper',
          action: { type: 'CHAT_REPLY' },
        };
        this.responseListeners.forEach((cb) => cb(result));
        return result;
      }
    }

    const requestStartTime = performance.now();
    let firstTokenRecorded = false;
    let firstPhraseRecorded = false;

    // Barge-in: abort active controller
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    this.stopSpeaking();
    this.chunker.reset();
    this.setState('thinking');
    this.transcriptListeners.forEach((cb) => cb(trimmed, true));

    // Record turn into Conversation Manager
    this.conversation.addUserTurn(trimmed);
    const history = this.conversation.getHistory();

    // Intent routing
    const intent = await this.router.routeIntent(trimmed, history, this.mode);

    const controller = new AbortController();
    this.activeAbortController = controller;
    this.bargeIn.setActiveAbortController(controller);

    let fullAccumulatedReply = '';
    let metadata: any = null;
    let finalSourceProvider: any = 'gemini';
    let finalModelName = 'Google Gemini';
    let apiError: string | null = null;

    console.log(`[VoiceEngine] Gemini request started for prompt: "${trimmed}" (mode: ${this.mode})`);

    try {
      const response = await fetch('/api/voice/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          history: history.slice(-6),
          mode: this.mode,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        const statusText = `HTTP status ${response.status}`;
        console.error(`[VoiceEngine] Stream endpoint error: ${statusText}`);
        this.errorListeners.forEach((cb) => cb(`Gemini API Request failed (${statusText})`));
        throw new Error(`Stream endpoint returned ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        sseBuffer += decoder.decode(value, { stream: true });
        const blocks = sseBuffer.split('\n\n');
        // Keep trailing incomplete block in buffer
        sseBuffer = blocks.pop() || '';

        for (const block of blocks) {
          if (!block.trim()) continue;

          const lines = block.split('\n');
          let eventType = 'message';
          let eventData: any = null;

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('event: ')) {
              eventType = trimmedLine.slice(7).trim();
            } else if (trimmedLine.startsWith('data: ')) {
              try {
                eventData = JSON.parse(trimmedLine.slice(6));
              } catch {}
            }
          }

          if (eventType === 'metadata' && eventData) {
            metadata = eventData;
            const actionsList = Array.isArray(eventData.actions) && eventData.actions.length > 0
              ? eventData.actions
              : eventData.action ? [eventData.action] : [];
            for (const act of actionsList) {
              if (act && act.type && act.type !== 'CHAT_REPLY') {
                this.taskOrchestrator.planAndDispatch(trimmed, act);
              }
            }
          } else if (eventType === 'token' && eventData?.token) {
            if (!firstTokenRecorded) {
              firstTokenRecorded = true;
              this.lastMetrics.firstTokenMs = Math.round(performance.now() - requestStartTime);
            }

            fullAccumulatedReply += eventData.token;

            const readyChunks = this.chunker.push(eventData.token);
            for (const chunk of readyChunks) {
              if (!firstPhraseRecorded) {
                firstPhraseRecorded = true;
                this.lastMetrics.firstAudioPhraseMs = Math.round(performance.now() - requestStartTime);
              }
              this.enqueueChunkToAudioQueue(chunk.text);
            }
          } else if (eventType === 'done' && eventData) {
            if (eventData.sourceProvider) finalSourceProvider = eventData.sourceProvider;
            if (eventData.modelName) finalModelName = eventData.modelName;
          } else if (eventType === 'error' && eventData?.error) {
            apiError = eventData.error;
            console.error('[VoiceEngine] Stream emitted error event:', apiError);
            this.errorListeners.forEach((cb) => cb(apiError!));
          }
        }
      }

      // Process any trailing block in sseBuffer
      if (sseBuffer.trim()) {
        const lines = sseBuffer.trim().split('\n');
        let eventType = 'message';
        let eventData: any = null;
        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine.startsWith('event: ')) {
            eventType = trimmedLine.slice(7).trim();
          } else if (trimmedLine.startsWith('data: ')) {
            try {
              eventData = JSON.parse(trimmedLine.slice(6));
            } catch {}
          }
        }
        if (eventType === 'token' && eventData?.token) {
          fullAccumulatedReply += eventData.token;
          const readyChunks = this.chunker.push(eventData.token);
          for (const chunk of readyChunks) {
            this.enqueueChunkToAudioQueue(chunk.text);
          }
        }
      }

      // Flush any remaining trailing tokens in the chunker buffer
      const trailingChunks = this.chunker.flush();
      for (const chunk of trailingChunks) {
        this.enqueueChunkToAudioQueue(chunk.text);
      }

      this.lastMetrics.totalDurationMs = Math.round(performance.now() - requestStartTime);

      const finalReply = fullAccumulatedReply.trim() || 'Command acknowledged.';
      console.log(`[VoiceEngine] Gemini response received. Total length: ${finalReply.length} chars, provider: ${finalSourceProvider}`);
      this.conversation.addAssistantTurn(finalReply);

      const result: VoiceProcessResult = {
        replyText: finalReply,
        assignedAgent: metadata?.assignedAgent || 'SUSI',
        modeUsed: intent.isLocal ? 'offline' : 'online',
        sourceProvider: finalSourceProvider,
        modelName: finalModelName,
        action: metadata?.action || { type: 'CHAT_REPLY' },
        actions: metadata?.actions || (metadata?.action ? [metadata.action] : []),
      };

      this.responseListeners.forEach((cb) => cb(result));
      return result;
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        console.log('[VoiceEngine] Gemini request aborted.');
        return null;
      }

      const errMsg = err instanceof Error ? err.message : 'Unknown error during Gemini processing';
      console.error('[VoiceEngine] Exception in processCommandStreaming:', errMsg);
      this.errorListeners.forEach((cb) => cb(`Voice processing failure: ${errMsg}`));

      // Fallback response with immediate chunk speech
      const fallbackReply = `Haan ji! Maine "${trimmed}" par note le liya hai. Main aapki poori madad karne ke liye taiyar hoon!`;
      this.enqueueChunkToAudioQueue(fallbackReply);

      const fallbackResult: VoiceProcessResult = {
        replyText: fallbackReply,
        assignedAgent: 'SUSI',
        modeUsed: 'offline',
        sourceProvider: 'local_smart',
        modelName: 'SUSI Local Engine (Offline)',
        action: { type: 'CHAT_REPLY' },
      };

      this.conversation.addAssistantTurn(fallbackReply);
      this.responseListeners.forEach((cb) => cb(fallbackResult));
      return fallbackResult;
    }
  }

  public async processCommand(
    text: string,
    _history?: Array<{ role: 'user' | 'assistant'; content: string }>
  ): Promise<VoiceProcessResult | null> {
    return this.processCommandStreaming(text);
  }

  private enqueueChunkToAudioQueue(phrase: string): void {
    if (!phrase.trim()) return;

    this.audioQueue.enqueue({
      id: `aq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: phrase,
      synthesizer: async () => {
        try {
          return await this.tts.synthesize(phrase);
        } catch {
          return null;
        }
      },
    });
  }

  /**
   * Speak arbitrary reply
   */
  public async speakReply(text: string): Promise<void> {
    this.stopSpeaking();
    this.enqueueChunkToAudioQueue(text);
  }

  /**
   * Immediately halt speaking (True Barge-in / User Interruption)
   */
  public stopSpeaking(): void {
    if (this.autoListenTimer) {
      clearTimeout(this.autoListenTimer);
      this.autoListenTimer = null;
    }
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    this.bargeIn.triggerInterruption();
    this.chunker.reset();
    this.audioQueue.clear();
    this.tts.stop();
    if (this.state === 'speaking') {
      this.setState('idle');
    }
  }

  private scheduleAutoListen(delayMs: number): void {
    if (this.autoListenTimer) {
      clearTimeout(this.autoListenTimer);
      this.autoListenTimer = null;
    }
    if (!this.micEnabled || !this.continuousMode) return;

    this.autoListenTimer = setTimeout(() => {
      if (this.micEnabled && this.continuousMode && (this.state === 'idle' || this.state === 'speaking')) {
        this.startListening().catch(() => {});
      }
    }, delayMs);
  }

  public cleanup(): void {
    this.micEnabled = false;
    if (this.autoListenTimer) {
      clearTimeout(this.autoListenTimer);
      this.autoListenTimer = null;
    }
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }
    if (this.unsubscribePermission) {
      this.unsubscribePermission();
      this.unsubscribePermission = null;
    }
    this.vad.stop();
    this.stt.cleanup();
    this.tts.cleanup();
    this.audioQueue.clear();
    this.chunker.reset();
    this.wakeWord.stop();
    this.conversation.reset();
    this.stateChangeListeners.clear();
    this.transcriptListeners.clear();
    this.responseListeners.clear();
    this.errorListeners.clear();
    this.state = 'idle';
  }
}
