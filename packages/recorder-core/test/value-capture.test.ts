import { describe, expect, it } from 'vitest';

import { captureElementValue } from '../src/redaction-engine';
import { DEFAULT_CONFIG, mergeRecorderConfig } from '../src/utils';

describe('value capture modes', () => {
  it('allows raw input in extension mode only when explicitly enabled', () => {
    document.body.innerHTML = `<input id="safe-input" name="nickname" value="Delta" />`;
    const input = document.getElementById('safe-input') as HTMLInputElement;
    input.value = 'Delta';

    const config = mergeRecorderConfig(DEFAULT_CONFIG, {
      privacy: {
        textInputMode: 'raw',
        clearTextAllowInExtension: true
      }
    });

    const gtmResult = captureElementValue(input, config, 'gtm');
    const extensionResult = captureElementValue(input, config, 'extension-local');

    expect(gtmResult.capturedValue?.mode).not.toBe('raw');
    expect(extensionResult.capturedValue?.mode).toBe('raw');
  });
});
