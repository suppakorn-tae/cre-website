import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { setupServer } from 'msw/node';
import { describe, expect, it, vi } from 'vitest';

import common from '../../../messages/th/common.json';
import plan from '../../../messages/th/plan.json';
import reports from '../../../messages/th/reports.json';
import results from '../../../messages/th/results.json';
import shell from '../../../messages/th/shell.json';
import ui from '../../../messages/th/ui.json';

import type { IndicatorName, ResultsResponse } from '@/features/results/overview/api';
import { hvhHandlers, mockResultsWithAdvice } from './mocks';
import { mockResultItems } from '@/features/results/overview/mocks';
import { projectKey } from '@/features/versions/api';
import { mockProject, mockProjectId, mockVersions } from '@/features/versions/mocks';

import { withStrategy } from './api';
import { PlanPage } from './PlanPage';
import { adviceFollowsLikelihood, chosenCount, highRisks, PLAN_VISIBLE, planPath } from './rules';
import { StrategyPanel } from './StrategyPanel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/projects/p/versions/v/plan',
  useSearchParams: () => new URLSearchParams(),
}));

const messages = { plan, reports, results, common, ui, shell };
const wrap = (node: ReactNode, client = new QueryClient()) =>
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="th" messages={messages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

const names = new Map<string, IndicatorName>(
  mockResultItems().map((i) => [
    i.indicator_code,
    {
      name: `ชื่อ ${i.indicator_code}`,
      unit: 'ครั้ง',
      factorCode: i.indicator_code.slice(0, 5),
      factorName: `ด้าน ${i.indicator_code.slice(0, 5)}`,
    },
  ]),
);
const [latest, older] = mockVersions();

/** The page with its queries already answered, as after the first load. */
function renderPlan(opts: { data?: ResultsResponse; draft?: boolean } = {}) {
  const client = new QueryClient();
  const version = opts.draft ? { ...latest, status: 'draft' as const } : latest;
  const base = ['projects', mockProjectId, 'versions', latest.id] as const;
  client.setQueryData(projectKey(mockProjectId), mockProject);
  client.setQueryData(base, version);
  client.setQueryData([...base, 'results'], opts.data ?? mockResultsWithAdvice(latest.id));
  client.setQueryData(['catalogue', 'names'], names);
  return wrap(<PlanPage projectId={mockProjectId} versionId={latest.id} />, client);
}

describe('plan rules', () => {
  const data = mockResultsWithAdvice(latest.id);

  it('lists only H and VH, highest RM first', () => {
    const rows = highRisks(data.items);
    expect(rows.length).toBe(data.summary.level_counts.H + data.summary.level_counts.VH);
    expect(rows.every((r) => r.level === 'H' || r.level === 'VH')).toBe(true);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1].rm).toBeGreaterThanOrEqual(rows[i].rm);
  });

  it('counts the rows that carry a strategy', () => {
    const rows = highRisks(data.items);
    expect(chosenCount(rows)).toBe(rows.filter((r) => r.strategy).length);
    expect(chosenCount(rows)).toBeGreaterThan(0);
  });

  it('reads which advice the api sent', () => {
    expect(adviceFollowsLikelihood([{ list: 'RL', items: ['a'] }])).toBe(true);
    expect(adviceFollowsLikelihood([{ list: 'RI_E', items: ['a'] }])).toBe(false);
    expect(adviceFollowsLikelihood(undefined)).toBe(false);
  });

  it('has a route per version', () => {
    expect(planPath('p', 'v')).toBe('/projects/p/versions/v/plan');
  });

  it('writes one strategy into the cached results only', () => {
    const target = highRisks(data.items)[0].indicator_code;
    const next = withStrategy(data, target, 'AVOID', '2026-11-25T00:00:00Z');
    expect(next.items.find((i) => i.indicator_code === target)?.strategy).toBe('AVOID');
    expect(next.items.filter((i) => i.strategy === 'AVOID')).toHaveLength(
      data.items.filter((i) => i.strategy === 'AVOID').length + 1,
    );
  });
});

