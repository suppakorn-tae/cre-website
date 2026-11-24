import { HttpResponse, http as mswHttp, type HttpHandler } from 'msw';

import type { components } from '@/lib/api/generated/schema';

type Project = components['schemas']['Project'];
type VersionSummary = components['schemas']['VersionSummary'];

export const mockProjectId = '0193a5c2-0000-7000-8000-000000000001';

export const mockProject: Project = {
  id: mockProjectId,
  name: 'ท่าเรือเกาะเต่า ระยะที่ 2',
  nickname: 'TK2',
  island_code: 'koh_tao',
  island_other: null,
  type_code: 'pier',
  type_other: null,
  start_date: '2025-12-01',
  end_date: '2027-11-30',
  value_baht: 48_500_000,
  progress_pct: 45,
  description: 'ขยายท่าเทียบเรือโดยสาร',
  expected_progress_pct: 48,
  version_count: 3,
  latest_version_no: 3,
  created_at: '2026-10-28T03:00:00Z',
  updated_at: '2026-11-10T03:00:00Z',
};

const version = (no: number, rest: Partial<VersionSummary>): VersionSummary => ({
  id: `0193a5c2-0000-7000-8000-00000000010${no}`,
  project_id: mockProjectId,
  version_no: no,
  status: 'submitted',
  editable: false,
  created_at: '2026-10-28T03:00:00Z',
  submitted_at: null,
  progress_at_submit: null,
  high_count: null,
  very_high_count: null,
  average_rm: null,
  ...rest,
});

/** Newest first, as the api answers. */
export const mockVersions = (): VersionSummary[] => [
  version(3, {
    editable: true,
    created_at: '2026-11-10T03:00:00Z',
    submitted_at: '2026-11-14T09:40:00Z',
    progress_at_submit: 45,
    high_count: 11,
    very_high_count: 2,
    average_rm: 2.71,
  }),
  version(2, {
    created_at: '2026-11-02T03:00:00Z',
    submitted_at: '2026-11-05T04:20:00Z',
    progress_at_submit: 40,
    high_count: 14,
    very_high_count: 4,
    average_rm: 3.03,
  }),
  version(1, { status: 'draft' }),
];

/**
 * Feature-local handlers for the project detail page: one project, three
 * versions, create and delete that change the list. Not yet registered in
 * `src/mocks/handlers.ts` (shared file, outside this issue's owned paths).
 */
export function createVersionHandlers(initial: VersionSummary[] = mockVersions()): HttpHandler[] {
  let versions = [...initial];
  return [
    mswHttp.get('*/api/v1/projects/:projectId', ({ params }) =>
      params.projectId === mockProjectId
        ? HttpResponse.json({ ...mockProject, version_count: versions.length })
        : HttpResponse.json(
            { error: { code: 'not_found', message: 'not found' } },
            { status: 404 },
          ),
    ),
    mswHttp.get('*/api/v1/projects/:projectId/versions', () =>
      HttpResponse.json({ items: versions }),
    ),
    mswHttp.post('*/api/v1/projects/:projectId/versions', () => {
      const no = Math.max(0, ...versions.map((v) => v.version_no)) + 1;
      const created = {
        ...version(no, {
          status: 'draft',
          editable: true,
          created_at: new Date().toISOString(),
        }),
        submission_no: 0,
        value_baht: mockProject.value_baht,
        start_date: mockProject.start_date,
        end_date: mockProject.end_date,
      };
      versions = [created, ...versions.map((v) => ({ ...v, editable: false }))];
      return HttpResponse.json(created, { status: 201 });
    }),
    mswHttp.delete('*/api/v1/projects/:projectId/versions/:versionId', ({ params }) => {
      versions = versions.filter((v) => v.id !== params.versionId);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
