import { describe, expect, it, vi } from 'vitest';

import { StateSettlementManager } from '../src/state-settlement-manager';

describe('StateSettlementManager', () => {
  it('settles after quiet DOM and idle network windows', () => {
    vi.useFakeTimers();
    let inflight = 1;
    const settled: string[] = [];

    const manager = new StateSettlementManager({
      domQuietMs: 200,
      networkIdleMs: 200,
      maxSettleWaitMs: 2000,
      getInFlightRequests: () => inflight,
      onSettlingStart: () => {},
      onSettled: (result) => settled.push(result.reason)
    });

    manager.markDirty('test');
    inflight = 0;
    vi.advanceTimersByTime(220);

    expect(settled).toEqual(['quiet-window']);
    manager.stop();
    vi.useRealTimers();
  });
});