describe('plan page', () => {
  const data = mockResultsWithAdvice(latest.id);
  const rows = highRisks(data.items);

  it('shows the header, the summary and step 4 as current', () => {
    const html = renderPlan();
    const { VH, H } = data.summary.level_counts;
    expect(html).toContain('คำแนะนำจัดการความเสี่ยง – v3');
    expect(html).toContain(
      `${rows.length} ตัวชี้วัดระดับ H / VH (VH ${VH} · H ${H}) · เรียงตาม RM · เลือกกลยุทธ์แล้ว ${chosenCount(rows)} / ${rows.length}`,
    );
    expect(html).toContain('v3 คำแนะนำจัดการความเสี่ยง');
    expect(html).toMatch(/aria-current="step"[^>]*>[^]*?แผนจัดการ/);
  });

  it('has the report button as its primary action, built in place', () => {
    const html = renderPlan();
    expect(html).toContain(reports.action.label);
    expect(html).toMatch(/<button[^>]*data-report="idle"/);
    expect(html).not.toContain('/report"');
  });

  it('shows at most six items, sorted by RM, and offers the rest', () => {
    const html = renderPlan();
    expect(html.match(/data-orientation="vertical" data-state/g)).toHaveLength(PLAN_VISIBLE);
    for (const row of rows.slice(0, PLAN_VISIBLE)) expect(html).toContain(row.indicator_code);
    for (const row of rows.slice(PLAN_VISIBLE)) expect(html).not.toContain(row.indicator_code);
    expect(html).toContain(`… และอีก ${rows.length - PLAN_VISIBLE} รายการ`);
    // The order follows RM, highest first.
    const at = rows.slice(0, PLAN_VISIBLE).map((r) => html.indexOf(r.indicator_code));
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('opens the first item only: path, why-line, advice and four strategy radios', () => {
    const html = renderPlan();
    const [top] = rows;
    expect(html.match(/aria-expanded="true"/g)).toHaveLength(1);
    expect(html).toContain('ที่มาของระดับความเสี่ยง');
    expect(html).toContain(`RM ${top.rm.toFixed(3)} · ${top.level}`);
    expect(html).toMatch(/จึงแสดงคำแนะนำด้าน/);
    expect(html).toContain('คำแนะนำจากผู้เชี่ยวชาญ ใช้ประกอบการวางแผนจัดการความเสี่ยง');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain(`aria-label="กลยุทธ์ของ ${top.indicator_code}"`);
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html).not.toMatch(/<input[^>]*disabled/);
    expect(html).toContain('โอนความเสี่ยงผ่านประกันภัยหรือสัญญา');
    expect(html).toContain('แสดงในผลการประเมินและรายงาน PDF');
  });

  it('marks the saved strategy as checked and shows when it was saved', () => {
    const html = renderPlan();
    expect(html.match(/checked=""/g)).toHaveLength(rows[0].strategy ? 1 : 0);
    if (rows[0].strategy) expect(html).toContain('บันทึกแล้ว');
  });

  it('is read only on an older version: a chip, a note and no radios', () => {
    const html = renderPlan({ data: mockResultsWithAdvice(older.id, false) });
    expect(html).toContain('เวอร์ชันนี้อ่านอย่างเดียว');
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('role="radiogroup"');
    expect(html).toContain('กลยุทธ์ที่เลือกไว้');
  });

  it('shows an empty state without H or VH rows', () => {
    const low = { ...data, items: data.items.filter((i) => i.level === 'L') };
    const html = renderPlan({ data: low });
    expect(html).toContain('ไม่มีตัวชี้วัดระดับ H หรือ VH ในเวอร์ชันนี้');
    expect(html).not.toContain('role="radiogroup"');
  });

  it('asks for a submit first on a draft version', () => {
    expect(renderPlan({ draft: true })).toContain('ยังไม่มีผลการประเมิน');
  });
});

describe('strategy panel', () => {
  const props = { code: 'EC-HS-2', updatedAt: '2026-11-14T10:05:00Z', onChange: async () => {} };

  it('is a radio group named for the indicator, one radio checked', () => {
    const html = wrap(<StrategyPanel {...props} value="REDUCE" editable />);
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="กลยุทธ์ของ EC-HS-2"');
    expect(html.match(/type="radio"/g)).toHaveLength(4);
    expect(html.match(/name="strategy-EC-HS-2"/g)).toHaveLength(4);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain('บันทึกแล้ว');
  });

  it('says nothing is chosen yet', () => {
    const html = wrap(<StrategyPanel {...props} updatedAt={undefined} editable />);
    expect(html).not.toContain('checked=""');
    expect(html).toContain('ยังไม่เลือกกลยุทธ์');
  });

  it('shows a static chip when read only', () => {
    const html = wrap(<StrategyPanel {...props} value="ACCEPT" editable={false} />);
    expect(html).not.toContain('<input');
    expect(html).toContain('ACCEPT');
    expect(html).toContain('ยอมรับและติดตามอย่างใกล้ชิด');
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
