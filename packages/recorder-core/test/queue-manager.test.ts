import { describe, expect, it, vi } from 'vitest';

import type { NormalizedEvent } from '@flow-recorder/schema';

import { QueueManager } from '../src/queue-manager';

describe('QueueManager', () => {
  it('flushes batches when the queue reaches the configured size', async () => {
    const send = vi.fn(async () => {});
    const transport = { send };

    const queue = new QueueManager(transport, {
      batchSize: 2,
      flushIntervalMs: 1_000,
      maxQueueSize: 10,
      createBatch: (events) => ({
        batch_id: 'batch_1',
        mode: 'gtm',
        sent_at_unix_ms: 0,
        session: {
          visitor_id: 'visitor_1',
          session_id: 'session_1',
          pageview_id: 'page_1',
          route_id: 'route_1',
          state_id: null,
          tab_id: null,
          mode: 'gtm',
          started_at_unix_ms: 0,
          current_url: 'https://demo.local/'
        },
        events
      }),
      onOverflow: () => {},
      onTransportError: () => {}
    });

    queue.enqueue({ event_id: '1' } as NormalizedEvent);
    queue.enqueue({ event_id: '2' } as NormalizedEvent);
    await queue.flush();

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].events).toHaveLength(2);
  });
});
