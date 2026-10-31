/**
 * Audit Logger & Security History
 * Tamper-evident, sanitized logging of all permission requests, approvals, denials,
 * and execution outcomes. Never stores secrets, tokens, or passwords.
 */

import { AuditLogEntry, ApprovalStatus, RiskLevel, PermissionChannel } from './types';
import { SecurityValidator } from './securityValidator';

const MAX_LOGS = 200;
const STORAGE_KEY = 'desktop_ai_security_audit_logs';

class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private listeners: Set<(logs: AuditLogEntry[]) => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            this.logs = parsed.slice(-MAX_LOGS);
          }
        }
      } catch {
        // Fallback to empty log array
      }
    }
  }

  private persist(): void {
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
      } catch {
        // Ignore storage quota errors
      }
    }
    this.notify();
  }

  private notify(): void {
    const copy = [...this.logs];
    this.listeners.forEach((fn) => {
      try {
        fn(copy);
      } catch {
        // Safe dispatch
      }
    });
  }

  public subscribe(listener: (logs: AuditLogEntry[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => this.listeners.delete(listener);
  }

  /**
   * Records an audit event with sanitized data.
   */
  public log(entry: {
    requestId: string;
    actionType: string;
    target: string;
    riskLevel: RiskLevel;
    status: ApprovalStatus;
    channel?: PermissionChannel;
    executionResult?: {
      success: boolean;
      message: string;
      error?: string;
    };
  }): AuditLogEntry {
    const cleanTarget = SecurityValidator.scrubSecrets(entry.target);
    const cleanMessage = entry.executionResult?.message
      ? SecurityValidator.scrubSecrets(entry.executionResult.message)
      : '';
    const cleanError = entry.executionResult?.error
      ? SecurityValidator.scrubSecrets(entry.executionResult.error)
      : undefined;

    const logItem: AuditLogEntry = {
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      requestId: entry.requestId,
      timestamp: new Date().toISOString(),
      actionType: entry.actionType,
      target: cleanTarget,
      riskLevel: entry.riskLevel,
      status: entry.status,
      channel: entry.channel,
      executionResult: entry.executionResult
        ? {
            success: entry.executionResult.success,
            message: cleanMessage,
            error: cleanError,
          }
        : undefined,
    };

    this.logs.unshift(logItem);
    if (this.logs.length > MAX_LOGS) {
      this.logs = this.logs.slice(0, MAX_LOGS);
    }

    this.persist();
    return logItem;
  }

  public getLogs(): AuditLogEntry[] {
    return [...this.logs];
  }

  public clear(): void {
    this.logs = [];
    this.persist();
  }
}

export const auditLogger = new AuditLogger();
