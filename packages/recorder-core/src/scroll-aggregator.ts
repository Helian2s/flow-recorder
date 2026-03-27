export interface ScrollAggregateEvent {
  eventType: 'scroll.start' | 'scroll.progress' | 'scroll.end';
  target: Window | HTMLElement;
  scrollX: number;
  scrollY: number;
  percentX: number;
  percentY: number;
}

interface ScrollAggregatorOptions {
  throttleMs: number;
  idleMs: number;
  now?: () => number;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  onEmit: (event: ScrollAggregateEvent) => void;
}

export class ScrollAggregator {
  private activeTarget: Window | HTMLElement | null = null;
  private lastProgressAt = 0;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly clearTimeoutImpl: typeof clearTimeout;

  constructor(private readonly options: ScrollAggregatorOptions) {
    this.now = options.now ?? Date.now;
    this.setTimeoutImpl = options.setTimeoutImpl ?? setTimeout;
    this.clearTimeoutImpl = options.clearTimeoutImpl ?? clearTimeout;
  }

  handle(target: EventTarget | null): void {
    const resolvedTarget = resolveScrollTarget(target);
    if (!resolvedTarget) {
      return;
    }

    const currentTime = this.now();
    if (this.activeTarget !== resolvedTarget) {
      this.activeTarget = resolvedTarget;
      this.emit('scroll.start', resolvedTarget);
      this.lastProgressAt = currentTime;
    } else if (currentTime - this.lastProgressAt >= this.options.throttleMs) {
      this.emit('scroll.progress', resolvedTarget);
      this.lastProgressAt = currentTime;
    }

    if (this.idleTimer) {
      this.clearTimeoutImpl(this.idleTimer);
    }

    this.idleTimer = this.setTimeoutImpl(() => {
      if (this.activeTarget) {
        this.emit('scroll.end', this.activeTarget);
      }
      this.activeTarget = null;
      this.idleTimer = null;
    }, this.options.idleMs);
  }

  stop(): void {
    if (this.idleTimer) {
      this.clearTimeoutImpl(this.idleTimer);
      this.idleTimer = null;
    }
    this.activeTarget = null;
  }

  private emit(eventType: ScrollAggregateEvent['eventType'], target: Window | HTMLElement): void {
    const position = readScrollPosition(target);
    this.options.onEmit({
      eventType,
      target,
      scrollX: position.scrollX,
      scrollY: position.scrollY,
      percentX: position.percentX,
      percentY: position.percentY
    });
  }
}

function resolveScrollTarget(target: EventTarget | null): Window | HTMLElement | null {
  if (target === window || target instanceof Window) {
    return window;
  }
  if (target instanceof HTMLElement) {
    return target;
  }
  if (target instanceof Document) {
    return window;
  }
  return null;
}

function readScrollPosition(target: Window | HTMLElement): {
  scrollX: number;
  scrollY: number;
  percentX: number;
  percentY: number;
} {
  if (target instanceof Window) {
    const documentElement = target.document.documentElement;
    const maxX = Math.max(documentElement.scrollWidth - target.innerWidth, 1);
    const maxY = Math.max(documentElement.scrollHeight - target.innerHeight, 1);
    return {
      scrollX: target.scrollX,
      scrollY: target.scrollY,
      percentX: target.scrollX / maxX,
      percentY: target.scrollY / maxY
    };
  }

  const maxX = Math.max(target.scrollWidth - target.clientWidth, 1);
  const maxY = Math.max(target.scrollHeight - target.clientHeight, 1);
  return {
    scrollX: target.scrollLeft,
    scrollY: target.scrollTop,
    percentX: target.scrollLeft / maxX,
    percentY: target.scrollTop / maxY
  };
}
