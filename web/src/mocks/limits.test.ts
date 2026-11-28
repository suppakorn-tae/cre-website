// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';

import { MAX_PROJECTS_FLAG, mockLimit } from './limits';

afterEach(() => localStorage.clear());

describe('mockLimit', () => {
  it('uses the fallback without a flag', () => {
    expect(mockLimit(MAX_PROJECTS_FLAG, 50)).toBe(50);
  });

  it('reads a positive integer from the flag, on every call', () => {
    localStorage.setItem(MAX_PROJECTS_FLAG, '3');
    expect(mockLimit(MAX_PROJECTS_FLAG, 50)).toBe(3);
    localStorage.setItem(MAX_PROJECTS_FLAG, '7');
    expect(mockLimit(MAX_PROJECTS_FLAG, 50)).toBe(7);
  });

  it.each(['0', '-1', '2.5', 'abc', ''])('ignores %j', (value) => {
    localStorage.setItem(MAX_PROJECTS_FLAG, value);
    expect(mockLimit(MAX_PROJECTS_FLAG, 50)).toBe(50);
  });
});
