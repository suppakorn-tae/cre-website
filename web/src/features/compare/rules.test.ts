import { describe, expect, it } from 'vitest';

import { defaultPair, delta, linePath, plotPoints, submittedVersions } from './rules';
import { mockTrend } from './mocks';

describe('submittedVersions and defaultPair', () => {
  it('keeps only submitted versions, ascending', () => {
    expect(submittedVersions(mockTrend()).map((p) => p.version_no)).toEqual([1, 2, 3]);
  });
  it('defaults to the two newest submitted versions', () => {
    const pair = defaultPair(mockTrend());
    expect(pair).toEqual({
      base: mockTrend()[1].version_id,
      target: mockTrend()[2].version_id,
    });
  });
  it('is null with fewer than two submitted versions', () => {
    expect(defaultPair(mockTrend().slice(0, 1))).toBeNull();
    expect(defaultPair([mockTrend()[0], mockTrend()[3]])).toBeNull();
  });
});

describe('delta', () => {
  it('is signed and null-safe', () => {
    expect(delta(3, 2.5)).toBe(-0.5);
    expect(delta(null, 2)).toBeNull();
  });
});

describe('plotPoints and linePath', () => {
  it('maps values into the box and leaves gaps for null', () => {
    const pts = plotPoints([0, null, 5], 100, 50, 5);
    expect(pts[0]).toEqual({ x: 0, y: 50 });
    expect(pts[1]).toBeUndefined();
    expect(pts[2]).toEqual({ x: 100, y: 0 });
  });
  it('lifts the pen over a gap', () => {
    const d = linePath(plotPoints([1, 2, null, 3], 90, 50, 5));
    expect(d.match(/M/g)).toHaveLength(2);
  });
});
