import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import results from '../../../../messages/th/results.json';
import ui from '../../../../messages/th/ui.json';

import { FactorChart } from './FactorChart';
import { mockResults } from './mocks';
import {
  chartPct,
  FALLBACK_H_LINE_RM,
  hLineRm,
  LABEL_PCT,
  levelOfMean,
  reachesH,
  valuePlacement,
} from './rules';

function render(
  averages: ReturnType<typeof mockResults>['factor_averages'],
  cutoffs?: ReturnType<typeof mockResults>['level_cutoffs'],
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ results, ui }}>
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
    expect(html).toContain('H ≥ 3.5');
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
    expect(html).toContain('H ≥ 4');
    expect(html).toContain('bottom:75%'); // (4 - 1) / 4
    expect(html.match(/data-high="true"/g)).toHaveLength(2); // only 4.2 reaches 4
  });

  it('falls back to 3.5 when the response has no cut-offs', () => {
    expect(hLineRm(undefined)).toBe(3.5);
    expect(render(averages, undefined)).toContain('bottom:62.5%');
  });

  it('keeps value labels above the bar when the line is clear of them', () => {
    expect(valuePlacement(2.78)).toEqual({ mode: 'above', bottomPct: chartPct(2.78) });
    expect(valuePlacement(3.5)).toEqual({ mode: 'above', bottomPct: 62.5 }); // on the line
    expect(valuePlacement(4.2).mode).toBe('above');
    expect(valuePlacement(3.0).mode).toBe('above'); // line is above the label
  });

  it('moves a label inside the bar when the line would cross it', () => {
    for (const rm of [3.2, 3.4, 3.49]) {
      const place = valuePlacement(rm);
      expect(place.mode).toBe('inside');
      expect(place.bottomPct).toBeCloseTo(chartPct(rm) - LABEL_PCT);
      expect(place.bottomPct + LABEL_PCT).toBeLessThanOrEqual(chartPct(3.5));
    }
  });

  it('puts a label over the line when the bar is too short to hold it', () => {
    const place = valuePlacement(1.2, 1.5); // line at 12.5%, bar top at 5%
    expect(place.mode).toBe('above');
    expect(place.bottomPct).toBeGreaterThan(chartPct(1.5));
  });

  it('never overlaps the line for any value, at any cut-off', () => {
    for (const h of [2.5, 3, 3.5, 4, 4.5]) {
      const line = chartPct(h);
      for (let rm = 1; rm <= 5; rm += 0.01) {
        const { bottomPct } = valuePlacement(rm, h);
        const top = bottomPct + LABEL_PCT;
        // the label box either ends below the line or starts above it
        expect(top <= line || bottomPct >= line).toBe(true);
      }
    }
  });

  it('marks the placement on the rendered label', () => {
    const html = render([{ factor_code: 'EC-TC', scored_count: 4, average_rm: 3.4 }]);
    expect(html).toContain('data-placement="inside"');
    expect(html).toContain('bottom:50%');
  });

  it('colours each bar by the level its mean falls in, with the level in text', () => {
    const html = render(averages);
    expect(html).toMatch(/data-level="M"/); // 2.78
    expect(html).toMatch(/data-level="H"/); // 3.5
    expect(html).toMatch(/data-level="H"/); // 4.2
    // text alternative: factor, value and level (code and name), not colour alone
    expect(html).toContain('aria-label="EC-MG: RM เฉลี่ย 2.78 ระดับ M (ความเสี่ยงปานกลาง)"');
    expect(html).toContain('ชื่อด้านแสดงเมื่อชี้ที่แท่ง');
  });

  it('maps a mean to a level with the api cut-offs', () => {
    const cutoffs = { l: 1.5, m: 2.5, h: 3.5, vh: 4.5 };
    expect(levelOfMean(1.2, cutoffs)).toBe('VL');
    expect(levelOfMean(1.5, cutoffs)).toBe('L');
    expect(levelOfMean(2.5, cutoffs)).toBe('M');
    expect(levelOfMean(3.5, cutoffs)).toBe('H');
    expect(levelOfMean(4.5, cutoffs)).toBe('VH');
    expect(levelOfMean(3.4, { ...cutoffs, h: 3 })).toBe('H');
    expect(levelOfMean(3.4)).toBe('M'); // no cut-offs: defaults
  });
});
