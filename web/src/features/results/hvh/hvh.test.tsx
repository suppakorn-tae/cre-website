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
import { highRisks, HVH_VISIBLE, spokenUnit } from './rules';
import { formatNumber } from '@/lib/format/locale';

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

  it('writes each input as a sentence with both names and the score', () => {
    const html = render();
    const [top] = rows;
    const text = html.replace(/<\/?(strong|sub)>/g, '');
    expect(text).toContain(
      `เกิดขึ้น ${formatNumber(top.x)} ครั้งต่อช่วงเวลา → โอกาสเกิด (RL) ${top.rl.toFixed(2)}`,
    );
    expect(text).toContain(
      `ต้นทุนเพิ่ม ${formatNumber(top.y1_pct)}% ของมูลค่าโครงการ → ผลกระทบด้านต้นทุน (RIC) ${top.ri_c.toFixed(2)}`,
    );
    expect(text).toContain(
      `เวลาเพิ่ม ${formatNumber(top.y2_pct)}% ของระยะเวลาโครงการ → ผลกระทบด้านเวลา (RIT) ${top.ri_t.toFixed(2)}`,
    );
    expect(text).toContain(`ผลกระทบด้านสิ่งแวดล้อม (RIE) ${top.ri_e.toFixed(2)}`);
    expect(html).not.toContain('X → RL');
    expect(html).toContain(top.rm.toFixed(3));
  });

  it('shows a chosen strategy as a chip and nothing when none is chosen', () => {
    const html = render();
    expect(html).toMatch(/กลยุทธ์: (REDUCE|TRANSFER|ACCEPT)/);
    expect(html).not.toContain('type="radio"');
    const none = { ...data, items: data.items.map((i) => ({ ...i, strategy: undefined })) };
    const bare = render(none);
    expect(bare).not.toContain('ยังไม่เลือกกลยุทธ์');
    expect(bare).not.toContain('กลยุทธ์:');
  });

  it('shows an empty state without H or VH rows', () => {
    const low = { ...data, items: data.items.filter((i) => i.level === 'L') };
    expect(render(low)).toContain('ไม่พบตัวชี้วัดที่มีความเสี่ยงสูง');
  });
});

describe('spoken unit of X', () => {
  it.each([
    ['ครั้ง/เดือน', 'ครั้งต่อเดือน'],
    ['ครั้ง / ช่วงเวลา', 'ครั้งต่อช่วงเวลา'],
    ['ครั้ง', 'ครั้ง'],
    ['  ', ''],
  ])('reads %j as %j', (unit, spoken) => {
    expect(spokenUnit(unit)).toBe(spoken);
  });
});
