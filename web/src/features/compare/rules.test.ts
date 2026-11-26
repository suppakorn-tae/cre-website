import { describe, expect, it } from 'vitest';

import { mockTrend } from './mocks';
import {
  barAxis,
  defaultBase,
  delta,
  deltaTone,
  firstIndicators,
  linePath,
  submittedVersions,
  visiblePoints,
} from './rules';

const [v1, v2, v3] = mockTrend();

describe('submittedVersions and defaultBase', () => {
  it('keeps only submitted versions, ascending', () => {
    expect(submittedVersions(mockTrend()).map((p) => p.version_no)).toEqual([2, 3]);
  });

  it('compares against the submitted version just before', () => {
    expect(defaultBase(mockTrend(), v3.version_id)).toBe(v2.version_id);
  });

  it('falls back to the nearest newer one when nothing submitted is older', () => {
    expect(defaultBase(mockTrend(), v2.version_id)).toBe(v3.version_id);
  });

  it('has no base with one submitted version, or for an unknown version', () => {
    expect(defaultBase([v1, v3], v3.version_id)).toBeNull();
    expect(defaultBase(mockTrend(), 'nope')).toBeNull();
  });
});

describe('delta and tone', () => {
  it('is signed and null-safe', () => {
    expect(delta(3, 2.5)).toBe(-0.5);
    expect(delta(null, 2)).toBeNull();
  });

  it('calls a fall of a risk figure good and a rise bad, and the opposite for progress', () => {
    expect(deltaTone(-0.32, 'lower')).toBe('good');
    expect(deltaTone(5, 'lower')).toBe('bad');
    expect(deltaTone(5, 'higher')).toBe('good');
    expect(deltaTone(-5, 'higher')).toBe('bad');
    expect(deltaTone(0, 'lower')).toBe('same');
  });
});

describe('barAxis', () => {
  it('uses four equal steps so it lines up with the 1 to 5 RM axis', () => {
    expect(barAxis(18)).toEqual({ top: 20, ticks: [0, 5, 10, 15, 20] });
    expect(barAxis(0)).toEqual({ top: 4, ticks: [0, 1, 2, 3, 4] });
    expect(barAxis(55).top).toBe(80);
  });
});

describe('visiblePoints', () => {
  it('can hide the versions that were never submitted', () => {
    expect(visiblePoints(mockTrend(), 'all')).toHaveLength(3);
    expect(visiblePoints(mockTrend(), 'submitted').map((p) => p.version_no)).toEqual([2, 3]);
  });
});

describe('firstIndicators', () => {
  it('takes the first two of each chosen factor in order', () => {
    const rows = [
      { indicator_code: 'A-1', factor_code: 'A' },
      { indicator_code: 'A-2', factor_code: 'A' },
      { indicator_code: 'A-3', factor_code: 'A' },
      { indicator_code: 'B-1', factor_code: 'B' },
    ];
    expect(firstIndicators(rows, ['B', 'A'])).toEqual(['B-1', 'A-1', 'A-2']);
  });
});

describe('linePath', () => {
  it('lifts the pen over a gap', () => {
    const d = linePath([{ x: 0, y: 1 }, { x: 1, y: 2 }, undefined, { x: 3, y: 3 }]);
    expect(d.match(/M/g)).toHaveLength(2);
  });
});
