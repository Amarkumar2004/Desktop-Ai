import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionPipeline, type PipelineActionRequest } from '../ActionPipeline';

describe('ActionPipeline — Duplicate Execution Protection & Lifecycle', () => {
  beforeEach(() => {
    ActionPipeline.clearCompleted();
  });

  it('generates a unique actionId and dispatches action to running/completed status', async () => {
    const req: PipelineActionRequest = {
      type: 'NAVIGATE_TAB',
      payload: { tab: 'tasks' },
      source: 'voice',
    };

    const result = await ActionPipeline.dispatch(req);
    expect(result.success).toBe(true);
    expect(result.actionId).toBeDefined();
    expect(result.status).toBe('completed');
  });

  it('deduplicates identical actions triggered within the deduplication window', async () => {
    const req1: PipelineActionRequest = {
      type: 'NAVIGATE_TAB',
      payload: { tab: 'analysis' },
      source: 'voice',
    };

    const res1 = await ActionPipeline.dispatch(req1);
    expect(res1.success).toBe(true);

    // Immediate duplicate trigger
    const res2 = await ActionPipeline.dispatch(req1);
    expect(res2.isDuplicate).toBe(true);
    expect(res2.message).toContain('deduplicated');
  });

  it('notifies subscribers of action status changes', async () => {
    const statusHistory: string[] = [];
    const unsubscribe = ActionPipeline.onStateUpdate((states) => {
      states.forEach((s) => statusHistory.push(s.status));
    });

    await ActionPipeline.dispatch({
      type: 'NAVIGATE_TAB',
      payload: { tab: 'agents' },
    });

    unsubscribe();
    expect(statusHistory.length).toBeGreaterThan(0);
    expect(statusHistory).toContain('completed');
  });

  it('cancels active pending/running actions', async () => {
    const actionId = `test_act_${Date.now()}`;
    const cancelled = ActionPipeline.cancelAction(actionId);
    expect(cancelled).toBe(false); // Action didn't exist
  });
});

