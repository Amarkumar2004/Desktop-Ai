/**
 * Central Permission Manager
 * Manages request lifecycles, expiration timeouts (45s), fail-secure defaults (default to DENY),
 * channel synchronization, and prevents approval reuse or target hijacking.
 */

import {
  PermissionRequest,
  PermissionChannel,
  ApprovalStatus,
  ActionMetadata,
} from './types';
import { ActionClassifier } from './actionClassifier';
import { auditLogger } from './auditLogger';

const DEFAULT_EXPIRATION_MS = 45000; // 45 seconds timeout

type ResolveHandler = (result: { approved: boolean; request: PermissionRequest }) => void;

class PermissionManager {
  private activeRequest: PermissionRequest | null = null;
  private activeResolver: ResolveHandler | null = null;
  private expirationTimer: NodeJS.Timeout | null = null;
  private listeners: Set<(request: PermissionRequest | null) => void> = new Set();
  private processedRequestIds: Set<string> = new Set();

  /**
   * Subscribes to changes in the active permission request.
   */
  public subscribe(listener: (request: PermissionRequest | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.activeRequest);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => {
      try {
        fn(this.activeRequest);
      } catch {
        // Safe dispatch
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('desktop-ai-permission-changed', {
          detail: { request: this.activeRequest },
        })
      );
    }
  }

  public getActiveRequest(): PermissionRequest | null {
    return this.activeRequest;
  }

  /**
   * Main entry point: Evaluates risk and requests user permission if required.
   */
  public async requestPermission(params: {
    actionType: string;
    target: string;
    component?: string;
    reason?: string;
    metadata?: ActionMetadata;
    customTimeoutMs?: number;
  }): Promise<{ approved: boolean; request: PermissionRequest }> {
    const classification = ActionClassifier.classify(params.actionType, {
      ...params.metadata,
      target: params.target,
    });

    const now = Date.now();
    const timeoutMs = params.customTimeoutMs || DEFAULT_EXPIRATION_MS;
    const requestId = `perm_req_${now}_${Math.random().toString(36).slice(2, 8)}`;

    const request: PermissionRequest = {
      id: requestId,
      actionType: params.actionType,
      target: params.target,
      component: params.component || classification.component,
      reason: params.reason || classification.reason,
      riskLevel: classification.riskLevel,
      isReversible: classification.isReversible,
      consequences: classification.consequences,
      metadata: params.metadata,
      status: 'PENDING',
      createdAt: now,
      expiresAt: now + timeoutMs,
      voicePromptHi: classification.voicePromptHi,
      voicePromptEn: classification.voicePromptEn,
    };

    // 1. If blocked outright by security policy
    if (classification.isBlocked) {
      request.status = 'DENIED';
      auditLogger.log({
        requestId: request.id,
        actionType: request.actionType,
        target: request.target,
        riskLevel: request.riskLevel,
        status: 'DENIED',
        channel: 'AUTO',
        executionResult: {
          success: false,
          message: 'Operation automatically blocked by security policy.',
          error: classification.blockedReason,
        },
      });
      return { approved: false, request };
    }

    // 2. If LOW RISK (Automatic Execution)
    if (!classification.requiresApproval && classification.riskLevel === 'LOW') {
      request.status = 'APPROVED';
      request.approvedByChannel = 'AUTO';
      auditLogger.log({
        requestId: request.id,
        actionType: request.actionType,
        target: request.target,
        riskLevel: 'LOW',
        status: 'APPROVED',
        channel: 'AUTO',
        executionResult: {
          success: true,
          message: 'Low-risk operation executed automatically.',
        },
      });
      return { approved: true, request };
    }

    // 3. Cancel any prior pending request (default to DENY)
    if (this.activeRequest && this.activeResolver) {
      this.resolveRequest(this.activeRequest.id, 'DENIED', 'AUTO', 'Replaced by newer request');
    }

    // 4. Set as active request and wait for approval across GUI, Voice, or Chat
    this.activeRequest = request;
    this.notify();

    // Set expiration timeout (Fail-Secure: Default to DENY)
    this.expirationTimer = setTimeout(() => {
      if (this.activeRequest?.id === requestId && this.activeRequest.status === 'PENDING') {
        this.resolveRequest(requestId, 'EXPIRED', 'AUTO', 'Permission request timed out after 45 seconds');
      }
    }, timeoutMs);

    return new Promise<{ approved: boolean; request: PermissionRequest }>((resolve) => {
      this.activeResolver = resolve;
    });
  }

  /**
   * Resolves an active permission request.
   * Can be called by GUI popup, Voice assistant, or Chat interface.
   */
  public resolveRequest(
    requestId: string,
    decision: 'APPROVED' | 'DENIED' | 'EXPIRED',
    channel: PermissionChannel,
    reasonMessage?: string
  ): boolean {
    if (!this.activeRequest || this.activeRequest.id !== requestId) {
      return false; // Invalid or mismatched ID
    }

    if (this.processedRequestIds.has(requestId)) {
      return false; // Prevent replay or duplicate execution
    }

    if (this.expirationTimer) {
      clearTimeout(this.expirationTimer);
      this.expirationTimer = null;
    }

    const current = { ...this.activeRequest };
    const isApproved = decision === 'APPROVED';

    current.status = decision;
    current.resolvedAt = Date.now();
    current.approvedByChannel = isApproved ? channel : undefined;

    this.processedRequestIds.add(requestId);

    // Audit log
    auditLogger.log({
      requestId: current.id,
      actionType: current.actionType,
      target: current.target,
      riskLevel: current.riskLevel,
      status: decision,
      channel,
      executionResult: {
        success: isApproved,
        message:
          reasonMessage ||
          (isApproved
            ? `Permission granted via ${channel}.`
            : `Permission denied/rejected via ${channel}.`),
      },
    });

    const resolver = this.activeResolver;
    this.activeRequest = null;
    this.activeResolver = null;
    this.notify();

    if (resolver) {
      resolver({ approved: isApproved, request: current });
    }

    return true;
  }

  /**
   * Quick helper for Voice / Chat / GUI
   */
  public approve(requestId: string, channel: PermissionChannel): boolean {
    return this.resolveRequest(requestId, 'APPROVED', channel);
  }

  public deny(requestId: string, channel: PermissionChannel): boolean {
    return this.resolveRequest(requestId, 'DENIED', channel);
  }
}

export const permissionManager = new PermissionManager();
