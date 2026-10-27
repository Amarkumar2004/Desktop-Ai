/**
 * Voice Barge-in Controller
 * Listens for user voice activity during assistant speech playback,
 * immediately halting output audio and routing focus to user input.
 */

export class VoiceBargeInController {
  private isSpeaking = false;
  private onInterruptCallback: (() => void) | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private animFrameId: number | null = null;
  private energyThreshold = 0.15; // Normalized speech volume threshold for barge-in
  private consecutiveFramesAboveThreshold = 0;

  constructor(onInterrupt?: () => void) {
    if (onInterrupt) {
      this.onInterruptCallback = onInterrupt;
    }
  }

  public setOnInterrupt(callback: () => void): void {
    this.onInterruptCallback = callback;
  }

  public setSpeakingState(speaking: boolean): void {
    this.isSpeaking = speaking;
    if (!speaking) {
      this.consecutiveFramesAboveThreshold = 0;
    }
  }

  /**
   * Attaches microphone stream to monitor audio energy level for speech barge-in
   */
  public attachMicrophone(stream: MediaStream): void {
    this.micStream = stream;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      this.startVADLoop();
    } catch {
      // AudioContext fallback for environments where auto-audio is restricted
    }
  }

  private startVADLoop(): void {
    if (!this.analyser) return;

    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const checkLevel = () => {
      if (!this.analyser) return;

      this.analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length / 255;

      if (this.isSpeaking && average > this.energyThreshold) {
        this.consecutiveFramesAboveThreshold++;
        // If speech energy is sustained for 3 consecutive animation frames (~50ms)
        if (this.consecutiveFramesAboveThreshold >= 3) {
          this.triggerBargeIn();
        }
      } else {
        this.consecutiveFramesAboveThreshold = Math.max(0, this.consecutiveFramesAboveThreshold - 1);
      }

      this.animFrameId = requestAnimationFrame(checkLevel);
    };

    this.animFrameId = requestAnimationFrame(checkLevel);
  }

  /**
   * Explicitly triggers barge-in (e.g. user speaking or mic click)
   */
  public triggerBargeIn(): void {
    if (this.isSpeaking) {
      this.isSpeaking = false;
      this.consecutiveFramesAboveThreshold = 0;
      if (this.onInterruptCallback) {
        this.onInterruptCallback();
      }
    }
  }

  public cleanup(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
    this.micStream = null;
    this.isSpeaking = false;
  }
}
