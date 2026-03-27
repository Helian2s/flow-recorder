import type { NetworkRecord, RecorderConfig } from '@flow-recorder/schema';

import { sanitizeUrl } from './utils';

export interface NetworkTrackerOptions {
  win: Window;
  config: RecorderConfig;
  now: () => number;
  generateId: () => string;
  onRequestStart: (record: NetworkRecord) => void;
  onRequestEnd: (record: NetworkRecord) => void;
}

interface XhrMetadata {
  method: string;
  url: string;
  startedAt: number;
  requestId: string;
}

export class NetworkTracker {
  private readonly inflight = new Map<string, NetworkRecord>();
  private originalFetch: typeof window.fetch | null = null;
  private originalOpen: typeof XMLHttpRequest.prototype.open | null = null;
  private originalSend: typeof XMLHttpRequest.prototype.send | null = null;
  private readonly xhrMetadata = new WeakMap<XMLHttpRequest, XhrMetadata>();

  constructor(private readonly options: NetworkTrackerOptions) {}

  start(): void {
    this.patchFetch();
    this.patchXhr();
  }

  stop(): void {
    if (this.originalFetch) {
      this.options.win.fetch = this.originalFetch;
    }
    if (this.originalOpen) {
      XMLHttpRequest.prototype.open = this.originalOpen;
    }
    if (this.originalSend) {
      XMLHttpRequest.prototype.send = this.originalSend;
    }
  }

  getInFlightCount(): number {
    return this.inflight.size;
  }

  private patchFetch(): void {
    if (!this.options.win.fetch) {
      return;
    }

    this.originalFetch = this.options.win.fetch.bind(this.options.win);
    const tracker = this;
    this.options.win.fetch = async function patchedFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      if (!tracker.shouldTrackUrl(url)) {
        return tracker.originalFetch!(input, init);
      }

      const startedAt = tracker.options.now();
      const requestId = tracker.options.generateId();
      const startRecord: NetworkRecord = {
        request_id: requestId,
        method,
        sanitized_url: tracker.sanitize(url),
        started_at_unix_ms: startedAt,
        result: 'pending'
      };
      tracker.inflight.set(requestId, startRecord);
      tracker.options.onRequestStart(startRecord);

      try {
        const response = await tracker.originalFetch!(input, init);
        const completed: NetworkRecord = {
          ...startRecord,
          ended_at_unix_ms: tracker.options.now(),
          duration_ms: tracker.options.now() - startedAt,
          status: response.status,
          result: response.ok ? 'success' : 'failure'
        };
        tracker.inflight.delete(requestId);
        tracker.options.onRequestEnd(completed);
        return response;
      } catch (error) {
        const completed: NetworkRecord = {
          ...startRecord,
          ended_at_unix_ms: tracker.options.now(),
          duration_ms: tracker.options.now() - startedAt,
          status: null,
          result: 'failure'
        };
        tracker.inflight.delete(requestId);
        tracker.options.onRequestEnd(completed);
        throw error;
      }
    };
  }

  private patchXhr(): void {
    this.originalOpen = XMLHttpRequest.prototype.open;
    this.originalSend = XMLHttpRequest.prototype.send;
    const tracker = this;

    XMLHttpRequest.prototype.open = function patchedOpen(
      method: string,
      url: string | URL,
      async?: boolean,
      username?: string | null,
      password?: string | null,
    ): void {
      const requestId = tracker.options.generateId();
      tracker.xhrMetadata.set(this, {
        method,
        url: String(url),
        startedAt: tracker.options.now(),
        requestId
      });
      tracker.originalOpen?.call(this, method, String(url), async ?? true, username ?? null, password ?? null);
    };

    XMLHttpRequest.prototype.send = function patchedSend(
      body?: Document | XMLHttpRequestBodyInit | null,
    ): void {
      const metadata = tracker.xhrMetadata.get(this);
      if (!metadata || !tracker.shouldTrackUrl(metadata.url)) {
        tracker.originalSend?.call(this, body ?? null);
        return;
      }

      const startRecord: NetworkRecord = {
        request_id: metadata.requestId,
        method: metadata.method,
        sanitized_url: tracker.sanitize(metadata.url),
        started_at_unix_ms: metadata.startedAt,
        result: 'pending'
      };
      tracker.inflight.set(metadata.requestId, startRecord);
      tracker.options.onRequestStart(startRecord);

      const finalize = (result: NetworkRecord['result']): void => {
        const completed: NetworkRecord = {
          ...startRecord,
          ended_at_unix_ms: tracker.options.now(),
          duration_ms: tracker.options.now() - metadata.startedAt,
          status: this.status || null,
          result
        };
        tracker.inflight.delete(metadata.requestId);
        tracker.options.onRequestEnd(completed);
      };

      this.addEventListener(
        'loadend',
        () => finalize(this.status >= 200 && this.status < 400 ? 'success' : 'failure'),
        { once: true },
      );
      this.addEventListener('abort', () => finalize('abort'), { once: true });
      this.addEventListener('error', () => finalize('failure'), { once: true });
      tracker.originalSend?.call(this, body ?? null);
    };
  }

  private shouldTrackUrl(url: string): boolean {
    const config = this.options.config.network;
    if (!config) {
      return true;
    }

    if (config.sameOriginOnly) {
      try {
        const parsed = new URL(url, this.options.win.location.href);
        if (parsed.origin !== this.options.win.location.origin) {
          return false;
        }
      } catch {
        return false;
      }
    }

    const denied = (config.denylist ?? []).some((pattern) => url.includes(pattern));
    if (denied) {
      return false;
    }

    if ((config.allowlist ?? []).length > 0) {
      return config.allowlist?.some((pattern) => url.includes(pattern)) ?? false;
    }

    return true;
  }

  private sanitize(url: string): string {
    return sanitizeUrl(url, [
      ...(this.options.config.privacy?.redactQueryParams ?? []),
      ...(this.options.config.network?.redactQueryParams ?? [])
    ]);
  }
}
