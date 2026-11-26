import { type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

import type { components, paths } from '@/lib/api/generated/schema';

import { mockCatalogue } from '../../mocks/catalogue';

import type { DashboardProjectItem, DashboardSummary } from './api';

// Feature-local mock of the dashboard api (IO-18 contract; backend not merged).
const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });

type TopIndicator = components['schemas']['DashboardTopIndicator'];

const id = (n: number) => `0193a5c2-7b1e-7c3a-9d4f-${String(n).padStart(12, '0')}`;

const names: [string, string, string, number, number, number | null][] = [
  ['ท่าเรือเกาะเต่า ระยะที่ 2', 'TK2', 'koh_tao', 48_500_000, 45, 9],
  ['ถนนเลียบชายหาดเกาะเต่า', 'TKR1', 'koh_tao', 21_300_000, 30, 4],
  ['รีสอร์ตริมหาดเกาะสมุย', 'SMR', 'koh_samui', 152_000_000, 82, 14],
  ['ระบบประปาเกาะพะงัน', 'PNW', 'koh_phangan', 9_750_000, 55, 2],
  ['เขื่อนกันคลื่นเกาะพีพี', 'PPB', 'koh_phi_phi', 86_400_000, 12, null],
];

// Thai island names, as the backend search sees them (code read with spaces, or Thai name).
const islandNames: Record<string, string> = {
  koh_tao: 'เกาะเต่า',
  koh_samui: 'เกาะสมุย',
  koh_phangan: 'เกาะพะงัน',
  koh_phi_phi: 'เกาะพีพี',
};

// Per project: [H count, VH count] of the latest submitted version.
const risk: ([number, number] | null)[] = [[6, 3], [3, 1], [9, 5], [2, 0], null];

export const seedProjects: DashboardProjectItem[] = names.map(
  ([name, nickname, island, value, pct, hvh], i) => ({
    project_id: id(i + 1),
    name,
    nickname,
    island_code: island,
    type_code: 'pier',
    value_baht: value,
    progress_pct: pct,
    version_count: risk[i] ? 2 : 1,
    latest_version_id: id(100 + i),
    latest_version_no: risk[i] ? 2 : 1,
    latest_version_status: risk[i] ? 'submitted' : 'draft',
    latest_version_scored_count: risk[i] ? 55 : 0,
    latest_version_indicator_total: 55,
    latest_submitted_version_id: risk[i] ? id(100 + i) : null,
    h_vh_count: hvh,
    avg_rm: risk[i] ? 2.4 : null,
  }),
);

export const seedSummary: DashboardSummary = {
  kpis: {
    project_count: seedProjects.length,
    version_count: 9,
    h_vh_indicator_count: 24,
    island_count: 4,
    total_value_baht: seedProjects.reduce((sum, p) => sum + p.value_baht, 0),
  },
  level_distribution: { VL: 38, L: 61, M: 44, H: 20, VH: 9 },
  project_risks: seedProjects.flatMap((p, i) => {
    const counts = risk[i];
    return counts
      ? [
          {
            project_id: p.project_id,
            name: p.name,
            nickname: p.nickname,
            version_id: p.latest_version_id,
            version_no: p.latest_version_no,
            h_count: counts[0],
            vh_count: counts[1],
          },
        ]
      : [];
  }),
};

export const emptySummary: DashboardSummary = {
  kpis: {
    project_count: 0,
    version_count: 0,
    h_vh_indicator_count: 0,
    island_count: 0,
    total_value_baht: 0,
  },
  level_distribution: { VL: 0, L: 0, M: 0, H: 0, VH: 0 },
  project_risks: [],
};

let empty = false;
/** Switches the mock between the seeded dashboard and a new user's. Used by tests. */
export function setDashboardEmpty(value: boolean): void {
  empty = value;
}

const factorOf = (code: string) =>
  mockCatalogue.dimensions
    .flatMap((d) => d.factors)
    .find((f) => f.indicators.some((i) => i.code === code))?.code ?? '';

const topCodes = mockCatalogue.dimensions
  .flatMap((d) => d.factors.flatMap((f) => f.indicators))
  .slice(0, 10)
  .map((i) => i.code);

export const seedTop: TopIndicator[] = topCodes.map((code, i) => ({
  rank: i + 1,
  indicator_code: code,
  factor_code: factorOf(code),
  // Found in 4, 4, 4, 3, 3, 3, 2, 2, 2, 1 of the 4 projects with a submitted version.
  vh_count: i % 3 === 0 ? 1 : 0,
  h_count: 4 - Math.floor(i / 3) - (i % 3 === 0 ? 1 : 0),
}));

export const dashboardHandlers: HttpHandler[] = [
  http.get('/dashboard', ({ response }) => response(200).json(empty ? emptySummary : seedSummary)),
  http.get('/dashboard/panels/projects', ({ request, response }) => {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const pageSize = Math.max(1, Number(url.searchParams.get('page_size') ?? 20));
    const needle = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    const found = empty
      ? []
      : seedProjects.filter((p) =>
          [p.name, p.nickname, p.island_code.replaceAll('_', ' '), islandNames[p.island_code] ?? '']
            .join('\n')
            .toLowerCase()
            .includes(needle),
        );
    return response(200).json({
      items: found.slice((page - 1) * pageSize, page * pageSize),
      page: { page, page_size: pageSize, total: found.length },
    });
  }),
  http.get('/dashboard/panels/top-indicators', ({ response }) =>
    response(200).json({ items: empty ? [] : seedTop }),
  ),
  http.get('/dashboard/panels/islands', ({ response }) => {
    const codes = [...new Set(seedProjects.map((p) => p.island_code))];
    return response(200).json({
      items: empty
        ? []
        : codes.map((code) => ({
            island_code: code,
            projects: seedProjects
              .filter((p) => p.island_code === code)
              .map((p) => ({
                project_id: p.project_id,
                name: p.name,
                nickname: p.nickname,
                progress_pct: p.progress_pct,
                latest_version_id: p.latest_version_id,
                h_vh_count: p.h_vh_count,
              })),
          })),
    });
  }),
];
