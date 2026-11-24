import { NextIntlClientProvider } from 'next-intl';
import { setupServer } from 'msw/node';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import versions from '../../../messages/th/versions.json';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client')>();
  const client = original.createApiClient({
    baseUrl: 'http://localhost/api/v1',
    // Resolve fetch per call: MSW patches it after this module loads.
    fetch: (input) => globalThis.fetch(input),
  });
  return { ...original, browserApi: () => client };
});

import { createVersion, deleteVersion, fetchProject, fetchVersions } from './api';
import {
  createProjectHandlers,
  createVersionHandlers,
  mockProject,
  mockProjectId,
  mockVersions,
} from './mocks';
import { ProjectHeader } from './ProjectHeader';
import { VersionList } from './VersionList';

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ versions }}>
      {node}
    </NextIntlClientProvider>,
  );

describe('ProjectHeader', () => {
  it('shows fields and entered against expected progress in Thai', () => {
    const html = wrap(<ProjectHeader project={mockProject} />);
    expect(html).toContain('ท่าเรือเกาะเต่า ระยะที่ 2');
    expect(html).toContain('TK2');
    expect(html).toContain('เกาะเต่า · ท่าเรือ · 48,500,000 บาท');
    expect(html).toContain('พ.ย. 2570'); // Buddhist era end date
    expect(html).toContain('จริง 45 %');
    expect(html).toContain('ตามแผน 48 %');
    expect(html).toContain('ช้ากว่าแผน 3 %');
    expect(html).toContain('/projects/' + mockProjectId + '/edit');
  });
});

describe('VersionList', () => {
  const render = (items = mockVersions()) =>
    wrap(
      <VersionList
        projectId={mockProjectId}
        versions={items}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

  it('lists versions newest first with status, counts and average RM', () => {
    const html = render();
    expect(html.indexOf('v3')).toBeLessThan(html.indexOf('v2'));
    expect(html.indexOf('v2')).toBeLessThan(html.indexOf('v1'));
    expect(html).toContain('ล่าสุด · แก้ไขได้');
    expect(html).toContain('อ่านอย่างเดียว');
    expect(html).toContain('ไม่เคยส่ง');
    expect(html).toContain('2.71');
    expect(html).toContain('3.03');
    expect(html).toContain('14 พ.ย. 2569');
  });

  it('links to assessment, results (submitted only) and compare', () => {
    const html = render();
    expect(html).toContain('/versions/0193a5c2-0000-7000-8000-000000000103/assessment');
    expect(html).toContain('/versions/0193a5c2-0000-7000-8000-000000000103/results');
    expect(html).not.toContain('/versions/0193a5c2-0000-7000-8000-000000000101/results');
    expect(html).toContain(`/projects/${mockProjectId}/compare`);
  });

  it('shows an empty state with a create button and no compare link', () => {
    const html = render([]);
    expect(html).toContain('ยังไม่มีเวอร์ชัน');
    expect(html).not.toContain('/compare');
  });

  it('uses no internal words', () => {
    expect(JSON.stringify(versions).toLowerCase()).not.toContain('snapshot');
  });
});

describe('versions api against mocks', () => {
  const server = setupServer(...createProjectHandlers(), ...createVersionHandlers());
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => server.resetHandlers(...createProjectHandlers(), ...createVersionHandlers()));
  afterAll(() => server.close());

  it('loads the project and its versions', async () => {
    expect((await fetchProject(mockProjectId)).nickname).toBe('TK2');
    expect(await fetchVersions(mockProjectId)).toHaveLength(3);
  });

  it('creates a blank version, which becomes the only editable one', async () => {
    const created = await createVersion(mockProjectId);
    expect(created?.version_no).toBe(4);
    const list = await fetchVersions(mockProjectId);
    expect(list[0].version_no).toBe(4);
    expect(list.filter((v) => v.editable)).toHaveLength(1);
  });

  it('deletes a version', async () => {
    await deleteVersion(mockProjectId, mockVersions()[1].id);
    const list = await fetchVersions(mockProjectId);
    expect(list.map((v) => v.version_no)).toEqual([3, 1]);
  });

  it('raises ApiError for an unknown project', async () => {
    await expect(fetchProject('nope')).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});
