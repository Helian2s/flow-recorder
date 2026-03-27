import { describe, expect, it } from 'vitest';

import { captureElementValue } from '../src/redaction-engine';
import { DEFAULT_CONFIG } from '../src/utils';

describe('captureElementValue', () => {
  it('omits password inputs by default', () => {
    document.body.innerHTML = `<input id="password" name="password" type="password" value="super-secret" />`;
    const input = document.getElementById('password') as HTMLInputElement;

    const result = captureElementValue(input, DEFAULT_CONFIG, 'gtm');

    expect(result.capturedValue).toMatchObject({
      mode: 'omitted',
      length: 'super-secret'.length
    });
    expect(result.redaction.redacted).toBe(true);
  });
});
