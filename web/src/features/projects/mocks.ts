import { type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

import type { paths } from '@/lib/api/generated/schema';

import messages from '../../../messages/th/projects.json';

import { expectedProgress } from './dates';
import type { Project, ProjectFields } from './validation';

// Feature-local mock of the projects api (IO-40 is not merged yet). The shared
// handler list is not ours to edit, so `registerProjectMocks` adds these to
// the running worker instead.
const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });

const seedFields: ProjectFields[] = [
  {
    name: 'ท่าเรือเกาะเต่า ระยะที่ 2',
    nickname: 'TK2',
    island_code: 'koh_tao',
    type_code: 'pier',
    start_date: '2025-12-01',
    end_date: '2027-11-30',
    value_baht: 48_500_000,
    progress_pct: 45,
    description: 'ขยายท่าเทียบเรือโดยสาร เพิ่มความยาวท่า 120 เมตร และทางเดินเชื่อมฝั่ง',
  },
  {
    name: 'ถนนเลียบชายหาดเกาะเต่า',
    nickname: 'TKR1',
    island_code: 'koh_tao',
    type_code: 'road',
    start_date: '2026-03-01',
    end_date: '2027-02-28',
    value_baht: 21_300_000,
    progress_pct: 30,
  },
  {
    name: 'รีสอร์ตริมหาดเกาะสมุย',
    nickname: 'SMR',
    island_code: 'koh_samui',
    type_code: 'building',
    start_date: '2025-06-01',
    end_date: '2026-12-31',
    value_baht: 152_000_000,
    progress_pct: 82,
  },
  {
    name: 'ระบบประปาเกาะพะงัน',
    nickname: 'PNW',
    island_code: 'koh_phangan',
    type_code: 'utilities',
    start_date: '2026-01-15',
    end_date: '2027-01-14',
    value_baht: 9_750_000,
    progress_pct: 55,
  },
  {
    name: 'เขื่อนกันคลื่นเกาะพีพี',
    nickname: 'PPB',
    island_code: 'koh_phi_phi',
    type_code: 'coastal',
    start_date: '2026-05-01',
    end_date: '2028-04-30',
    value_baht: 86_400_000,
    progress_pct: 12,
  },
  {
    name: 'สวนสาธารณะริมทะเลเกาะหมาก',
    nickname: 'MKP',
    island_code: 'other',
    island_other: 'เกาะหมาก',
    type_code: 'other',
    type_other: 'สวนสาธารณะริมทะเล',
    start_date: '2026-08-01',
    end_date: '2027-07-31',
    value_baht: 6_200_000,
    progress_pct: 0,
  },
];

const cities = ['เกาะลันตา', 'เกาะช้าง', 'เกาะกูด'] as const;
const cityCodes = ['koh_lanta', 'koh_chang', 'koh_kood'] as const;
for (let i = 0; i < 19; i += 1) {
  seedFields.push({
    name: `โครงการก่อสร้าง${cities[i % 3]} ระยะที่ ${i + 1}`,
    nickname: `P${String(i + 1).padStart(2, '0')}`,
    island_code: cityCodes[i % 3],
    type_code: (['building', 'pier', 'road', 'utilities', 'coastal'] as const)[i % 5],
    start_date: '2026-02-01',
    end_date: '2027-06-30',
    value_baht: 5_000_000 + i * 1_250_000,
    progress_pct: (i * 7) % 100,
  });
}

function withDerived(id: string, fields: ProjectFields, versions: number, now: string): Project {
  const expected = expectedProgress(fields.start_date, fields.end_date);
  return {
    ...fields,
    id,
    expected_progress_pct: expected?.pct ?? 0,
    version_count: versions,
    latest_version_no: versions > 0 ? versions : null,
    created_at: now,
    updated_at: now,
  };
}

const idFor = (n: number) => `0193a5c2-7b1e-7c3a-9d4f-${String(n).padStart(12, '0')}`;

let store: Project[] = [];
let nextId = 1;

/** Resets the in-memory store to the seed (newest first). Used by tests. */
export function resetProjectStore(empty = false): void {
  nextId = 1;
  store = empty
    ? []
    : seedFields
        .map((fields, i) => withDerived(idFor(nextId++), fields, i % 4, '2026-11-20T03:14:07Z'))
        .reverse();
}
resetProjectStore();

/** Current mock data, newest first. */
export function getProjectStore(): Project[] {
  return store;
}

function islandText(project: Project): string {
  const label = messages.islands[project.island_code];
  return `${label} ${project.island_code} ${project.island_other ?? ''}`;
}

export function searchProjects(items: Project[], q: string): Project[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((p) =>
    [p.name, p.nickname, islandText(p)].some((text) => text.toLowerCase().includes(needle)),
  );
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });

export const projectHandlers: HttpHandler[] = [
  http.get('/projects', ({ request, response }) => {
    const url = new URL(request.url);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
    const pageSize = Math.max(1, Number(url.searchParams.get('page_size') ?? 20));
    const found = searchProjects(store, url.searchParams.get('q') ?? '');
    return response(200).json({
      page,
      page_size: pageSize,
      total: found.length,
      items: found.slice((page - 1) * pageSize, page * pageSize),
    });
  }),
  http.post('/projects', async ({ request, response }) => {
    const body = (await request.clone().json()) as ProjectFields;
    const project = withDerived(idFor(nextId++), body, 0, new Date().toISOString());
    store = [project, ...store];
    return response(201).json(project);
  }),
  http.get('/projects/{project_id}', ({ params, response }) => {
    const project = store.find((p) => p.id === params.project_id);
    return project
      ? response(200).json(project)
      : response(404).json(errorBody('not_found', 'project not found'));
  }),
  http.patch('/projects/{project_id}', async ({ params, request, response }) => {
    const current = store.find((p) => p.id === params.project_id);
    if (!current) return response(404).json(errorBody('not_found', 'project not found'));
    const changes = (await request.clone().json()) as Partial<ProjectFields>;
    const merged = { ...current, ...changes };
    const updated: Project = {
      ...merged,
      expected_progress_pct: expectedProgress(merged.start_date, merged.end_date)?.pct ?? 0,
      updated_at: new Date().toISOString(),
    };
    store = store.map((p) => (p.id === updated.id ? updated : p));
    return response(200).json(updated);
  }),
  http.delete('/projects/{project_id}', ({ params, response }) => {
    if (!store.some((p) => p.id === params.project_id)) {
      return response(404).json(errorBody('not_found', 'project not found'));
    }
    store = store.filter((p) => p.id !== params.project_id);
    return response(204).empty();
  }),
];
