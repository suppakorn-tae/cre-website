import { describe, expect, it } from 'vitest';

import { limitState } from './limit';

describe('limitState', () => {
  it('is not at the limit below it', () => {
    expect(limitState(2, 3)).toEqual({ count: 2, max: 3, atLimit: false });
    expect(limitState(0, 3).atLimit).toBe(false);
  });

  it('is at the limit when the count equals the most', () => {
    expect(limitState(3, 3).atLimit).toBe(true);
  });

  it('stays at the limit above it, as when the limit was lowered', () => {
    expect(limitState(5, 3).atLimit).toBe(true);
  });
});
