/**
 * ActionPipeline — Authoritative Single-Point Action Execution Engine for SUSI AI
 * 
 * Enforces:
 * 1. Single Authoritative Execution: All desktop actions route through this pipeline.
 * 2. Idempotency & Deduplication: Prevents double-execution of duplicate voice/UI commands.
 * 3. Explicit Lifecycle States: pending | requires_approval | running | completed | failed | blocked | cancelled
 * 4. Observable State Subscriptions: Read-only state streams for UI components (e.g. VoiceCard).
 * 5. Verification-First: Never marks an action completed until underlying execution is verified.
 */

import { ToolExecutor } from '@/lib/voice/ToolExecutor';

export type PipelineActionStatus =
  | 'pending'
  | 'requires_approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export interface PipelineActionRequest {
  id?: string;
  type: string;
  payload?: Record<string, unknown>;
  requiresApproval?: boolean;
  source?: 'voice' | 'chat' | 'orchestrator' | 'ui';
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface PipelineActionState {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: PipelineActionStatus;
  message?: string;
  error?: string;
  progress: number;
  createdAt: number;
  updatedAt: number;
  result?: unknown;
  source: string;
}

export interface PipelineActionResult {
  success: boolean;
  actionId: string;
  message: string;
  status: PipelineActionStatus;
  result?: unknown;
  error?: string;
  isDuplicate?: boolean;
}

class ActionPipelineManager {
  private actions: Map<string, PipelineActionState> = new Map();
  private idempotencyLog: Map<string, { timestamp: number; actionId: string; status: PipelineActionStatus }> = new Map();
  private inFlightPromises: Map<string, Promise<PipelineActionResult>> = new Map();
  private listeners: Set<(states: PipelineActionState[]) => void> = new Set();
  private toolExecutor: ToolExecutor;
  private abortControllers: Map<string, AbortController> = new Map();

  // 4-second deduplication window for identical non-unique triggers
  private readonly IDEMPOTENCY_WINDOW_MS = 4000;

  constructor() {
    this.toolExecutor = new ToolExecutor();
  }

  /**
   * Subscribe to pipeline state changes (used by UI for status/toasts)
   */
  public onStateUpdate(cb: (states: PipelineActionState[]) => void): () => void {
    this.listeners.add(cb);
    // Immediate emit with current active states
    cb(this.getStates());
    return () => this.listeners.delete(cb);
  }

  public getStates(): PipelineActionState[] {
    return Array.from(this.actions.values());
  }

  public getAction(actionId: string): PipelineActionState | undefined {
    return this.actions.get(actionId);
  }

  private notify(): void {
    const states = this.getStates();
    this.listeners.forEach((cb) => {
      try {
        cb(states);
      } catch (err) {
        console.error('[ActionPipeline] Error in state listener:', err);
      }
    });
  }

  /**
   * Generates a stable idempotency key if one is not explicitly provided
   */
  private computeIdempotencyKey(req: PipelineActionRequest): string {
    if (req.idempotencyKey) return req.idempotencyKey;
    const target =
      req.payload?.appName ||
      req.payload?.path ||
      req.payload?.target ||
      req.payload?.action ||
      req.payload?.tab ||
      req.payload?.url ||
      req.payload?.filename ||
      JSON.stringify(req.payload || {});
    return `${req.type.toUpperCase()}:${String(target).trim().toLowerCase()}`;
  }

