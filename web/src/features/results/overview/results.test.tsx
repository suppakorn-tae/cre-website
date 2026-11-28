import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupServer } from 'msw/node';
import { describe, expect, it } from 'vitest';

import { mockProjectId, mockVersions } from '@/features/versions/mocks';

import common from '../../../../messages/th/common.json';
import results from '../../../../messages/th/results.json';
import ui from '../../../../messages/th/ui.json';

import { filterRows } from '../table/filter';
import { dimensionOf, ResultsTable } from '../table/ResultsTable';
import type { IndicatorName } from './api';
import { mockResultItems, mockResults, resultHandlers } from './mocks';
import { OverviewTab } from './OverviewTab';
import { distribution, highCount, topRisks } from './rules';

const wrap = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ results, common, ui }}>
      {node}
    </NextIntlClientProvider>,
  );

const items = mockResultItems();
const names = new Map<string, IndicatorName>(
  items.map((i) => [
    i.indicator_code,
    { name: `ชื่อ ${i.indicator_code}`, unit: 'ครั้ง', factorCode: 'F', factorName: 'ด้านทดสอบ' },
  ]),
);

describe('rules', () => {
  it('lists the top 10 by RM, highest first', () => {
    const top = topRisks(items);
    expect(top).toHaveLength(10);
    for (let i = 1; i < top.length; i++) expect(top[i - 1].rm).toBeGreaterThanOrEqual(top[i].rm);
    expect(top[0].rm).toBe(Math.max(...items.map((x) => x.rm)));
  });

  it('shares per level add up to 100 and keep the stored counts', () => {
    const { summary } = mockResults('v');
    const parts = distribution(summary);
    expect(parts.map((p) => p.level)).toEqual(['VH', 'H', 'M', 'L', 'VL']);
    expect(parts.reduce((s, p) => s + p.pct, 0)).toBeCloseTo(100);
    expect(highCount(summary)).toBe(summary.level_counts.H + summary.level_counts.VH);
  });
});

describe('filterRows', () => {
  it('filters by level and by code or name, any case', () => {
    const level = items[0].level;
    expect(filterRows(items, names, '', level).every((r) => r.level === level)).toBe(true);
    expect(filterRows(items, names, 'ec-hs-2', 'all').map((r) => r.indicator_code)).toContain(
      'EC-HS-2',
    );
    expect(filterRows(items, names, 'ชื่อ EC-MG-1', 'all')).toHaveLength(1);
    expect(filterRows(items, names, 'ไม่มีอยู่จริง', 'all')).toHaveLength(0);
  });
});

describe('overview', () => {
  it('shows the distribution, the top 10 and Thai level names', () => {
    const html = wrap(<OverviewTab results={mockResults('v', items)} names={names} />);
    expect(html).toContain('การกระจายระดับความเสี่ยง');
    expect(html).toContain('10 อันดับความเสี่ยงสูงสุด');
    expect(html).toContain('ด้านทดสอบ');
    expect(html.match(/<tr[ >]/g)).toHaveLength(6); // header + the first 5 of the top 10
    expect(html).toContain('แสดงครบ 10 อันดับ');
    expect(html).toContain('aria-expanded="false"');
  });

  it('shows the donut with the total and a legend row per level (code, count, share)', () => {
    const results = mockResults('v', items);
    const html = wrap(<OverviewTab results={results} names={names} />);
    expect(html).toContain(`<svg viewBox="0 0 40 40" role="img"`);
    expect(html).toContain(`>${results.summary.scored_count}</span>`); // centre
    for (const level of ['VH', 'H', 'M', 'L', 'VL']) {
      expect(html).toMatch(
        new RegExp(`data-level="${level}"[^>]*><span[^>]*><span[^>]*></span>${level}`),
      );
    }
    expect(html).toMatch(/\d+ · \d+\.\d%/);
  });

  it('keeps codes, ranks, RM and levels on one line; the name column wraps', () => {
    const html = wrap(<OverviewTab results={mockResults('v', items)} names={names} />);
    const row = /<tr>(?:(?!<\/tr>)[\s\S])*<td data-label="#"[\s\S]*?<\/tr>/.exec(html)?.[0] ?? '';
    const cells = [...row.matchAll(/<td data-label="([^"]*)"[^>]*class="([^"]*)"/g)];
    const wrapping = cells.filter(([, , cls]) => !cls.includes('nowrap')).map(([, label]) => label);
    expect(wrapping).toEqual(['ตัวชี้วัด']);
  });

  it('shows the factor as a code, with the full name for screen readers', () => {
    const html = wrap(<OverviewTab results={mockResults('v', items)} names={names} />);
    expect(html).toContain(
      '<span aria-hidden="true">F</span><span class="sr-only">ด้านทดสอบ</span>',
    );
  });
});

describe('detail table', () => {
  it('renders every indicator with subscripted headers and a level badge', () => {
    const html = wrap(<ResultsTable items={items} names={names} />);
    expect(html).toContain('RI<sub>C</sub>');
    expect(html).toContain('RI<sub>max</sub>');
    expect(html).toContain(`แสดง ${items.length} จาก ${items.length} ตัวชี้วัด`);
    expect(html.match(/<tr[ >]/g)).toHaveLength(items.length + 1);
    expect(html).toContain('ความเสี่ยงสูง');
  });

  it('reads the dimension of each row from the indicator code', () => {
    expect(dimensionOf('EC-HS-2')).toBe('ec');
    expect(dimensionOf('SO-XX-1')).toBe('so');
    expect(dimensionOf('EV-AB-3')).toBe('ev');
    expect(dimensionOf('ZZ-1')).toBeUndefined();
    const html = wrap(<ResultsTable items={items} names={names} />);
    expect(html.match(/<tr[^>]*data-dim="(ec|so|ev)"/g)).toHaveLength(items.length);
  });
});

describe('mock results api', () => {
  const server = setupServer(...resultHandlers);
  const base = `http://localhost/api/v1/projects/${mockProjectId}/versions`;

  it('answers submitted versions and 404s the results of a draft', async () => {
    server.listen({ onUnhandledFrame: 'error' });
    try {
      const [v3, , v1] = mockVersions();
      const ok = await fetch(`${base}/${v3.id}/results`);
      expect(ok.status).toBe(200);
      expect((await ok.json()).items).toHaveLength(items.length);
      expect((await fetch(`${base}/${v1.id}`)).status).toBe(200);
      expect((await fetch(`${base}/${v1.id}/results`)).status).toBe(404);
    } finally {
      server.close();
    }
  });
});
