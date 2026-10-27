/**
 * Hybrid Voice Engine Compatibility Layer
 * Re-exports the new ZovaAI-style VoiceEngine as HybridVoiceEngine.
 * Guarantees 100% backward compatibility for existing UI shell components.
 */

'use client';

import { VoiceEngine } from './VoiceEngine';
import type {
  VoiceMode,
  VoiceState,
  VoiceLang,
  VoiceProcessResult,
} from '@/types/realtimeVoice';

export type { VoiceMode, VoiceState, VoiceLang, VoiceProcessResult };

export class HybridVoiceEngine extends VoiceEngine {
  constructor() {
    super();
  }
}

export default HybridVoiceEngine;
