import { NextIntlClientProvider } from 'next-intl';
import { setupServer } from 'msw/node';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import compare from '../../../messages/th/compare.json';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client')>();
  const client = original.createApiClient({
    baseUrl: 'http://localhost/api/v1',
    fetch: (input) => globalThis.fetch(input),
  });
  return { ...original, browserApi: () => client };
});

import { fetchComparison, fetchIndicatorRm, fetchTrend } from './api';
import { catalogueHandlers } from '../../mocks/catalogue';
import { mockVersions } from '@/features/versions/mocks';
import { createCompareHandlers, mockTrend } from './mocks';
import { fetchNames } from './names';
import { TrendCharts } from './TrendCharts';

const server = setupServer(...createCompareHandlers(), ...catalogueHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ compare }}>
      {node}
    </NextIntlClientProvider>,
  );

describe('compare api', () => {
  it('reads trend, comparison and filtered indicator RM from the mocks', async () => {
    const trend = await fetchTrend('p');
    expect(trend.map((p) => p.version_no)).toEqual([1, 2, 3]);
    const cmp = await fetchComparison('p', trend[1].version_id, trend[2].version_id);
    expect(cmp.base.version_no).toBe(2);
    expect(cmp.target.version_no).toBe(3);
    expect(cmp.target.progress_at_submit).toBe(45);
    expect(cmp.level_changes).toHaveLength(3);
    const rm = await fetchIndicatorRm('p', ['EC-TC']);
    expect(rm.indicators).toHaveLength(5);
    expect(new Set(rm.indicators.map((i) => i.factor_code))).toEqual(new Set(['EC-TC']));
  });

  it('agrees with the version mocks on the figures of each version', () => {
    const [v3, v2] = mockVersions();
    const points = mockTrend();
    expect(points[2]).toMatchObject({
      avg_rm: v3.average_rm,
      h_vh_count: (v3.high_count ?? 0) + (v3.very_high_count ?? 0),
      level_distribution: v3.level_counts,
    });
    expect(points[1].avg_rm).toBe(v2.average_rm);
    expect(points[0]).toMatchObject({ status: 'draft', avg_rm: null, level_distribution: null });
  });
});

describe('TrendCharts', () => {
  it('draws bars, the RM line and a text alternative, with an empty slot for the draft', () => {
    const html = wrap(
      <TrendCharts points={mockTrend()} progress={{ [mockTrend()[2].version_id]: 45 }} />,
    );
    expect(html).toContain('แนวโน้มข้ามเวอร์ชัน');
    expect(html).toContain('<path');
    expect(html).toContain('ไม่ได้ส่ง');
    expect(html).toContain('(45 %)');
    // The visually hidden table repeats the figures.
    expect(html).toContain('<table');
    expect(html).toContain('2.71');
  });

  it('puts the level counts in the segments of the distribution', () => {
    const html = wrap(<TrendCharts points={mockTrend()} />);
    expect(html).toContain('การกระจายระดับความเสี่ยงของแต่ละเวอร์ชัน (55 ตัวชี้วัด)');
    expect(html).toContain('ความเสี่ยงสูงมาก 2');
    expect(html).toContain('ไม่ได้ส่ง – ไม่มีผล');
  });
});

describe('catalogue names', () => {
  it('maps indicator and factor codes to Thai names', async () => {
    const names = await fetchNames();
    expect(names.indicators.get('EC-MG-1')).toContain('การประสานงาน');
    expect(names.factors.get('EC-MG')).toBeTruthy();
  });
});
