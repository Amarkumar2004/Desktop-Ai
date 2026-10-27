/**
 * True Barge-In & Interruption Controller
 * Coordinates cancellation of audio playback, TTS stream abort, active LLM generation,
 * and immediate focus handover to user microphone.
 */

import { AudioQueue } from './AudioQueue';

export class BargeInController {
  private isSpeaking = false;
  private onInterruptCallback: (() => void) | null = null;
  private audioQueue: AudioQueue | null = null;
  private activeAbortController: AbortController | null = null;

  constructor(audioQueue?: AudioQueue, onInterrupt?: () => void) {
    if (audioQueue) this.audioQueue = audioQueue;
    if (onInterrupt) this.onInterruptCallback = onInterrupt;
  }

  public setAudioQueue(queue: AudioQueue): void {
    this.audioQueue = queue;
  }

  public setOnInterrupt(callback: () => void): void {
    this.onInterruptCallback = callback;
  }

  public setSpeakingState(speaking: boolean): void {
    this.isSpeaking = speaking;
  }

  public setActiveAbortController(controller: AbortController | null): void {
    this.activeAbortController = controller;
  }

  /**
   * Triggers immediate interruption / barge-in
   */
  public triggerInterruption(): void {
    if (!this.isSpeaking) return;

    this.isSpeaking = false;

    // 1. Abort active LLM / TTS network requests
    if (this.activeAbortController) {
      this.activeAbortController.abort();
      this.activeAbortController = null;
    }

    // 2. Halt AudioQueue and cancel currently playing audio
    if (this.audioQueue) {
      this.audioQueue.clear();
    }

    // 3. Trigger interrupt listener
    this.onInterruptCallback?.();
  }
}