  /**
   * Main Dispatch: Executes an action with duplicate protection and verified outcome
   */
  public async dispatch(req: PipelineActionRequest): Promise<PipelineActionResult> {
    const actionId = req.id || `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const idempotencyKey = this.computeIdempotencyKey(req);
    const now = Date.now();

    // Check if an identical action was executed or is in-flight within the deduplication window
    const existing = this.idempotencyLog.get(idempotencyKey);
    if (existing && now - existing.timestamp < this.IDEMPOTENCY_WINDOW_MS) {
      if (existing.status === 'running' || existing.status === 'pending') {
        const inFlight = this.inFlightPromises.get(existing.actionId);
        if (inFlight) {
          console.warn(`[ActionPipeline] Deduplicating in-flight action "${req.type}". Joining active promise.`);
          return inFlight;
        }
      }
      if (existing.status === 'completed') {
        console.warn(`[ActionPipeline] Suppressed duplicate action trigger "${req.type}" within ${this.IDEMPOTENCY_WINDOW_MS}ms window.`);
        return {
          success: true,
          actionId: existing.actionId,
          message: `Action ${req.type} already completed recently (deduplicated).`,
          status: 'completed',
          isDuplicate: true,
        };
      }
    }

    // Initialize state
    const state: PipelineActionState = {
      id: actionId,
      type: req.type.toUpperCase(),
      payload: req.payload || {},
      status: req.requiresApproval ? 'requires_approval' : 'pending',
      progress: 0,
      createdAt: now,
      updatedAt: now,
      source: req.source || 'voice',
    };

    this.actions.set(actionId, state);
    this.idempotencyLog.set(idempotencyKey, { timestamp: now, actionId, status: state.status });
    this.notify();

    // Create execution promise
    const controller = new AbortController();
    this.abortControllers.set(actionId, controller);
    const onAbort = () => controller.abort();
    req.signal?.addEventListener('abort', onAbort, { once: true });
    if (req.signal?.aborted) controller.abort();
    const executionPromise = this.executeInternal(state, idempotencyKey, req.requiresApproval, controller.signal);
    this.inFlightPromises.set(actionId, executionPromise);

    try {
      const result = await executionPromise;
      return result;
    } finally {
      this.inFlightPromises.delete(actionId);
      this.abortControllers.delete(actionId);
      req.signal?.removeEventListener('abort', onAbort);
    }
  }

  private async executeInternal(
    state: PipelineActionState,
    idempotencyKey: string,
    requiresApproval = false,
    signal?: AbortSignal
  ): Promise<PipelineActionResult> {
    state.status = 'running';
    state.progress = 20;
    state.updatedAt = Date.now();
    this.idempotencyLog.set(idempotencyKey, { timestamp: Date.now(), actionId: state.id, status: 'running' });
    this.notify();

    try {
      // Delegate to Safe ToolExecutor
      if (signal?.aborted) throw new Error('Action cancelled before execution.');
      const execResult = await this.toolExecutor.execute(
        state.type,
        state.payload,
        requiresApproval,
        signal
      );
      if (signal?.aborted) {
        state.status = 'cancelled';
        state.message = 'Action cancelled.';
        state.updatedAt = Date.now();
        this.idempotencyLog.set(idempotencyKey, { timestamp: Date.now(), actionId: state.id, status: 'cancelled' });
        this.notify();
        return { success: false, actionId: state.id, message: 'Action cancelled.', status: 'cancelled' };
      }

      state.updatedAt = Date.now();

      if (execResult.success) {
        state.status = 'completed';
        state.progress = 100;
        state.message = execResult.message;
        state.result = execResult.result;
        this.idempotencyLog.set(idempotencyKey, { timestamp: Date.now(), actionId: state.id, status: 'completed' });
        this.notify();

        return {
          success: true,
          actionId: state.id,
          message: execResult.message,
          status: 'completed',
          result: execResult.result,
        };
      } else {
        const isBlocked = execResult.message?.toLowerCase().includes('cancelled') ||
                          execResult.message?.toLowerCase().includes('denied') ||
                          execResult.message?.toLowerCase().includes('blocked');

        state.status = isBlocked ? 'blocked' : 'failed';
        state.error = execResult.message;
        state.message = execResult.message;
        this.idempotencyLog.set(idempotencyKey, { timestamp: Date.now(), actionId: state.id, status: state.status });
        this.notify();

        return {
          success: false,
          actionId: state.id,
          message: execResult.message,
          status: state.status,
          error: execResult.message,
        };
      }
    } catch (err: unknown) {
      if (signal?.aborted) {
        state.status = 'cancelled';
        state.message = 'Action cancelled.';
        state.updatedAt = Date.now();
        this.idempotencyLog.set(idempotencyKey, { timestamp: Date.now(), actionId: state.id, status: 'cancelled' });
        this.notify();
        return { success: false, actionId: state.id, message: 'Action cancelled.', status: 'cancelled' };
      }
      const errorMsg = err instanceof Error ? err.message : 'Action execution exception';
      state.status = 'failed';
      state.error = errorMsg;
      state.message = errorMsg;
      state.updatedAt = Date.now();
      this.idempotencyLog.set(idempotencyKey, { timestamp: Date.now(), actionId: state.id, status: 'failed' });
      this.notify();

      return {
        success: false,
        actionId: state.id,
        message: errorMsg,
        status: 'failed',
        error: errorMsg,
      };
    }
  }

  /**
   * Cancel an in-flight or pending action
   */
  public cancelAction(actionId: string, reason = 'User cancelled'): boolean {
    const act = this.actions.get(actionId);
    if (!act) return false;
    if (act.status === 'completed' || act.status === 'cancelled') return false;

    this.abortControllers.get(actionId)?.abort();
    act.status = 'cancelled';
    act.message = reason;
    act.updatedAt = Date.now();
    this.notify();
    return true;
  }

  /**
   * Clear finished (terminal) actions from active tracking list
   */
  public clearCompleted(): void {
    let changed = false;
    for (const [id, act] of this.actions.entries()) {
      if (act.status === 'completed' || act.status === 'failed' || act.status === 'blocked' || act.status === 'cancelled') {
        this.actions.delete(id);
        changed = true;
      }
    }
    this.idempotencyLog.clear();
    if (changed) {
      this.notify();
    }
  }
}

export const ActionPipeline = new ActionPipelineManager();
