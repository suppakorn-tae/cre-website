import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupServer } from 'msw/node';
import { describe, expect, it } from 'vitest';

import { mockProjectId, mockVersions } from '@/features/versions/mocks';

import advice from '../../../../messages/th/advice.json';
import common from '../../../../messages/th/common.json';
import results from '../../../../messages/th/results.json';
import ui from '../../../../messages/th/ui.json';

import { AdviceLists } from '../advice/AdviceLists';
import { HeatmapTab } from '../heatmap/HeatmapTab';
import { heatRows } from '../heatmap/rules';
import type { IndicatorName } from '../overview/api';
import { mockResultItems } from '../overview/mocks';
import { withStrategy } from '../strategy/api';
import { StrategyPicker } from '../strategy/StrategyPicker';
import { HvhTab } from './HvhTab';
import { hvhHandlers, mockResultsWithAdvice } from './mocks';
import { highRisks } from './rules';

const wrap = (node: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="th" messages={{ advice, results, common, ui }}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

const items = mockResultItems();
const names = new Map<string, IndicatorName>(
  items.map((i) => [
    i.indicator_code,
    {
      name: `ชื่อ ${i.indicator_code}`,
      factorCode: i.indicator_code.slice(0, 5),
      factorName: `ด้าน ${i.indicator_code.slice(0, 5)}`,
    },
  ]),
);
const [latest, older] = mockVersions();

describe('heat map', () => {
  it('groups indicators by factor and counts VH and H per row', () => {
    const rows = heatRows(items, names);
    expect(rows.reduce((n, r) => n + r.cells.length, 0)).toBe(items.length);
    expect(rows.reduce((n, r) => n + r.vh, 0)).toBe(items.filter((i) => i.level === 'VH').length);
    expect(rows.reduce((n, r) => n + r.h, 0)).toBe(items.filter((i) => i.level === 'H').length);
  });

  it('prints the level code and RM in each cell and marks missing results', () => {
    const html = wrap(<HeatmapTab items={items.slice(1)} names={names} />);
    expect(html).toContain('ยังไม่ประเมิน');
    expect(html).toContain(`${items[1].level} · ${items[1].rm.toFixed(3)}`);
    expect(html).toContain(`title="${items[1].indicator_code} ชื่อ ${items[1].indicator_code}"`);
  });
});

describe('advice lists', () => {
  const lists = mockResultsWithAdvice('v').items.filter((i) => i.advice);

  it('renders every list and item for 1, 3 and 5 items and for ties', () => {
    const lengths = new Set(lists.flatMap((i) => i.advice!.map((a) => a.items.length)));
    expect([...lengths].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(lists.some((i) => i.advice!.length === 2)).toBe(true);
    for (const row of lists) {
      const html = wrap(<AdviceLists advice={row.advice} />);
      expect(html.match(/<li>/g)).toHaveLength(row.advice!.reduce((n, a) => n + a.items.length, 0));
      expect(html.match(/<h4/g)).toHaveLength(row.advice!.length);
    }
  });

  it('says so when an indicator has no advice', () => {
    expect(wrap(<AdviceLists />)).toContain('ยังไม่มีคำแนะนำ');
  });
});

describe('H / VH view', () => {
  const data = mockResultsWithAdvice(latest.id);

  it('lists only H and VH, highest RM first', () => {
    const rows = highRisks(data.items);
    expect(rows.length).toBe(data.summary.level_counts.H + data.summary.level_counts.VH);
    expect(rows.every((r) => r.level === 'H' || r.level === 'VH')).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].rm).toBeGreaterThanOrEqual(rows[i].rm);
  });

  it('renders a picker per row, editable on the latest version', () => {
    const html = wrap(
      <HvhTab projectId={mockProjectId} versionId={latest.id} results={data} names={names} />,
    );
    const rows = highRisks(data.items).length;
    expect(html.match(/<fieldset/g)).toHaveLength(rows);
    expect(html).not.toMatch(/<fieldset[^>]*disabled/);
    expect(html).toContain('โอนความเสี่ยง');
  });

  it('is read only on an older version', () => {
    const html = wrap(
      <HvhTab
        projectId={mockProjectId}
        versionId={older.id}
        results={mockResultsWithAdvice(older.id, false)}
        names={names}
      />,
    );
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect(html).toContain('ไม่ใช่เวอร์ชันล่าสุด');
  });

  it('shows an empty state without H or VH rows', () => {
    const low = { ...data, items: data.items.filter((i) => i.level === 'L') };
    const html = wrap(
      <HvhTab projectId={mockProjectId} versionId={latest.id} results={low} names={names} />,
    );
    expect(html).toContain('ไม่พบตัวชี้วัดที่มีความเสี่ยงสูง');
  });
});

describe('strategy', () => {
  it('writes one strategy into the cached results only', () => {
    const data = mockResultsWithAdvice('v');
    const target = highRisks(data.items)[0].indicator_code;
    const next = withStrategy(data, target, 'AVOID', '2026-11-25T00:00:00Z');
    expect(next.items.find((i) => i.indicator_code === target)?.strategy).toBe('AVOID');
    expect(next.items.filter((i) => i.strategy === 'AVOID')).toHaveLength(
      data.items.filter((i) => i.strategy === 'AVOID').length + 1,
    );
  });

  it('shows the saved choice as checked', () => {
    const html = wrap(
      <StrategyPicker
        code="EC-HS-2"
        value="REDUCE"
        updatedAt="2026-11-14T10:05:00Z"
        editable
        onChange={async () => {}}
      />,
    );
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain('บันทึกแล้ว');
  });
});

describe('mock strategy api', () => {
  const server = setupServer(...hvhHandlers);
  const base = `http://localhost/api/v1/projects/${mockProjectId}/versions`;
  const put = (versionId: string, code: string) =>
    fetch(`${base}/${versionId}/results/${code}/strategy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ strategy: 'ACCEPT' }),
    });

  it('saves on H / VH, 422 below H, 409 on an older version', async () => {
    server.listen({ onUnhandledFrame: 'error' });
    try {
      const all = mockResultsWithAdvice(latest.id).items;
      const high = all.find((i) => i.level === 'VH')!;
      const low = all.find((i) => i.level === 'L')!;
      const ok = await put(latest.id, high.indicator_code);
      expect(ok.status).toBe(200);
      expect((await ok.json()).strategy).toBe('ACCEPT');
      expect((await put(latest.id, low.indicator_code)).status).toBe(422);
      expect((await put(older.id, high.indicator_code)).status).toBe(409);
      const read = await (await fetch(`${base}/${older.id}/results`)).json();
      expect(read.editable).toBe(false);
    } finally {
      server.close();
    }
  });
});
