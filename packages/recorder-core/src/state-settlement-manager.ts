export interface SettlementResult {
  reason: 'quiet-window' | 'timeout';
  settledAt: number;
}

export interface StateSettlementManagerOptions {
  domQuietMs: number;
  networkIdleMs: number;
  maxSettleWaitMs: number;
  now?: () => number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  getInFlightRequests: () => number;
  onSettlingStart: (reason: string) => void;
  onSettled: (result: SettlementResult) => void;
}

export class StateSettlementManager {
  private readonly now: () => number;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly clearTimeoutImpl: typeof clearTimeout;
  private dirtySince = 0;
  private lastMutationAt = 0;
  private lastNetworkActivityAt = 0;
  private settling = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: StateSettlementManagerOptions) {
    this.now = options.now ?? Date.now;
    this.setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
    this.clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
  }

  markDirty(reason: string): void {
    const now = this.now();
    if (!this.settling) {
      this.settling = true;
      this.dirtySince = now;
      this.options.onSettlingStart(reason);
    }
    this.lastMutationAt = now;
    this.schedule();
  }

  noteMutation(): void {
    this.lastMutationAt = this.now();
    this.schedule();
  }

  noteNetworkStart(): void {
    this.lastNetworkActivityAt = this.now();
    this.schedule();
  }

  noteNetworkEnd(): void {
    this.lastNetworkActivityAt = this.now();
    this.schedule();
  }

  stop(): void {
    if (this.timer) {
      this.clearTimeoutImpl(this.timer);
      this.timer = null;
    }
    this.settling = false;
  }

  private schedule(): void {
    if (!this.settling) {
      return;
    }

    if (this.timer) {
      this.clearTimeoutImpl(this.timer);
    }

    const delay = Math.min(this.options.domQuietMs, this.options.networkIdleMs, 100);
    this.timer = this.setTimeoutImpl(() => this.check(), delay);
  }

  private check(): void {
    if (!this.settling) {
      return;
    }

    const now = this.now();
    const domQuiet = now - this.lastMutationAt >= this.options.domQuietMs;
    const networkQuiet =
      this.options.getInFlightRequests() === 0 &&
      now - this.lastNetworkActivityAt >= this.options.networkIdleMs;
    const timedOut = now - this.dirtySince >= this.options.maxSettleWaitMs;

    if (timedOut) {
      this.finish('timeout');
      return;
    }

    if (domQuiet && networkQuiet) {
      this.finish('quiet-window');
      return;
    }

    this.schedule();
  }

  private finish(reason: SettlementResult['reason']): void {
    this.settling = false;
    if (this.timer) {
      this.clearTimeoutImpl(this.timer);
      this.timer = null;
    }
    this.options.onSettled({
      reason,
      settledAt: this.now()
    });
  }
}
