import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import common from '../../../messages/th/common.json';
import dashboard from '../../../messages/th/dashboard.json';
import projects from '../../../messages/th/projects.json';
import ui from '../../../messages/th/ui.json';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { barPercent, donutSegments, levelPercent, LevelChart, ProjectRiskChart } from './Charts';
import { DashboardPage } from './DashboardPage';
import { formatMillionBaht } from './format';
import { ProjectsTable } from './ProjectsTable';
import {
  dashboardHandlers,
  emptySummary,
  seedProjects,
  seedSummary,
  seedTop,
  setDashboardEmpty,
} from './mocks';

function render(node: ReactNode, summary?: typeof seedSummary, islands?: unknown) {
  const client = new QueryClient();
  if (summary) client.setQueryData(['dashboard', 'summary'], summary);
  if (islands) client.setQueryData(['dashboard', 'islands', 'names'], islands);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ dashboard, projects, common, ui }}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

describe('formatMillionBaht', () => {
  it('shows million baht with at most one decimal', () => {
    expect(formatMillionBaht(203_500_000)).toBe('203.5');
    expect(formatMillionBaht(120_000_000)).toBe('120');
    expect(formatMillionBaht(1_234_567_890)).toBe('1,234.6');
    expect(formatMillionBaht(0)).toBe('0');
  });
});

describe('barPercent', () => {
  it('scales to the largest value and keeps a sliver for small values', () => {
    expect(barPercent(50, 100)).toBe(50);
    expect(barPercent(100, 100)).toBe(100);
    expect(barPercent(1, 1000)).toBe(2);
    expect(barPercent(0, 100)).toBe(0);
    expect(barPercent(5, 0)).toBe(0);
  });
});

describe('level donut', () => {
  const counts = seedSummary.level_distribution;

  it('shares are count over total, rounded to whole percent', () => {
    expect(levelPercent(38, 172)).toBe(22);
    expect(levelPercent(0, 0)).toBe(0);
  });

  it('draws one arc per non-empty level, in level order, filling the ring', () => {
    const segs = donutSegments({ VL: 1, L: 0, M: 1, H: 2, VH: 0 });
    expect(segs.map((s) => s.level)).toEqual(['VL', 'M', 'H']);
    expect(segs.map((s) => s.length)).toEqual([25, 25, 50]);
    expect(segs.map((s) => s.offset)).toEqual([0, 25, 50]);
    expect(donutSegments({ VL: 0, L: 0, M: 0, H: 0, VH: 0 })).toEqual([]);
  });

  it('is an image with a Thai label and a legend of counts and percentages', () => {
    const html = render(<LevelChart counts={counts} />);
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="[^"]*ความเสี่ยงสูงมาก 9[^"]*"/);
    expect(html).toContain('22%');
    expect(html).toContain('stroke="var(--level-vh)"');
  });
});

describe('projects table', () => {
  it('shows island, type, value, progress, version status, H+VH and the three actions', () => {
    const html = render(<ProjectsTable items={seedProjects} />);
    for (const text of ['TK2', 'เกาะเต่า', 'ท่าเรือ', '48.5', 'ฉบับร่าง', 'ส่งแล้ว', 'ประเมินต่อ']) {
      expect(html).toContain(text);
    }
    const [first] = seedProjects;
    expect(html).toContain(
      `href="/projects/${first.project_id}/versions/${first.latest_version_id}/assess"`,
    );
    expect(html).toContain(
      `href="/projects/${first.project_id}/versions/${first.latest_submitted_version_id}/results"`,
    );
    expect(html).toContain(`href="/projects/${first.project_id}"`);
    expect(html).toContain('role="progressbar"');
  });

  it('has no results link and says so when nothing was submitted', () => {
    const html = render(<ProjectsTable items={seedProjects.slice(4)} />);
    expect(html).toContain('ยังไม่ส่งผลการประเมิน');
    expect(html).not.toContain('/results');
  });

  it('prints the typed island and type when the code is other', () => {
    const item = {
      ...seedProjects[0],
      island_code: 'other',
      island_other: 'เกาะหลีเป๊ะ',
      type_code: 'other',
      type_other: 'ท่าจอดเรือ',
    };
    const html = render(<ProjectsTable items={[item]} />);
    expect(html).toContain('เกาะหลีเป๊ะ');
    expect(html).toContain('ท่าจอดเรือ');
  });
});

