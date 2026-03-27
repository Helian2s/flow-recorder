import type { NormalizedEvent, TransportBatch } from '@flow-recorder/schema';
import type { EventTransport } from '@flow-recorder/transport';

export interface QueueManagerOptions {
  batchSize: number;
  flushIntervalMs: number;
  maxQueueSize: number;
  createBatch: (events: NormalizedEvent[]) => TransportBatch;
  onOverflow: () => void;
  onTransportError: (error: Error) => void;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
}

export class QueueManager {
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly clearTimeoutImpl: typeof clearTimeout;
  private queue: NormalizedEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sending = false;

  constructor(
    private transport: EventTransport,
    private readonly options: QueueManagerOptions,
  ) {
    this.setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
    this.clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
  }

  setTransport(transport: EventTransport): void {
    this.transport = transport;
  }

  enqueue(event: NormalizedEvent): void {
    if (this.queue.length >= this.options.maxQueueSize) {
      this.queue.shift();
      this.options.onOverflow();
    }

    this.queue.push(event);
    if (this.queue.length >= this.options.batchSize) {
      void this.flush('batch-size');
      return;
    }

    if (!this.timer) {
      this.timer = this.setTimeoutImpl(() => {
        this.timer = null;
        void this.flush('interval');
      }, this.options.flushIntervalMs);
    }
  }

  async flush(reason = 'manual'): Promise<void> {
    if (this.sending || this.queue.length === 0) {
      if (reason && this.transport.flush) {
        await this.transport.flush(reason);
      }
      return;
    }

    this.sending = true;
    if (this.timer) {
      this.clearTimeoutImpl(this.timer);
      this.timer = null;
    }

    try {
      while (this.queue.length > 0) {
        const batchEvents = this.queue.splice(0, this.options.batchSize);
        try {
          await this.transport.send(this.options.createBatch(batchEvents));
        } catch (error) {
          this.queue.unshift(...batchEvents);
          throw error;
        }
      }
      if (this.transport.flush) {
        await this.transport.flush(reason);
      }
    } catch (error) {
      const typedError = error instanceof Error ? error : new Error(String(error));
      this.options.onTransportError(typedError);
    } finally {
      this.sending = false;
    }
  }

  stop(): void {
    if (this.timer) {
      this.clearTimeoutImpl(this.timer);
      this.timer = null;
    }
  }

  getQueueSize(): number {
    return this.queue.length;
  }
}
