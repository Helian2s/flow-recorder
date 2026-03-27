import { describe, expect, it } from 'vitest';

import { generateSelectorCandidates } from '../src/index';

describe('generateSelectorCandidates', () => {
  it('prioritizes explicit testing hooks', () => {
    document.body.innerHTML = `
      <button data-testid="primary-cta" id="signup-button">Start trial</button>
    `;

    const button = document.querySelector('button');
    expect(button).not.toBeNull();

    const candidates = generateSelectorCandidates(button!);
    expect(candidates[0]).toMatchObject({
      strategy: 'data-testid',
      value: 'primary-cta'
    });
    expect(candidates.some((candidate) => candidate.strategy === 'id')).toBe(true);
    expect(candidates.some((candidate) => candidate.strategy === 'text')).toBe(true);
  });
});
