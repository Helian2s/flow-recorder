import { describe, expect, it } from 'vitest';

import type { TransportBatch } from '@flow-recorder/schema';
import type { EventTransport } from '@flow-recorder/transport';

import { createRecorder } from '@flow-recorder/recorder-core';

describe('shared event shape', () => {
  it('emits matching event keys in GTM and extension-local modes', () => {
    document.body.innerHTML = `<button id="cta">Click me</button>`;
    const button = document.getElementById('cta') as HTMLButtonElement;

    const run = (mode: 'gtm' | 'extension-local') => {
      const batches: TransportBatch[] = [];
      const transport: EventTransport = {
        send: async (batch) => {
          batches.push(batch);
        }
      };

      const recorder = createRecorder({
        win: window,
        doc: document,
        transport
      });

      recorder.start({
        endpoint: '',
        mode,
        capture: {
          network: false,
          scroll: false,
          visibilityContext: true,
          snapshots: 'off'
        },
        autoStart: true
      });

      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      recorder.stop();
      return recorder
        .getState()
        .session_export.events.find((event) => event.event_type === 'click');
    };

    const gtmEvent = run('gtm');
    const extensionEvent = run('extension-local');

    expect(gtmEvent).toBeDefined();
    expect(extensionEvent).toBeDefined();
    expect(Object.keys(gtmEvent ?? {}).sort()).toEqual(Object.keys(extensionEvent ?? {}).sort());
  });
});
