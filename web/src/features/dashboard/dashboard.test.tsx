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

import { axisMax, levelPercent, LevelChart, ProjectRiskChart } from './Charts';
import { DashboardPage } from './DashboardPage';
import { IslandsPanel, TopIndicatorsPanel } from './Panels';
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

function render(
  node: ReactNode,
  summary?: typeof seedSummary,
  islands?: unknown,
  seed?: (client: QueryClient) => void,
) {
  const client = new QueryClient();
  seed?.(client);
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

describe('axisMax', () => {
  it('rounds the largest bar up to the next multiple of 5, at least 5', () => {
    expect(axisMax(13)).toBe(15);
    expect(axisMax(15)).toBe(15);
    expect(axisMax(16)).toBe(20);
    expect(axisMax(1)).toBe(5);
    expect(axisMax(0)).toBe(5);
  });
});

describe('level donut', () => {
  const counts = seedSummary.level_distribution;

  it('shares are count over total, rounded to whole percent', () => {
    expect(levelPercent(38, 172)).toBe(22);
    expect(levelPercent(0, 0)).toBe(0);
  });

  it('draws the shared donut with gaps, highest risk first from the top', () => {
    const html = render(<LevelChart counts={counts} />);
    expect(html).toContain('<mask');
    // VH is the first arc; the ring has 5 non-empty levels, so each arc is shorter than its share.
    expect(html.indexOf('var(--level-vh)')).toBeLessThan(html.indexOf('var(--level-vl)'));
    expect(html.match(/stroke-dasharray="[\d.]+ [\d.]+"/g)!.length).toBeGreaterThanOrEqual(5);
  });

  it('is an image with a Thai label and a legend of counts and percentages', () => {
    const html = render(<LevelChart counts={counts} />);
    expect(html).toContain('role="img"');
    expect(html).toMatch(/aria-label="[^"]*ความเสี่ยงสูงมาก 9[^"]*"/);
    expect(html).toContain('22.1%');
    // Highest risk first, as in the hi-fi; no white text on a solid level colour.
    expect(html.indexOf('>ความเสี่ยงสูงมาก<')).toBeLessThan(html.indexOf('>ความเสี่ยงต่ำมาก<'));
    expect(html).not.toContain('--level-vh-on');
    expect(html).toContain('stroke="var(--level-vh)"');
    // The legend prints the level code as in the hi-fi, the Thai name is for screen readers.
    expect(html).toContain('<span aria-hidden="true">VH</span>');
  });
});

describe('projects table', () => {
  const risks = new Map([[seedProjects[0].project_id, { h: 6, vh: 3 }]]);

  it('shows island, type, value, progress, version status, H+VH and the three actions', () => {
    const html = render(<ProjectsTable items={seedProjects} risks={risks} />);
    for (const text of ['TK2', 'เกาะเต่า', 'ท่าเรือ', '48.5', 'ฉบับร่าง', 'ส่งแล้ว', 'v2']) {
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
    // The action names say which project they act on.
    expect(html).toContain('aria-label="ประเมินความเสี่ยง TK2"');
    expect(html).toContain('aria-label="ดูผลการประเมิน TK2"');
  });

  it('renders the table and one card per project, for CSS to pick between', () => {
    const html = render(<ProjectsTable items={seedProjects.slice(0, 2)} />);
    expect(html).toContain('<table');
    expect(html.match(/<article/g)).toHaveLength(2);
    expect(html).toContain('ความก้าวหน้าโครงการ');
    expect(html).toContain('<dd>48.5</dd>');
    expect(html).toContain('เกาะเต่า · ท่าเรือ');
  });

  it('shows the scored count of the latest version in the table cell and in the card', () => {
    const html = render(<ProjectsTable items={seedProjects.slice(0, 1)} />);
    // Table: "v2 · 55 / 55 ตัวชี้วัด" in one cell; card: the count on its own line.
    expect(html.match(/55 \/ 55 ตัวชี้วัด/g)).toHaveLength(2);
    expect(html).toContain('v2');
  });

  it('shows 0 of the total for a draft that has no stored results', () => {
    const html = render(<ProjectsTable items={seedProjects.slice(4)} />);
    expect(html).toContain('0 / 55 ตัวชี้วัด');
  });

  it('splits H and VH into two chips when the counts are known, else shows the total', () => {
    const split = render(<ProjectsTable items={seedProjects.slice(0, 1)} risks={risks} />);
    expect(split).toContain('aria-label="ความเสี่ยงสูง 6"');
    expect(split).toContain('aria-label="ความเสี่ยงสูงมาก 3"');
    const total = render(<ProjectsTable items={seedProjects.slice(0, 1)} />);
    expect(total).toContain('aria-label="สูงและสูงมาก 9 ตัวชี้วัด"');
  });

  it('shows a new project as version 1, a draft, with no results link', () => {
    // A project made after IO-169: version 1, never submitted.
    const html = render(<ProjectsTable items={seedProjects.slice(4)} />);
    expect(html).toContain('v1');
    expect(html).toContain('ฉบับร่าง');
    expect(html).toContain('ยังไม่ส่งผลการประเมิน');
    expect(html).not.toContain('/results');
    expect(html).toContain('/assess');
  });

  it('adds the extra row actions of the project list after the three standard ones', () => {
    const html = render(
      <ProjectsTable items={seedProjects.slice(0, 1)} extraActions={() => <b>เพิ่มเติม</b>} />,
    );
    expect(html).toContain('เพิ่มเติม');
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

describe('top 10 panel', () => {
  const html = render(<TopIndicatorsPanel />, seedSummary, undefined, (client) => {
    client.setQueryData(['dashboard', 'top-indicators'], seedTop);
    client.setQueryData(['dashboard', 'indicator-names'], {
      indicators: new Map([[seedTop[0].indicator_code, 'ชื่อตัวชี้วัด']]),
      factors: new Map(),
    });
  });

  it('is a table with the title, its caption and the four columns', () => {
    expect(html).toContain('Top 10 ตัวชี้วัดที่เป็น H / VH บ่อยที่สุด');
    expect(html).toContain('เรียงตามจำนวนโครงการที่เป็น H/VH');
    for (const col of ['#', 'ตัวชี้วัด', 'พบใน (โครงการ)', 'VH / H']) {
      expect(html).toContain(`>${col}</th>`);
    }
    expect(html.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr/g)).toHaveLength(10);
  });

  it('shows the code in bold with the name, the found-in count of all projects and level chips', () => {
    expect(html).toContain(`<b>${seedTop[0].indicator_code}</b> ชื่อตัวชี้วัด`);
    // Found in 4 of the 4 projects that have a submitted version.
    expect(html).toContain('4 / 4');
    expect(html).toContain('aria-label="ความเสี่ยงสูงมาก 1"');
    expect(html).toContain('aria-label="ความเสี่ยงสูง 3"');
  });
});

describe('islands panel', () => {
  const [tk2, tkr] = seedProjects;
  const html = render(
    <IslandsPanel islandName={(code) => (code === 'koh_tao' ? 'เกาะเต่า' : code)} />,
    seedSummary,
    undefined,
    (client) => {
      client.setQueryData(
        ['dashboard', 'islands'],
        [
          {
            island_code: 'koh_tao',
            projects: [tk2, tkr].map((p) => ({ ...p, progress_pct: 0 })),
          },
        ],
      );
      client.setQueryData(['dashboard', 'projects', 'all'], seedProjects);
    },
  );

  it('has a card per island with the project count and the value in million baht', () => {
    expect(html).toContain('เกาะเต่า');
    expect(html).toContain('2 โครงการ · มูลค่า 69.8M');
  });

  it('shows per project the nickname, name, version, status, level chips and an open link', () => {
    for (const text of ['TK2', 'ท่าเรือเกาะเต่า ระยะที่ 2', 'v2', 'ส่งแล้ว']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('aria-label="ความเสี่ยงสูง 6"');
    expect(html).toContain('aria-label="ความเสี่ยงสูงมาก 3"');
    expect(html).toContain(`href="/projects/${tk2.project_id}"`);
    expect(html).toContain('aria-label="เปิดโครงการ TK2"');
  });
});

describe('DashboardPage', () => {
  it('shows a loading state before data arrives', () => {
    expect(render(<DashboardPage />)).toContain('กำลังโหลดภาพรวม');
  });

  it('shows four KPI cards, both charts and marks the projects card as shown', () => {
    const html = render(<DashboardPage />, seedSummary);
    for (const text of [
      'Dashboard',
      'ภาพรวมโครงการก่อสร้างบนพื้นที่เกาะ',
      'โครงการทั้งหมด',
      'ความเสี่ยงสูง',
      'เกาะที่ดำเนินการ',
      'มูลค่ารวม',
      'การกระจายระดับความเสี่ยง',
      'จำนวนความเสี่ยง H / VH รายโครงการ',
      'กำลังแสดง',
      'เพิ่มโครงการ',
    ]) {
      expect(html).toContain(text);
    }
    // Only the projects card is selected; the two other clickable cards are not.
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
    // Icon tiles, and a chevron on the clickable cards that are not shown.
    expect(html.match(/<svg/g)!.length).toBeGreaterThanOrEqual(7);
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
    expect(html).toContain('สร้างโครงการแรก');
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

  it('searches the projects panel by name, nickname or island', async () => {
    const nicknames = (r: { items: { nickname: string }[] }) => r.items.map((p) => p.nickname);
    const byNick = await get('/dashboard/panels/projects?q=smr&page=1&page_size=10');
    expect(nicknames(byNick)).toEqual(['SMR']);
    expect(byNick.page.total).toBe(1);
    const byCode = await get('/dashboard/panels/projects?q=koh%20tao&page=1&page_size=10');
    expect(nicknames(byCode)).toEqual(['TK2', 'TKR1']);
    const byThai = await get(
      `/dashboard/panels/projects?q=${encodeURIComponent('สมุย')}&page=1&page_size=10`,
    );
    expect(nicknames(byThai)).toEqual(['SMR']);
  });

  it('serves ten ranked indicators and the islands grouping', async () => {
    expect((await get('/dashboard/panels/top-indicators')).items).toEqual(seedTop);
    expect(seedTop).toHaveLength(10);
    const islands = (await get('/dashboard/panels/islands')).items;
    expect(islands.map((g: { island_code: string }) => g.island_code)).toContain('koh_tao');
  });
});
