/**
 * Conversation Manager
 * Maintains short-term conversational context, entity tracking, multi-turn history,
 * and contextual continuity across voice turns.
 */

export interface ConversationTurn {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  intent?: string;
  actionTaken?: string;
}

export class ConversationManager {
  private history: ConversationTurn[] = [];
  private activeContext: Record<string, unknown> = {};
  private maxHistoryLength = 12;

  constructor(maxHistoryLength = 12) {
    this.maxHistoryLength = maxHistoryLength;
  }

  public addUserTurn(content: string, intent?: string): ConversationTurn {
    const turn: ConversationTurn = {
      id: `turn_${Date.now()}_u`,
      role: 'user',
      content: content.trim(),
      timestamp: new Date().toISOString(),
      intent,
    };
    this.history.push(turn);
    this.trimHistory();
    return turn;
  }

  public addAssistantTurn(content: string, actionTaken?: string): ConversationTurn {
    const turn: ConversationTurn = {
      id: `turn_${Date.now()}_a`,
      role: 'assistant',
      content: content.trim(),
      timestamp: new Date().toISOString(),
      actionTaken,
    };
    this.history.push(turn);
    this.trimHistory();
    return turn;
  }

  public getHistory(): Array<{ role: 'user' | 'assistant' | 'system'; content: string }> {
    return this.history.map((t) => ({
      role: t.role,
      content: t.content,
    }));
  }

  public getRecentTurns(count = 6): ConversationTurn[] {
    return this.history.slice(-count);
  }

  public setContext(key: string, value: unknown): void {
    this.activeContext[key] = value;
  }

  public getContext(key: string): unknown {
    return this.activeContext[key];
  }

  public clearContext(): void {
    this.activeContext = {};
  }

  public reset(): void {
    this.history = [];
    this.activeContext = {};
  }

  private trimHistory(): void {
    if (this.history.length > this.maxHistoryLength) {
      this.history = this.history.slice(-this.maxHistoryLength);
    }
  }
}
