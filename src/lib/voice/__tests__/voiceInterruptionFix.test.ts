import { describe, it, expect } from 'vitest';
import { AudioQueue } from '../AudioQueue';

describe('AudioQueue Interruption Safety & Lifecycle', () => {
  it('initializes queue in non-busy state', () => {
    const aq = new AudioQueue();
    expect(aq.isBusy()).toBe(false);
  });

  it('handles intentional queue clearance without throwing', () => {
    const aq = new AudioQueue();
    aq.enqueue({
      id: 'test-1',
      text: 'Test phrase',
      synthesizer: async () => null,
    });
    expect(aq.isBusy()).toBe(true);

    aq.clear();
    expect(aq.isBusy()).toBe(false);
  });
});
