import { describe, expect, it } from 'vitest';

import { RouteTracker } from '../src/route-tracker';

describe('RouteTracker', () => {
  it('emits history and route change events for pushState', () => {
    const events: string[] = [];
    const tracker = new RouteTracker(window, (change) => {
      events.push(change.eventType);
    });

    tracker.start();
    window.history.pushState({}, '', '/forms');
    tracker.stop();

    expect(events).toContain('document.load');
    expect(events).toContain('history.pushState');
    expect(events).toContain('route.change');
  });
});
