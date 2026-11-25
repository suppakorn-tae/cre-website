import { describe, expect, it } from 'vitest';

import { PAD_X, plotWidth } from './chartBox';
import { plotPoints } from './rules';

describe('plotWidth', () => {
  it('leaves room on both sides for the first and last label', () => {
    expect(plotWidth(640)).toBe(640 - PAD_X * 2);
  });

  it('never returns less than one pixel', () => {
    expect(plotWidth(0)).toBe(1);
  });

  it('keeps every point inside the box', () => {
    const width = 390 - 2 * 16;
    const points = plotPoints([2, 3, null, 4], plotWidth(width), 100, 5);
    for (const p of points) {
      if (!p) continue;
      expect(p.x + PAD_X).toBeGreaterThanOrEqual(PAD_X);
      expect(p.x + PAD_X).toBeLessThanOrEqual(width - PAD_X);
    }
  });
});
