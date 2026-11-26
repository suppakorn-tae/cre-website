import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DonutChart, GAP, centreCount, donutArcs, drawnArc, shouldAnimate } from './DonutChart';

const segments = [
  { key: 'a', value: 1, color: 'red' },
  { key: 'b', value: 0, color: 'green' },
  { key: 'c', value: 3, color: 'blue' },
];

describe('donutArcs', () => {
  it('gives each non-empty segment its share of a 100-long ring, in order', () => {
    const arcs = donutArcs(segments);
    expect(arcs.map((a) => a.key)).toEqual(['a', 'c']);
    expect(arcs[0]).toMatchObject({ length: 25, offset: 0 });
    expect(arcs[1]).toMatchObject({ length: 75, offset: 25 });
  });

  it('draws no arc when everything is zero', () => {
    expect(donutArcs([{ key: 'a', value: 0, color: 'red' }])).toEqual([]);
  });
});

describe('DonutChart', () => {
  it('names the ring in text and shows the centre', () => {
    const html = renderToStaticMarkup(
      <DonutChart segments={segments} label="สรุป" centre="4" caption="รายการ" />,
    );
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="สรุป"');
    expect(html).toContain('>4</span>');
    expect(html).toContain('stroke="blue"');
  });
});

describe('gaps', () => {
  it('leaves a 2 degree gap between drawn arcs and none for a zero value', () => {
    const arcs = donutArcs(segments);
    const [a, c] = arcs.map((arc) => drawnArc(arc, arcs.length));
    const gapAfterA = c.offset - (a.offset + a.length);
    const gapAfterC = 100 + a.offset - (c.offset + c.length);
    expect(GAP).toBeCloseTo(0.5556, 3);
    expect(gapAfterA).toBeCloseTo(GAP, 6);
    expect(gapAfterC).toBeCloseTo(GAP, 6);
    const html = renderToStaticMarkup(<DonutChart segments={segments} label="x" centre="4" />);
    expect(html.match(/stroke-dasharray/g)).toHaveLength(3); // sweep mask + two arcs, none for 0
    expect(html).not.toContain('stroke="green"');
  });

  it('keeps a lone segment as a full ring', () => {
    const [arc] = donutArcs([{ key: 'a', value: 5, color: 'red' }]);
    expect(drawnArc(arc, 1)).toEqual({ length: 100, offset: 0 });
  });
});

describe('motion', () => {
  it('does not move under reduced motion or animate=false', () => {
    expect(shouldAnimate(true, false)).toBe(true);
    expect(shouldAnimate(true, true)).toBe(false);
    expect(shouldAnimate(false, false)).toBe(false);
    const off = renderToStaticMarkup(
      <DonutChart segments={segments} label="x" centre="1,234" animate={false} />,
    );
    expect(off).not.toContain('donutSweep');
    expect(off).toContain('>1,234</span>');
  });

  it('sweeps on mount by default', () => {
    const html = renderToStaticMarkup(<DonutChart segments={segments} label="x" centre="4" />);
    expect(html).toContain('<mask');
    expect(html).toContain('donutSweep');
  });

  it('counts up only a plain whole number', () => {
    expect(centreCount('1,234')).toBe(1234);
    expect(centreCount(42)).toBe(42);
    expect(centreCount('4.5')).toBeNull();
    expect(centreCount('n/a')).toBeNull();
  });
});
