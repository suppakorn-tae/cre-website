import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { setupServer } from 'msw/node';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import reports from '../../../messages/th/reports.json';
import ui from '../../../messages/th/ui.json';
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
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="th" messages={{ versions, reports, ui }}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

describe('ProjectHeader', () => {
  const render = () => wrap(<ProjectHeader project={mockProject} onDelete={vi.fn()} />);

  it('shows the name with a nickname chip and one meta line with the progress', () => {
    const html = render();
    expect(html).toContain('ท่าเรือเกาะเต่า ระยะที่ 2');
    expect(html).toContain('TK2');
    expect(html).toContain('เกาะเต่า · ท่าเรือ · 48,500,000 บาท');
    expect(html).toContain('พ.ย. 2570'); // Buddhist era end date
    expect(html).toContain('ความก้าวหน้า 45 % (ตามแผน 48 %)');
    expect(html).toContain('TK2 ท่าเรือเกาะเต่า ระยะที่ 2'); // breadcrumb
  });

  it('has an edit button and a named menu for deleting the project', () => {
    const html = render();
    expect(html).toContain('/projects/' + mockProjectId + '/edit');
    expect(html).toContain('แก้ไขโครงการ');
    expect(html).toContain('aria-label="การดำเนินการของโครงการ"');
  });
});

describe('VersionList', () => {
  const render = (items = mockVersions(), selectedId: string | undefined = items[0]?.id) =>
    wrap(
      <VersionList
        projectId={mockProjectId}
        versions={items}
        selectedId={selectedId}
        onSelect={vi.fn()}
        onCreate={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

  it('lists one card per version, newest first, with status, counts and average RM', () => {
    const html = render();
    expect(html.indexOf('v3')).toBeLessThan(html.indexOf('v2'));
    expect(html.indexOf('v2')).toBeLessThan(html.indexOf('v1'));
    expect(html).toContain('ล่าสุด · แก้ไขได้');
    expect(html).toContain('อ่านอย่างเดียว');
    expect(html).toContain('ส่ง 14 พ.ย. 2569 16:40 · ความก้าวหน้า 45 %');
    expect(html).toContain('RM เฉลี่ย 2.71');
    expect(html).toContain('RM เฉลี่ย 3.03');
    expect(html).toContain('สร้าง 10 พ.ย. 2569');
  });

  it('says a never-submitted version has no result', () => {
    expect(render()).toContain('ไม่เคยส่ง จึงไม่มีผล');
  });

  it('marks the selected card and only that one', () => {
    const html = render(mockVersions(), mockVersions()[1].id);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html.match(/aria-pressed="false"/g)).toHaveLength(2);
  });

  it('gives each card a menu named after its version', () => {
    const html = render();
    for (const no of [1, 2, 3]) expect(html).toContain(`aria-label="การดำเนินการของ v${no}"`);
  });

  it('does not navigate: a card is a button, not a link', () => {
    expect(render()).not.toContain('<a ');
  });

  it('shows an empty state with a create button', () => {
    const html = render([]);
    expect(html).toContain('ยังไม่มีเวอร์ชัน');
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

  it('refuses to delete the last version with the last_version code', async () => {
    const [keep, ...rest] = mockVersions();
    for (const v of rest) await deleteVersion(mockProjectId, v.id);
    await expect(deleteVersion(mockProjectId, keep.id)).rejects.toMatchObject({
      status: 409,
      code: 'last_version',
    });
    expect(await fetchVersions(mockProjectId)).toHaveLength(1);
  });

  it('raises ApiError for an unknown project', async () => {
    await expect(fetchProject('nope')).rejects.toMatchObject({ status: 404, code: 'not_found' });
  });
});
