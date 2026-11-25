import { describe, expect, it } from 'vitest';

import seed from '../../../../../backend/seed/cre-indicators.json';

import { directionOf, getRlStore } from './mocks';

describe('directionOf', () => {
  it('is normal for ascending thresholds and inverse for descending ones', () => {
    expect(directionOf([1, 2, 3, 4, 5])).toBe('normal');
    expect(directionOf([5, 4, 3, 2, 1])).toBe('inverse');
  });

  it('skips unset slots, as in the a-c and c-e patterns', () => {
    expect(directionOf([1, 2, 3, null, null])).toBe('normal');
    expect(directionOf([null, null, 9, 5, 1])).toBe('inverse');
  });

  it('refuses thresholds that are flat, mixed or too few', () => {
    expect(() => directionOf([1, 1, 2, 3, 4])).toThrow();
    expect(() => directionOf([1, 3, 2, 4, 5])).toThrow();
    expect(() => directionOf([1, 2, null, null, null])).toThrow();
  });
});

describe('seeded RL directions', () => {
  it('mark the indicators with decreasing thresholds inverse', () => {
    const byCode = new Map(getRlStore().map((r) => [r.indicator_code, r.direction]));
    for (const code of ['EC-MG-5', 'EC-CO-5', 'EC-RS-1']) expect(byCode.get(code)).toBe('inverse');
    expect(byCode.get('EC-MG-1')).toBe('normal');
  });

  it('agree with the order of the seeded values for all 55 indicators', () => {
    for (const row of getRlStore()) {
      const i = seed.indicators.find((x) => x.group_id === row.indicator_code)!;
      const values = [i.a, i.b, i.c, i.d, i.e].filter((v): v is number => typeof v === 'number');
      const sign = Math.sign(values[1] - values[0]);
      expect(row.direction).toBe(sign > 0 ? 'normal' : 'inverse');
    }
  });
});
