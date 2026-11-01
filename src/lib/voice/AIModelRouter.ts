/**
 * AI Model & Intent Router
 * Classifies user prompt intents and routes between LOCAL (Ollama, local tools, offline)
 * and GLOBAL (online cloud AI, web search, real-time knowledge).
 */

import type { IAIModelRouter, VoiceIntent, VoiceMode } from '@/types/realtimeVoice';

export class AIModelRouter implements IAIModelRouter {
  // Common intent detection patterns
  private localPatterns: RegExp[] = [
    /\b(?:system|cpu|ram|memory|uptime|specs|hardware|disk|battery)\b/i,
    /\b(?:local|offline|download|folder|directory|workspace|file|component|code\s+tab|tasks?\s+tab)\b/i,
    /\b(?:create\s+task|add\s+task|naya\s+task|task\s+banao|task\s+likho|task\s+queue)\b/i,
    /\b(?:summarize\s+this\s+pdf|open\s+folder|open\s+downloads|show\s+my\s+files)\b/i,
    /\b(?:diagnostics|scan|audit|agent\s+fleet|security\s+scan)\b/i,
    /\b(?:open|launch|kholo|start|chalao)\s+(?:application|app|chrome|browser|notepad|calc|calculator|settings|vscode|code|paint|cmd|terminal)\b/i,
  ];

  private globalPatterns: RegExp[] = [
    /\b(?:search|google|web|internet|latest|current|news|price|prices|score|weather|today's|update|release)\b/i,
    /\b(?:valorant|gta|steam|crypto|bitcoin|stock|market|who\s+won|president|trending)\b/i,
    /\b(?:online|browse|url|website|youtube\s+search)\b/i,
  ];

  public async routeIntent(
    prompt: string,
    history?: Array<{ role: 'user' | 'assistant' | 'system' | string; content: string }>,
    mode: VoiceMode = 'auto'
  ): Promise<VoiceIntent> {
    const trimmed = prompt.trim();
    const lower = trimmed.toLowerCase();

    // 1. Force mode overrides
    if (mode === 'offline') {
      return {
        type: this.detectSpecificLocalType(lower),
        isLocal: true,
        confidence: 1.0,
        rawPrompt: trimmed,
      };
    }

    if (mode === 'online') {
      return {
        type: this.detectSpecificGlobalType(lower),
        isLocal: false,
        confidence: 1.0,
        rawPrompt: trimmed,
      };
    }

    // 2. Intent matching for 'auto' mode
    let localScore = 0;
    let globalScore = 0;

    for (const pattern of this.localPatterns) {
      if (pattern.test(lower)) {
        localScore += 2;
      }
    }

    for (const pattern of this.globalPatterns) {
      if (pattern.test(lower)) {
        globalScore += 2;
      }
    }

    // Local system/task cues
    if (lower.includes('task') || lower.includes('file') || lower.includes('tab') || lower.includes('agent')) {
      localScore += 3;
    }

    // Web / Search cues
    if (lower.includes('search') || lower.includes('latest') || lower.includes('price') || lower.includes('news')) {
      globalScore += 3;
    }

    const isLocal = localScore >= globalScore;

    return {
      type: isLocal ? this.detectSpecificLocalType(lower) : this.detectSpecificGlobalType(lower),
      isLocal,
      confidence: Math.min(0.95, 0.5 + Math.abs(localScore - globalScore) * 0.1),
      rawPrompt: trimmed,
    };
  }

  private detectSpecificLocalType(lower: string): VoiceIntent['type'] {
    if (lower.includes('task') || lower.includes('todo')) return 'local_task';
    if (lower.includes('file') || lower.includes('folder') || lower.includes('component')) return 'local_file';
    if (lower.includes('system') || lower.includes('cpu') || lower.includes('ram') || lower.includes('diagnostic')) return 'local_system';
    return 'chat';
  }

  private detectSpecificGlobalType(lower: string): VoiceIntent['type'] {
    if (lower.includes('search') || lower.includes('google') || lower.includes('youtube')) return 'global_search';
    if (lower.includes('latest') || lower.includes('price') || lower.includes('update') || lower.includes('news')) return 'global_knowledge';
    return 'chat';
  }
}
