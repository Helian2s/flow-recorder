export interface RouteChange {
  eventType:
    | 'document.load'
    | 'route.change'
    | 'route.hashchange'
    | 'history.pushState'
    | 'history.replaceState'
    | 'history.popstate'
    | 'page.show'
    | 'page.hide'
    | 'visibility.change';
  url: string;
  path: string;
  hash: string;
  title: string;
}

export class RouteTracker {
  private started = false;
  private originalPushState: History['pushState'] | null = null;
  private originalReplaceState: History['replaceState'] | null = null;
  private listeners: Array<() => void> = [];

  constructor(
    private readonly win: Window,
    private readonly onChange: (change: RouteChange) => void,
  ) {}

  start(): void {
    if (this.started) {
      return;
    }

    this.started = true;
    this.patchHistory();
    this.listen('popstate', 'history.popstate');
    this.listen('hashchange', 'route.hashchange');
    this.listen('pageshow', 'page.show');
    this.listen('pagehide', 'page.hide');
    this.win.document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.listeners.push(() =>
      this.win.document.removeEventListener('visibilitychange', this.onVisibilityChange),
    );
    this.onChange(this.createChange('document.load'));
  }

  stop(): void {
    if (!this.started) {
      return;
    }

    this.started = false;
    if (this.originalPushState) {
      this.win.history.pushState = this.originalPushState;
    }
    if (this.originalReplaceState) {
      this.win.history.replaceState = this.originalReplaceState;
    }
    for (const dispose of this.listeners.splice(0)) {
      dispose();
    }
  }

  private patchHistory(): void {
    this.originalPushState = this.win.history.pushState;
    this.originalReplaceState = this.win.history.replaceState;

    const tracker = this;
    this.win.history.pushState = function pushState(...args): void {
      tracker.originalPushState?.apply(this, args);
      tracker.onChange(tracker.createChange('history.pushState'));
      tracker.onChange(tracker.createChange('route.change'));
    };

    this.win.history.replaceState = function replaceState(...args): void {
      tracker.originalReplaceState?.apply(this, args);
      tracker.onChange(tracker.createChange('history.replaceState'));
      tracker.onChange(tracker.createChange('route.change'));
    };
  }

  private listen(eventName: keyof WindowEventMap, eventType: RouteChange['eventType']): void {
    const handler = (): void => {
      this.onChange(this.createChange(eventType));
      if (eventType === 'history.popstate' || eventType === 'route.hashchange') {
        this.onChange(this.createChange('route.change'));
      }
    };
    this.win.addEventListener(eventName, handler);
    this.listeners.push(() => this.win.removeEventListener(eventName, handler));
  }

  private onVisibilityChange = (): void => {
    this.onChange(this.createChange('visibility.change'));
  };

  private createChange(eventType: RouteChange['eventType']): RouteChange {
    return {
      eventType,
      url: this.win.location.href,
      path: this.win.location.pathname,
      hash: this.win.location.hash,
      title: this.win.document.title
    };
  }
}

export function guessRouteTemplate(pathname: string): string {
  return pathname
    .replace(/[0-9]{2,}/g, ':id')
    .replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gi, ':uuid')
    .replace(/\/+/g, '/');
}
