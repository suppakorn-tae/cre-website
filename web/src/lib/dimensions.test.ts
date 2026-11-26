import { describe, expect, it } from 'vitest';

import { DIMENSIONS, dimensionOf, dimensionStyle, isDimensionCode } from './dimensions';

describe('dimensionOf', () => {
  it.each([
    ['EC-MG', 'EC'],
    ['EC-HS-2', 'EC'],
    ['SO-CM', 'SO'],
    ['EV-WT', 'EV'],
  ])('maps factor %s to %s', (factor, dim) => {
    expect(dimensionOf(factor)).toBe(dim);
  });

  it('accepts a bare dimension code', () => {
    expect(dimensionOf('SO')).toBe('SO');
  });

  it.each(['', 'XX-MG', 'ec-mg', 'ECMG', 'E-C', 'EC_MG'])('returns undefined for %j', (code) => {
    expect(dimensionOf(code)).toBeUndefined();
  });
});

describe('isDimensionCode', () => {
  it('is true only for the three dimensions', () => {
    expect(DIMENSIONS).toEqual(['EC', 'SO', 'EV']);
    expect(isDimensionCode('EC')).toBe(true);
    expect(isDimensionCode('EC-MG')).toBe(false);
  });
});

describe('dimensionStyle', () => {
  it('points at the token variables, never at a literal colour', () => {
    expect(dimensionStyle('EV')).toEqual({
      color: 'var(--dim-ev)',
      tint: 'var(--dim-ev-tint)',
    });
  });

  it('has a distinct pair for every dimension', () => {
    const colours = DIMENSIONS.map((d) => dimensionStyle(d).color);
    expect(new Set(colours).size).toBe(3);
  });
});
