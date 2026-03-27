import type { RecorderConfig, SessionMetadata } from '@flow-recorder/schema';

interface IdentityManagerOptions {
  win: Window;
  now: () => number;
  generateId: () => string;
  config: RecorderConfig;
}

const VISITOR_STORAGE_KEY = 'flow_recorder_visitor_id';
const TAB_STORAGE_KEY = 'flow_recorder_tab_id';

export class IdentityManager {
  private visitorId = '';
  private sessionId = '';
  private pageviewId = '';
  private routeId = '';
  private stateId: string | null = null;
  private tabId: string | null = null;
  private sessionStartedAt = 0;
  private lastActivityAt = 0;
  private config: RecorderConfig;

  constructor(private readonly options: IdentityManagerOptions) {
    this.config = options.config;
    this.visitorId = this.loadVisitorId();
    this.tabId = this.loadTabId();
    this.resetSession();
  }

  updateConfig(config: RecorderConfig): void {
    this.config = config;
  }

  touch(): void {
    const now = this.options.now();
    const timeout = this.config.sessionTimeoutMs ?? 30 * 60 * 1000;

    if (now - this.lastActivityAt > timeout) {
      this.resetSession();
    }

    this.lastActivityAt = now;
  }

  rotateRoute(): string {
    this.routeId = this.options.generateId();
    this.pageviewId = this.options.generateId();
    this.stateId = null;
    return this.routeId;
  }

  rotatePageview(): string {
    this.pageviewId = this.options.generateId();
    this.stateId = null;
    return this.pageviewId;
  }

  rotateState(): string {
    this.stateId = this.options.generateId();
    return this.stateId;
  }

  setStateId(stateId: string | null): void {
    this.stateId = stateId;
  }

  getCurrentIds(): {
    visitorId: string;
    sessionId: string;
    pageviewId: string;
    routeId: string;
    stateId: string | null;
    tabId: string | null;
  } {
    return {
      visitorId: this.visitorId,
      sessionId: this.sessionId,
      pageviewId: this.pageviewId,
      routeId: this.routeId,
      stateId: this.stateId,
      tabId: this.tabId
    };
  }

  createSessionMetadata(mode: SessionMetadata['mode'], currentUrl: string, appId?: string): SessionMetadata {
    return {
      app_id: appId,
      visitor_id: this.visitorId,
      session_id: this.sessionId,
      pageview_id: this.pageviewId,
      route_id: this.routeId,
      state_id: this.stateId,
      tab_id: this.tabId,
      mode,
      started_at_unix_ms: this.sessionStartedAt,
      current_url: currentUrl
    };
  }

  private resetSession(): void {
    const now = this.options.now();
    this.sessionId = this.options.generateId();
    this.pageviewId = this.options.generateId();
    this.routeId = this.options.generateId();
    this.stateId = null;
    this.sessionStartedAt = now;
    this.lastActivityAt = now;
  }

  private loadVisitorId(): string {
    const storagePreference = this.config.identity?.storage ?? 'localStorage';

    if (storagePreference === 'localStorage') {
      const fromLocalStorage = this.readLocalStorage(VISITOR_STORAGE_KEY);
      if (fromLocalStorage) {
        return fromLocalStorage;
      }
    }

    if (this.config.identity?.cookieEnabled) {
      const cookieName = this.config.identity.cookieName ?? 'flow_recorder_vid';
      const fromCookie = this.readCookie(cookieName);
      if (fromCookie) {
        return fromCookie;
      }
    }

    const created = this.options.generateId();
    this.persistVisitorId(created);
    return created;
  }

  private loadTabId(): string | null {
    const existing = this.readSessionStorage(TAB_STORAGE_KEY);
    if (existing) {
      return existing;
    }

    const created = this.options.generateId();
    this.writeSessionStorage(TAB_STORAGE_KEY, created);
    return created;
  }

  private persistVisitorId(visitorId: string): void {
    const storagePreference = this.config.identity?.storage ?? 'localStorage';

    if (storagePreference === 'localStorage') {
      this.writeLocalStorage(VISITOR_STORAGE_KEY, visitorId);
      return;
    }

    if (storagePreference === 'cookie' && this.config.identity?.cookieEnabled) {
      const cookieName = this.config.identity.cookieName ?? 'flow_recorder_vid';
      const maxAgeDays = this.config.identity.cookieMaxAgeDays ?? 365;
      this.options.win.document.cookie = `${cookieName}=${visitorId}; path=/; max-age=${
        maxAgeDays * 24 * 60 * 60
      }`;
    }
  }

  private readLocalStorage(key: string): string | null {
    try {
      return this.options.win.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeLocalStorage(key: string, value: string): void {
    try {
      this.options.win.localStorage.setItem(key, value);
    } catch {}
  }

  private readSessionStorage(key: string): string | null {
    try {
      return this.options.win.sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private writeSessionStorage(key: string, value: string): void {
    try {
      this.options.win.sessionStorage.setItem(key, value);
    } catch {}
  }

  private readCookie(cookieName: string): string | null {
    const match = this.options.win.document.cookie
      .split(';')
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${cookieName}=`));
    return match?.split('=').slice(1).join('=') ?? null;
  }
}
