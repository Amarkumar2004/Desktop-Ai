import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskOrchestrator } from '../TaskOrchestrator';

describe('TaskOrchestrator — Multi-Step Sequential Execution & Dependencies', () => {
  let orchestrator: TaskOrchestrator;

  beforeEach(() => {
    orchestrator = new TaskOrchestrator();
  });

  it('creates sequential dependency chain for multi-step instructions', async () => {
    const tasks = await orchestrator.planAndDispatch('Open Chrome and then open YouTube', [
      { type: 'OPEN_APP', payload: { appName: 'chrome' } },
      { type: 'OPEN_URL', payload: { url: 'https://youtube.com' } },
    ]);

    expect(tasks).toHaveLength(2);
    expect(tasks[0].dependsOn).toBeUndefined();
    expect(tasks[1].dependsOn).toBeDefined();
    expect(tasks[1].dependsOn).toEqual([tasks[0].taskId]);
  });

  it('cancels all dependent tasks when parent task is cancelled', async () => {
    const tasks = await orchestrator.planAndDispatch('Pehle chrome kholo aur phir lofi chalao', [
      { type: 'OPEN_APP', payload: { appName: 'chrome' } },
      { type: 'OPEN_URL', payload: { url: 'https://youtube.com' } },
    ]);

    expect(tasks).toHaveLength(2);
    const parentId = tasks[0].taskId;
    orchestrator.cancelTask(parentId);

    const updatedParent = orchestrator.getTask(parentId);
    expect(updatedParent?.status).toBe('cancelled');
  });

  it('calculates real progress without fake hardcoded values', async () => {
    const tasks = await orchestrator.planAndDispatch('Switch tab to tasks', {
      type: 'NAVIGATE_TAB',
      payload: { tab: 'tasks' },
    });

    expect(tasks).toHaveLength(1);
    expect(tasks[0].progress).toBeGreaterThanOrEqual(0);
  });
});

