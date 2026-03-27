import type { RecorderConfig, ViewportMetadata } from '@flow-recorder/schema';

export const DEFAULT_CONFIG: RecorderConfig = {
  endpoint: '',
  mode: 'gtm',
  autoStart: true,
  debug: false,
  sessionTimeoutMs: 30 * 60 * 1000,
  identity: {
    strategy: 'anonymous-id',
    storage: 'localStorage',
    cookieName: 'flow_recorder_vid',
    cookieMaxAgeDays: 365,
    cookieEnabled: false
  },
  capture: {
    clicks: true,
    inputs: true,
    keyboard: true,
    scroll: {
      throttleMs: 180,
      idleMs: 180
    },
    network: true,
    visibilityContext: true,
    snapshots: 'balanced'
  },
  privacy: {
    textInputMode: 'masked',
    allowlistSelectors: [],
    denylistSelectors: [],
    denylistFieldNamePatterns: [],
    inputTypeDenylist: ['password', 'hidden'],
    redactQueryParams: ['token', 'auth', 'code'],
    clearTextAllowInExtension: false
  },
  transport: {
    batchSize: 20,
    flushIntervalMs: 3000,
    maxQueueSize: 500,
    retryBackoffMs: [500, 1500, 5000],
    sendBeaconOnHidden: true
  },
  network: {
    sameOriginOnly: false,
    allowlist: [],
    denylist: [],
    attachToActionEvents: false,
    redactQueryParams: []
  },
  settling: {
    domQuietMs: 400,
    networkIdleMs: 300,
    maxSettleWaitMs: 5000
  },
  extension: {
    bridgeChannel: 'FLOW_RECORDER_BATCH',
    tabId: null
  }
};

export function mergeRecorderConfig(
  base: RecorderConfig,
  patch: Partial<RecorderConfig> | undefined,
): RecorderConfig {
  if (!patch) {
    return structuredClone(base);
  }

  return {
    ...base,
    ...patch,
    identity: {
      ...base.identity,
      ...patch.identity
    },
    capture: {
      ...base.capture,
      ...patch.capture,
      scroll:
        typeof patch.capture?.scroll === 'object'
          ? {
              ...(typeof base.capture?.scroll === 'object' ? base.capture.scroll : {}),
              ...patch.capture.scroll
            }
          : patch.capture?.scroll ?? base.capture?.scroll
    },
    privacy: {
      ...base.privacy,
      ...patch.privacy
    },
    transport: {
      ...base.transport,
      ...patch.transport
    },
    network: {
      ...base.network,
      ...patch.network
    },
    settling: {
      ...base.settling,
      ...patch.settling
    },
    extension: {
      ...base.extension,
      ...patch.extension
    }
  };
}

export function createIdFactory(cryptoImpl?: Pick<Crypto, 'getRandomValues'>): () => string {
  return (): string => {
    const buffer = new Uint8Array(16);
    if (cryptoImpl) {
      cryptoImpl.getRandomValues(buffer);
    } else {
      for (let index = 0; index < buffer.length; index += 1) {
        buffer[index] = Math.floor(Math.random() * 256);
      }
    }

    const hex = [...buffer].map((value) => value.toString(16).padStart(2, '0')).join('');
    return `fr_${hex}`;
  };
}

export function getViewport(win: Window): ViewportMetadata {
  return {
    width: win.innerWidth,
    height: win.innerHeight,
    scroll_x: win.scrollX,
    scroll_y: win.scrollY,
    dpr: win.devicePixelRatio || 1
  };
}

export function normalizeText(value: string | null | undefined, maxLength = 120): string | null {
  if (!value) {
    return null;
  }

  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return null;
  }

  return compact.slice(0, maxLength);
}

export function maskValue(value: string): string {
  return value.length === 0 ? '' : `${value[0] ?? ''}${'*'.repeat(Math.max(value.length - 1, 0))}`;
}

export function simpleHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `h_${(hash >>> 0).toString(16)}`;
}

export function sanitizeUrl(value: string, redactParams: string[] = []): string {
  try {
    const url = new URL(value, typeof window === 'undefined' ? 'https://local.invalid' : window.location.href);
    for (const key of redactParams) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, 'REDACTED');
      }
    }
    return `${url.origin}${url.pathname}${url.search}${url.hash}`;
  } catch {
    return value;
  }
}

export function matchesSelectorList(element: Element, selectors: string[] = []): boolean {
  return selectors.some((selector) => {
    try {
      return element.matches(selector) || Boolean(element.closest(selector));
    } catch {
      return false;
    }
  });
}

export function isScrollableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  const style = getComputedStyle(element);
  return /(auto|scroll)/.test(style.overflowY + style.overflowX);
}

export function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
}
