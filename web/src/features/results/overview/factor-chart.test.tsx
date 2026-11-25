import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import results from '../../../../messages/th/results.json';

import { FactorChart } from './FactorChart';
import { mockResults } from './mocks';
import { chartPct, FALLBACK_H_LINE_RM, hLineRm, reachesH } from './rules';

function render(
  averages: ReturnType<typeof mockResults>['factor_averages'],
  cutoffs?: ReturnType<typeof mockResults>['level_cutoffs'],
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ results }}>
      <FactorChart averages={averages} names={new Map()} cutoffs={cutoffs} />
    </NextIntlClientProvider>,
  );
}

describe('factor chart', () => {
  const averages = [
    { factor_code: 'EC-MG', scored_count: 5, average_rm: 2.78 },
    { factor_code: 'EC-TC', scored_count: 4, average_rm: 3.5 },
    { factor_code: 'EV-EV', scored_count: 2, average_rm: 4.2 },
  ];

  it('draws one bar per stored factor average, as given', () => {
    const html = render(averages);
    expect(html.match(/<li /g)).toHaveLength(3);
    for (const code of ['EC-MG', 'EC-TC', 'EV-EV']) expect(html).toContain(code);
    expect(html).toContain('2.78');
    expect(html).toContain('4.20');
  });

  it('draws the mock response as 11 bars', () => {
    const html = render(mockResults('v').factor_averages);
    expect(html.match(/<li /g)).toHaveLength(11);
  });

  it('marks only bars that reach the H line', () => {
    const html = render(averages);
    expect(html.match(/data-high="true"/g)).toHaveLength(4); // li + bar for two factors
    expect(html).toContain('ระดับสูง ≥ 3.5');
    expect(html).toContain('data-testid="h-line"');
  });

  it('places the line and bars on the 1 to 5 scale', () => {
    expect(chartPct(1)).toBe(0);
    expect(chartPct(5)).toBe(100);
    expect(chartPct(FALLBACK_H_LINE_RM)).toBe(62.5);
    expect(reachesH(3.49)).toBe(false);
    expect(reachesH(3.5)).toBe(true);
    expect(render(averages)).toContain('bottom:62.5%');
  });

  it('draws the H line at the cut-off from the response', () => {
    const cutoffs = { l: 1.5, m: 2.5, h: 4, vh: 4.5 };
    expect(hLineRm(cutoffs)).toBe(4);
    const html = render(averages, cutoffs);
    expect(html).toContain('ระดับสูง ≥ 4');
    expect(html).toContain('bottom:75%'); // (4 - 1) / 4
    expect(html.match(/data-high="true"/g)).toHaveLength(2); // only 4.2 reaches 4
  });

  it('falls back to 3.5 when the response has no cut-offs', () => {
    expect(hLineRm(undefined)).toBe(3.5);
    expect(render(averages, undefined)).toContain('bottom:62.5%');
  });
});
