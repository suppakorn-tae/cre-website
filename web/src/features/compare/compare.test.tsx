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
    expect(trend).toHaveLength(4);
    const cmp = await fetchComparison('p', trend[1].version_id, trend[2].version_id);
    expect(cmp.base.version_no).toBe(2);
    expect(cmp.target.version_no).toBe(3);
    expect(cmp.level_changes).toHaveLength(3);
    const rm = await fetchIndicatorRm('p', ['EC-TC']);
    expect(rm.indicators.map((i) => i.indicator_code)).toEqual(['EC-TC-1']);
  });
});

describe('TrendCharts', () => {
  it('draws the RM line, level bars and Thai labels with no gap crash on a draft', () => {
    const html = wrap(<TrendCharts points={mockTrend()} />);
    expect(html).toContain('แนวโน้มทุกเวอร์ชัน');
    expect(html).toContain('เวอร์ชัน 4');
    expect(html).toContain('<path');
    expect(html).toContain('ความเสี่ยงสูงมาก 2');
  });
});

describe('catalogue names', () => {
  it('maps indicator and factor codes to Thai names', async () => {
    const names = await fetchNames();
    expect(names.indicators.get('EC-MG-1')).toContain('การประสานงาน');
    expect(names.factors.get('EC-MG')).toBeTruthy();
  });
});
