import { describe, expect, it } from 'vitest';

import {
  NONE_COLLAPSED,
  isDimensionOpen,
  isFactorOpen,
  toggleDimension,
  toggleFactor,
} from './collapse';

describe('collapse rules', () => {
  it('starts fully open', () => {
    expect(isDimensionOpen(NONE_COLLAPSED, 'EC')).toBe(true);
    expect(isFactorOpen(NONE_COLLAPSED, 'EC', 'EC-MG')).toBe(true);
  });

  it('folding a dimension hides all its factors', () => {
    const c = toggleDimension(NONE_COLLAPSED, 'EC');
    expect(isDimensionOpen(c, 'EC')).toBe(false);
    expect(isFactorOpen(c, 'EC', 'EC-MG')).toBe(false);
    expect(isFactorOpen(c, 'SO', 'SO-CL')).toBe(true);
  });

  it('opening a dimension restores each factor to its own state', () => {
    let c = toggleFactor(NONE_COLLAPSED, 'EC-TC');
    c = toggleDimension(c, 'EC');
    c = toggleDimension(c, 'EC');
    expect(isFactorOpen(c, 'EC', 'EC-MG')).toBe(true);
    expect(isFactorOpen(c, 'EC', 'EC-TC')).toBe(false);
  });

  it('toggles a factor back open', () => {
    const c = toggleFactor(toggleFactor(NONE_COLLAPSED, 'EC-MG'), 'EC-MG');
    expect(isFactorOpen(c, 'EC', 'EC-MG')).toBe(true);
  });
});
