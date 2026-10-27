/**
 * Multilingual Voice Language & Script Detector
 * Identifies Hindi (Devanagari), Roman Hinglish, and English without forcing inappropriate scripts.
 */

import type { VoiceLanguagePreference } from '@/types/realtimeVoice';

// Devanagari Unicode Block: \u0900-\u097F
const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

// Common Hinglish marker tokens
const HINGLISH_KEYWORDS = new Set([
  'kholo', 'karo', 'kar', 'karna', 'kardo', 'batao', 'kaise', 'kya', 'kyu', 'kyun',
  'mera', 'meri', 'mere', 'mujhe', 'humko', 'hai', 'hain', 'ho', 'tha', 'thi', 'the',
  'nahi', 'nahin', 'mat', 'samjhao', 'chalao', 'sunao', 'dekho', 'dikhaye', 'dikhao',
  'aap', 'aapka', 'tum', 'tumhara', 'dhundho', 'khojo', 'baad', 'mein', 'par', 'aur',
  'bhi', 'shuru', 'band', 'rok', 'roko', 'suno', 'madad', 'chahiye', 'kaam'
]);

export class VoiceLanguageDetector {
  /**
   * Analyzes an input string or transcript snippet to determine language and script.
   */
  public static detect(text: string): VoiceLanguagePreference {
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        mode: 'auto',
        detectedLanguage: 'en',
        detectedScript: 'latin',
        confidence: 0.5,
      };
    }

    // Check for Devanagari script (Hindi / Marathi / Sanskrit)
    const devanagariMatches = trimmed.match(new RegExp(DEVANAGARI_REGEX, 'g'));
    if (devanagariMatches && devanagariMatches.length > 0) {
      const devanagariRatio = devanagariMatches.length / trimmed.replace(/\s+/g, '').length;
      if (devanagariRatio > 0.2) {
        return {
          mode: 'auto',
          detectedLanguage: 'hi',
          detectedScript: 'devanagari',
          confidence: Math.min(1, 0.7 + devanagariRatio * 0.3),
        };
      }
    }

    // Tokenize Latin words to check for Roman Hinglish
    const words = trimmed
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);

    if (words.length === 0) {
      return {
        mode: 'auto',
        detectedLanguage: 'en',
        detectedScript: 'latin',
        confidence: 0.5,
      };
    }

    let hinglishCount = 0;
    for (const w of words) {
      if (HINGLISH_KEYWORDS.has(w)) {
        hinglishCount++;
      }
    }

    const hinglishRatio = hinglishCount / words.length;

    if (hinglishCount >= 1 && hinglishRatio >= 0.15) {
      return {
        mode: 'auto',
        detectedLanguage: 'hinglish',
        detectedScript: 'roman',
        confidence: Math.min(1, 0.6 + hinglishRatio * 0.4),
      };
    }

    // Default to English with Latin script
    return {
      mode: 'auto',
      detectedLanguage: 'en',
      detectedScript: 'latin',
      confidence: 0.8,
    };
  }

  /**
   * Helper to format a badge label for the UI
   */
  public static getDisplayLabel(pref: VoiceLanguagePreference): string {
    if (pref.detectedLanguage === 'hi' && pref.detectedScript === 'devanagari') {
      return 'हिंदी (Devanagari)';
    }
    if (pref.detectedLanguage === 'hinglish' || pref.detectedScript === 'roman') {
      return 'Hinglish';
    }
    return 'English';
  }
}
