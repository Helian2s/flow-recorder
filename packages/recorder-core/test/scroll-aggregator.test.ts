import { describe, expect, it, vi } from 'vitest';

import { ScrollAggregator } from '../src/scroll-aggregator';

describe('ScrollAggregator', () => {
  it('emits start, progress, and end markers', () => {
    vi.useFakeTimers();
    const events: string[] = [];
    const container = document.createElement('div');
    Object.defineProperties(container, {
      scrollWidth: { value: 1000, configurable: true },
      clientWidth: { value: 200, configurable: true },
      scrollHeight: { value: 1200, configurable: true },
      clientHeight: { value: 300, configurable: true },
      scrollLeft: { value: 100, writable: true, configurable: true },
      scrollTop: { value: 120, writable: true, configurable: true }
    });

    const aggregator = new ScrollAggregator({
      throttleMs: 100,
      idleMs: 100,
      onEmit: (event) => events.push(event.eventType)
    });

    aggregator.handle(container);
    vi.advanceTimersByTime(120);
    aggregator.handle(container);
    vi.advanceTimersByTime(120);

    expect(events).toContain('scroll.start');
    expect(events).toContain('scroll.progress');
    expect(events).toContain('scroll.end');
    vi.useRealTimers();
  });
});