describe('charts', () => {
  it('prints the five levels with Thai names and counts', () => {
    const html = render(<LevelChart counts={seedSummary.level_distribution} />);
    for (const text of ['ความเสี่ยงต่ำมาก', 'ความเสี่ยงสูงมาก', '38', '61', '44', '20']) {
      expect(html).toContain(text);
    }
  });

  it('says so when no level has a count', () => {
    expect(render(<LevelChart counts={emptySummary.level_distribution} />)).toContain(
      'ยังไม่มีผลการประเมินที่ส่งแล้ว',
    );
  });

  it('shows one H/VH bar per project with its numbers as text', () => {
    const html = render(<ProjectRiskChart risks={seedSummary.project_risks} />);
    expect(html).toContain('TK2');
    expect(html).toContain('สูง 9 · สูงมาก 5');
    expect(html).not.toContain('PPB');
  });
});

describe('DashboardPage', () => {
  it('shows a loading state before data arrives', () => {
    expect(render(<DashboardPage />)).toContain('กำลังโหลดภาพรวม');
  });

  it('shows four KPI cards, both charts and marks the projects card as shown', () => {
    const html = render(<DashboardPage />, seedSummary);
    for (const text of [
      'มูลค่ารวมโครงการ',
      'ตัวชี้วัดที่เสี่ยงสูง',
      'เกาะที่มีโครงการ',
      'การกระจายระดับความเสี่ยง',
      'ตัวชี้วัดความเสี่ยงสูงและสูงมากแต่ละโครงการ',
      'กำลังแสดง',
      'รายการโครงการ',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('318<span');
    expect(html).toContain('ล้านบาท');
    expect(html).not.toContain('317,950,000');
  });

  it('names the islands under the islands card', () => {
    const islands = [
      { island_code: 'koh_tao', projects: [] },
      { island_code: 'koh_samui', projects: [] },
    ];
    const html = render(<DashboardPage />, seedSummary, islands);
    expect(html).toContain('เกาะเต่า · เกาะสมุย');
  });

  it('shows the empty state for a new user, without charts', () => {
    const html = render(<DashboardPage />, emptySummary);
    expect(html).toContain('ยังไม่มีโครงการ');
    expect(html).toContain('href="/projects/new"');
    expect(html).not.toContain('การกระจายระดับความเสี่ยง');
  });
});

describe('mock dashboard api', () => {
  const server = setupServer(...dashboardHandlers);
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterAll(() => server.close());
  const get = async (path: string) => (await fetch(`http://localhost/api/v1${path}`)).json();

  it('serves the summary, and an empty one for a new user', async () => {
    expect((await get('/dashboard')).kpis.project_count).toBe(seedSummary.kpis.project_count);
    setDashboardEmpty(true);
    expect((await get('/dashboard')).kpis.project_count).toBe(0);
    setDashboardEmpty(false);
  });

  it('searches the projects panel by name or nickname', async () => {
    const byNick = await get('/dashboard/panels/projects?q=smr&page=1&page_size=10');
    expect(byNick.items.map((p: { nickname: string }) => p.nickname)).toEqual(['SMR']);
    expect(byNick.page.total).toBe(1);
  });

  it('serves ten ranked indicators and the islands grouping', async () => {
    expect((await get('/dashboard/panels/top-indicators')).items).toEqual(seedTop);
    expect(seedTop).toHaveLength(10);
    const islands = (await get('/dashboard/panels/islands')).items;
    expect(islands.map((g: { island_code: string }) => g.island_code)).toContain('koh_tao');
  });
});
