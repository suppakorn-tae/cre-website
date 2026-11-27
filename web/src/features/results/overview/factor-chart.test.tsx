import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import results from '../../../../messages/th/results.json';
import ui from '../../../../messages/th/ui.json';

import { FactorChart } from './FactorChart';
import { mockResults } from './mocks';
import {
  chartPct,
  factorSeries,
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
  items: ReturnType<typeof mockResults>['items'] = [],
) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ results, ui }}>
      <FactorChart averages={averages} items={items} names={new Map()} cutoffs={cutoffs} />
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
    expect(html.match(/<li class="[^"]*factorCol/g)).toHaveLength(3);
    for (const code of ['EC-MG', 'EC-TC', 'EV-EV']) expect(html).toContain(code);
    expect(html).toContain('2.78');
    expect(html).toContain('4.20');
  });

  it('draws the mock response as 11 bars', () => {
    const html = render(mockResults('v').factor_averages);
    expect(html.match(/<li class="[^"]*factorCol/g)).toHaveLength(11);
  });

  it('marks only bars that reach the H line', () => {
    const html = render(averages);
    expect(html.match(/data-high="true"/g)).toHaveLength(4); // li + RM bar for two factors
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
    expect(html).toContain('aria-label="2.78 EC-MG: RM เฉลี่ย 2.78 ระดับ M (ความเสี่ยงปานกลาง)"');
    expect(html).toContain('ชี้ที่แท่งเพื่อดูค่า RL');
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

  it('titles the chart with RI_max as a subscript', () => {
    expect(render(averages)).toContain('ค่าเฉลี่ย RL, RI<sub>max</sub> และ RM รายด้าน');
  });
});

describe('factor series', () => {
  const row = (code: string, rl: number, ri_max: number) =>
    ({ indicator_code: code, rl, ri_max, rm: Math.sqrt(rl * ri_max) }) as never;
  const averages = [
    { factor_code: 'EC-MG', scored_count: 2, average_rm: 2.5 },
    { factor_code: 'SO-SO', scored_count: 1, average_rm: 3 },
    { factor_code: 'EV-EV', scored_count: 1, average_rm: 4 },
  ];
  const items = [row('EC-MG-1', 2, 3), row('EC-MG-4', 4, 5), row('SO-SO-2', 3, 3)];

  it('averages RL and RI_max per factor from the stored rows, keeping the stored RM', () => {
    const [mg, so] = factorSeries(averages, items, new Map());
    expect(mg).toEqual({
      factorCode: 'EC-MG',
      scoredCount: 2,
      averageRm: 2.5,
      averageRl: 3,
      averageRiMax: 4,
    });
    expect(so.averageRl).toBe(3);
    expect(so.averageRiMax).toBe(3);
  });

  it('leaves RL and RI_max out when no row of the factor is loaded', () => {
    const ev = factorSeries(averages, items, new Map())[2];
    expect(ev.averageRl).toBeUndefined();
    expect(ev.averageRiMax).toBeUndefined();
  });

  it('groups by the catalogue factor when the names are known', () => {
    const names = new Map([['X-1', { factorCode: 'EV-EV' }]]);
    const ev = factorSeries(averages, [row('X-1', 2, 4)], names)[2];
    expect(ev.averageRl).toBe(2);
    expect(ev.averageRiMax).toBe(4);
  });

  it('matches the mock response: one series per factor, means within 1 to 5', () => {
    const r = mockResults('v');
    const series = factorSeries(r.factor_averages, r.items, new Map());
    expect(series).toHaveLength(11);
    for (const s of series) {
      expect(s.averageRl).toBeGreaterThanOrEqual(1);
      expect(s.averageRiMax).toBeLessThanOrEqual(5);
    }
  });
});

describe('factor chart (wireframe)', () => {
  const r = mockResults('v');
  const html = render(r.factor_averages, r.level_cutoffs, r.items);

  it('draws RL, RI_max and RM bars for every factor', () => {
    expect(html.match(/data-series="rl"/g)).toHaveLength(11);
    expect(html.match(/data-series="ri"/g)).toHaveLength(11);
    expect(html.match(/data-series="rm"/g)).toHaveLength(11);
  });

  it('shows the three chips, and the factor legend', () => {
    expect(html).toContain('RM (แท่งกว้าง)');
    expect(html).toMatch(/<ul[^>]*factorNames/);
  });

  it('puts all three values in the text alternative', () => {
    expect(html).toMatch(/aria-label="[^"]*RL [\d.]+[^"]*RI สูงสุด [\d.]+[^"]*RM [\d.]+/);
  });

  it('staggers the grow-in by factor and drops motion for reduced motion', () => {
    expect(html).toContain('--i:10');
    const css = readFileSync(join(__dirname, 'results.module.css'), 'utf8');
    expect(css).toMatch(
      /prefers-reduced-motion: reduce\)[^}]*\{[\s\S]*factorBarFill[\s\S]*animation: none/,
    );
  });
});

describe('factor chart legend swatches', () => {
  const html = render([{ factor_code: 'EC-MG', scored_count: 5, average_rm: 2.78 }]);
  const css = readFileSync(join(__dirname, 'results.module.css'), 'utf8');
  const rule = (selector: string) =>
    new RegExp(`${selector.replace(/[[\]'.>]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? '';

  it('gives each chip a decorative swatch', () => {
    for (const key of ['rl', 'ri', 'rm']) {
      expect(html).toMatch(new RegExp(`data-swatch="${key}"[^>]*aria-hidden="true"`));
    }
    expect(html.match(/<span data-level="(VL|L|M|H|VH)"><\/span>/g)).toHaveLength(5);
  });

  it('paints the RL and RI_max swatches with their bar properties', () => {
    expect(rule(".factorSwatch[data-swatch='rl']")).toContain('background: var(--factor-rl)');
    expect(rule(".factorSwatch[data-swatch='ri']")).toContain('background: var(--factor-ri)');
    expect(rule(".factorSlot[data-series='rl'] .factorBarFill")).toContain('var(--factor-rl)');
    expect(rule(".factorSlot[data-series='ri'] .factorBarFill")).toContain('var(--factor-ri)');
  });

  it('paints the RM swatch with the five level colours', () => {
    for (const l of ['vl', 'l', 'm', 'h', 'vh']) {
      expect(rule(`.factorSwatch[data-swatch='rm'] > [data-level='${l.toUpperCase()}']`)).toContain(
        `background: var(--level-${l})`,
      );
    }
  });

  it('keeps both greys visible on the chips and on the bars', () => {
    expect(css).toMatch(/\.factorHead,\s*\.factorChart \{[^}]*--factor-rl: #7f8c9e;/);
    expect(css).toMatch(/\.factorHead,\s*\.factorChart \{[^}]*--factor-ri: #4f5d70;/);
  });
});
