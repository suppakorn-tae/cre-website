import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { mockProjectId, mockVersions } from '@/features/versions/mocks';

import advice from '../../../../messages/th/advice.json';
import common from '../../../../messages/th/common.json';
import plan from '../../../../messages/th/plan.json';
import results from '../../../../messages/th/results.json';
import ui from '../../../../messages/th/ui.json';

import { HeatmapTab } from '../heatmap/HeatmapTab';
import { heatRows } from '../heatmap/rules';
import type { IndicatorName } from '../overview/api';
import { mockResultItems } from '../overview/mocks';
import { HvhTab } from './HvhTab';
import { mockResultsWithAdvice } from '@/features/plan/mocks';
import { highRisks, HVH_VISIBLE } from './rules';

const wrap = (node: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="th" messages={{ advice, plan, results, common, ui }}>
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
      unit: 'ครั้ง/ช่วงเวลา',
      factorCode: i.indicator_code.slice(0, 5),
      factorName: `ด้าน ${i.indicator_code.slice(0, 5)}`,
    },
  ]),
);
const [latest] = mockVersions();

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

describe('H / VH summary', () => {
  const data = mockResultsWithAdvice(latest.id);
  const rows = highRisks(data.items);
  const render = (results = data) =>
    wrap(
      <HvhTab projectId={mockProjectId} versionId={latest.id} results={results} names={names} />,
    );

  it('shows the banner with the counts and a link to the plan page', () => {
    const html = render();
    const { VH, H } = data.summary.level_counts;
    expect(html).toContain(`พบ ${rows.length} ตัวชี้วัดที่ต้องจัดการความเสี่ยง (VH ${VH} · H ${H})`);
    expect(html).toContain(`href="/projects/${mockProjectId}/versions/${latest.id}/plan"`);
    expect(html).toContain('ไปยังแผนจัดการความเสี่ยง');
  });

  it('shows the first three cards, highest RM first, and the rest behind a button', () => {
    const html = render();
    for (const row of rows.slice(0, HVH_VISIBLE)) expect(html).toContain(row.indicator_code);
    for (const row of rows.slice(HVH_VISIBLE)) expect(html).not.toContain(row.indicator_code);
    expect(html).toContain(`… และอีก ${rows.length - HVH_VISIBLE} รายการ`);
  });

  it('prints the four input to score pills and the RM box of a card', () => {
    const html = render();
    const [top] = rows;
    expect(html).toContain('ครั้ง/ช่วงเวลา');
    expect(html).toContain('ของมูลค่าโครงการ');
    expect(html).toContain('ของระยะเวลาโครงการ');
    expect(html).toContain(top.rm.toFixed(3));
    for (const score of [top.rl, top.ri_c, top.ri_t, top.ri_e]) {
      expect(html).toContain(score.toFixed(2));
    }
  });

  it('shows the strategy as a chip and no advice text or radios', () => {
    const html = render();
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('คำแนะนำ RL ข้อที่');
    expect(html).toContain('ยังไม่เลือกกลยุทธ์');
    expect(html).toMatch(/กลยุทธ์: (REDUCE|TRANSFER|ACCEPT)/);
  });

  it('shows an empty state without H or VH rows', () => {
    const low = { ...data, items: data.items.filter((i) => i.level === 'L') };
    expect(render(low)).toContain('ไม่พบตัวชี้วัดที่มีความเสี่ยงสูง');
  });
});
