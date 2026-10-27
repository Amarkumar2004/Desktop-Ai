/**
 * Local Wake Word Detector
 * Detects "Hey SUSI", "SUSI", "हे सूसी", "Susi" trigger phrases.
 * Prepared with clean abstractions for future local ONNX / Tauri wake-word models.
 * Zero paid wake-word APIs required.
 */

import type { IWakeWordDetector } from '@/types/realtimeVoice';

export type WakeWordPattern = string | RegExp;

export class WakeWordDetector implements IWakeWordDetector {
  private isEnabled = true;
  private onWakeWordDetectedCallback: ((wakeWord: string) => void) | null = null;
  private patterns: RegExp[] = [
    /\b(?:hey|hay|ok|hello|hi|arre|suno)?\s*susi\b/i,
    /(?:^|\s|[.,!?])(?:हे|अरे|नमस्ते|हैलो|सुनो)?\s*सूसी(?:$|\s|[.,!?])/i,
    /\b(?:hey|hay|ok|hi)\s*suzie\b/i,
  ];

  constructor(customPatterns?: RegExp[]) {
    if (customPatterns && customPatterns.length > 0) {
      this.patterns = customPatterns;
    }
  }

  public start(onWakeWordDetected: (wakeWord: string) => void): void {
    this.isEnabled = true;
    this.onWakeWordDetectedCallback = onWakeWordDetected;
  }

  public stop(): void {
    this.isEnabled = false;
  }

  public processTranscript(transcript: string): boolean {
    if (!this.isEnabled || !transcript) return false;

    const trimmed = transcript.trim();
    for (const pattern of this.patterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const detected = match[0].trim();
        this.onWakeWordDetectedCallback?.(detected);
        return true;
      }
    }
    return false;
  }

  /**
   * Future Tauri / ONNX audio frame processor hook
   */
  public processAudioFrame(audioData: Float32Array): boolean {
    // Hook point for custom local ONNX / openWakeWord models in desktop Tauri runtime
    if (!this.isEnabled || audioData.length === 0) return false;
    return false;
  }

  /**
   * Cleans wake word phrase from the prompt
   */
  public stripWakeWord(text: string): string {
    let result = text;
    for (const pattern of this.patterns) {
      result = result.replace(pattern, ' ').trim();
    }
    return result.replace(/\s+/g, ' ').trim();
  }
}
