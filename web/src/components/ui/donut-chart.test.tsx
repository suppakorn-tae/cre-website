import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DonutChart, donutArcs } from './DonutChart';

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
