import { describe, expect, it } from 'vitest';

import { IdentityManager } from '../src/identity-manager';
import { DEFAULT_CONFIG } from '../src/utils';

describe('IdentityManager', () => {
  it('persists visitor ids and rolls sessions after timeout', () => {
    let currentTime = 1_000;
    let counter = 0;
    const generateId = (): string => `id_${++counter}`;

    const manager = new IdentityManager({
      win: window,
      now: () => currentTime,
      generateId,
      config: DEFAULT_CONFIG
    });

    const first = manager.getCurrentIds();
    expect(first.visitorId).toBe('id_1');

    currentTime += (DEFAULT_CONFIG.sessionTimeoutMs ?? 0) + 1;
    manager.touch();
    const next = manager.getCurrentIds();

    expect(next.visitorId).toBe(first.visitorId);
    expect(next.sessionId).not.toBe(first.sessionId);
  });
});
