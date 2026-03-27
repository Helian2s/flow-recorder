import type { TransportBatch } from '@flow-recorder/schema';

export interface EventTransport {
  send(batch: TransportBatch): Promise<void>;
  flush?(reason?: string): Promise<void>;
}

export class NoopTransport implements EventTransport {
  async send(_batch: TransportBatch): Promise<void> {}
}

export class ConsoleTransport implements EventTransport {
  constructor(private readonly logger: Pick<Console, 'info'> = console) {}

  async send(batch: TransportBatch): Promise<void> {
    this.logger.info('[flow-recorder]', batch);
  }
}

export interface FetchTransportOptions {
  endpoint: string;
  fetchImpl?: typeof fetch;
  headers?: Record<string, string>;
  navigatorImpl?: Pick<Navigator, 'sendBeacon'>;
}

export class FetchTransport implements EventTransport {
  private readonly fetchImpl: typeof fetch;
  private readonly navigatorImpl?: Pick<Navigator, 'sendBeacon'>;

  constructor(private readonly options: FetchTransportOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.navigatorImpl = options.navigatorImpl;
  }

  async send(batch: TransportBatch): Promise<void> {
    if (!this.options.endpoint) {
      return;
    }

    const body = JSON.stringify(batch);
    const response = await this.fetchImpl(this.options.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...this.options.headers
      },
      body,
      keepalive: true
    });

    if (!response.ok) {
      throw new Error(`transport failed with status ${response.status}`);
    }
  }

  async flush(reason = 'manual'): Promise<void> {
    if (!this.options.endpoint || !this.navigatorImpl?.sendBeacon) {
      return;
    }

    const blob = new Blob([JSON.stringify({ reason, flushed_at_unix_ms: Date.now() })], {
      type: 'application/json'
    });
    this.navigatorImpl.sendBeacon(this.options.endpoint, blob);
  }
}

export interface ExtensionBridgeTransportOptions {
  source?: string;
  eventType?: string;
  targetWindow?: Pick<Window, 'postMessage'>;
}

export class ExtensionBridgeTransport implements EventTransport {
  private readonly source: string;
  private readonly eventType: string;
  private readonly targetWindow: Pick<Window, 'postMessage'>;

  constructor(options: ExtensionBridgeTransportOptions = {}) {
    this.source = options.source ?? 'flow-recorder-page';
    this.eventType = options.eventType ?? 'FLOW_RECORDER_BATCH';
    this.targetWindow = options.targetWindow ?? window;
  }

  async send(batch: TransportBatch): Promise<void> {
    this.targetWindow.postMessage(
      {
        source: this.source,
        type: this.eventType,
        payload: batch
      },
      '*',
    );
  }
}
