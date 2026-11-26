// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { NextIntlClientProvider } from 'next-intl';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import reports from '../../../messages/th/reports.json';
import shell from '../../../messages/th/shell.json';
import ui from '../../../messages/th/ui.json';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client')>();
  const client = original.createApiClient({
    baseUrl: 'http://localhost/api/v1',
    fetch: (input) => globalThis.fetch(input),
  });
  return { ...original, browserApi: () => client };
});

// The same back-off rules, but quick, so a build takes milliseconds.
vi.mock('@/features/reports/polling', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/reports/polling')>();
  return {
    ...original,
    pollInterval: (status: Parameters<typeof original.pollInterval>[0]) =>
      original.isFinished(status) ? false : 15,
  };
});

import { createJobHandlers } from '@/mocks/jobs';

import { ProjectSteps, type ProjectStepId } from './ProjectSteps';

const P = 'p1';
const V = 'v1';
const BASE = '*/api/v1';
const NOT_SUBMITTED = 'ส่งผลการประเมินก่อน';

const server = setupServer();
const clicks: { href: string | null; download: string }[] = [];

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
beforeEach(() => {
  clicks.length = 0;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.getAttribute('href'), download: this.download });
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const summary = (id: string, status: 'draft' | 'submitted', no = 1) => ({
  id,
  project_id: P,
  version_no: no,
  status,
  editable: true,
});

/** The api answers for one project whose version `V` has the given status. */
function answer(status: 'draft' | 'submitted', strategy: string | null = null) {
  server.use(
    http.get(`${BASE}/projects/:p/versions`, () =>
      HttpResponse.json({ items: [summary('v2', 'draft', 2), summary(V, status, 1)] }),
    ),
    http.get(`${BASE}/projects/:p/versions/:v`, ({ params }) =>
      HttpResponse.json(summary(String(params.v), status)),
    ),
    http.get(`${BASE}/projects/:p/versions/:v/results`, () =>
      HttpResponse.json({
        items: [
          { indicator_code: 'EC-MG-1', strategy },
          { indicator_code: 'EC-MG-2', strategy: null },
        ],
      }),
    ),
  );
}

function open(
  current: ProjectStepId,
  ids: { projectId?: string; versionId?: string } = { projectId: P, versionId: V },
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="th" messages={{ shell, reports, ui }}>
        <ProjectSteps current={current} {...ids} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const nav = () => screen.getByRole('navigation', { name: 'ขั้นตอนการประเมิน' });
const step = (name: string) =>
  within(nav())
    .getAllByRole('listitem')
    .find((li) => li.textContent?.includes(name))!;

describe('ProjectSteps links', () => {
  it('on results, steps 1 to 4 lead to the same project and version', async () => {
    answer('submitted');
    open('results');
    await waitFor(() =>
      expect(within(step('แผนจัดการ')).getByRole('link')).toHaveProperty(
        'href',
        expect.stringContaining('/plan'),
      ),
    );
    const href = (name: string) => within(step(name)).getByRole('link').getAttribute('href');
    expect(href('ข้อมูลโครงการ')).toBe(`/projects/${P}/edit`);
    expect(href('ประเมินความเสี่ยง')).toBe(`/projects/${P}/versions/${V}/assess`);
    expect(href('แผนจัดการ')).toBe(`/projects/${P}/versions/${V}/plan`);
  });

  it('marks the current step and does not link it', async () => {
    answer('submitted');
    open('results');
    const current = within(step('ผลการประเมิน')).getByText('ผลการประเมิน').closest('[aria-current]');
    expect(current).not.toBeNull();
    expect(current!.getAttribute('aria-current')).toBe('step');
    expect(within(step('ผลการประเมิน')).queryByRole('link')).toBeNull();
    expect(nav().querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(nav().querySelectorAll('ol')).toHaveLength(1);
  });

  it('keeps results and plan unreachable until the version is submitted', async () => {
    answer('draft');
    open('assessment');
    const results = within(step('ผลการประเมิน')).getByRole('link');
    expect(results.getAttribute('aria-disabled')).toBe('true');
    expect(results.getAttribute('href')).toBeNull();
    expect(results.tabIndex).toBe(0);
    const described = document.getElementById(results.getAttribute('aria-describedby')!);
    expect(described?.textContent).toBe(NOT_SUBMITTED);
    const plan = within(step('แผนจัดการ')).getByRole('link');
    expect(plan.getAttribute('aria-disabled')).toBe('true');
    // Step 2 stays the current step; step 1 leads back to the form.
    expect(within(step('ข้อมูลโครงการ')).getByRole('link').getAttribute('href')).toBe(
      `/projects/${P}/edit`,
    );
    const report = within(step('รายงาน')).getByRole('button');
    expect(report.getAttribute('aria-disabled')).toBe('true');
    expect(document.getElementById(report.getAttribute('aria-describedby')!)?.textContent).toBe(
      NOT_SUBMITTED,
    );
  });

  it('opens a link as soon as the version turns out to be submitted', async () => {
    answer('submitted');
    open('assessment');
    await waitFor(() =>
      expect(within(step('ผลการประเมิน')).getByRole('link').getAttribute('href')).toBe(
        `/projects/${P}/versions/${V}/results`,
      ),
    );
  });

  it('on the project form it points at the latest version', async () => {
    answer('draft');
    open('project', { projectId: P });
    await waitFor(() =>
      expect(within(step('ประเมินความเสี่ยง')).getByRole('link').getAttribute('href')).toBe(
        `/projects/${P}/versions/v2/assess`,
      ),
    );
  });

  it('on the new-project page the project step is current and the rest wait for it', () => {
    open('project', {});
    expect(step('ข้อมูลโครงการ').querySelector('[aria-current="step"]')).not.toBeNull();
    for (const name of ['ประเมินความเสี่ยง', 'ผลการประเมิน', 'แผนจัดการ', 'รายงาน']) {
      const control = within(step(name)).getByRole(name === 'รายงาน' ? 'button' : 'link');
      expect(control.getAttribute('aria-disabled')).toBe('true');
      expect(document.getElementById(control.getAttribute('aria-describedby')!)?.textContent).toBe(
        'บันทึกข้อมูลโครงการก่อน',
      );
    }
  });
});

describe('ProjectSteps done state', () => {
  it('comes from the data: submitted marks steps 2 and 3, a chosen strategy marks step 4', async () => {
    answer('submitted');
    open('assessment');
    await waitFor(() => expect(within(step('ผลการประเมิน')).queryByText('เสร็จแล้ว')).not.toBeNull());
    expect(within(step('ข้อมูลโครงการ')).queryByText('เสร็จแล้ว')).not.toBeNull();
    expect(within(step('แผนจัดการ')).queryByText('เสร็จแล้ว')).toBeNull();
    cleanup();

    answer('submitted', 'avoid');
    open('assessment');
    await waitFor(() => expect(within(step('แผนจัดการ')).queryByText('เสร็จแล้ว')).not.toBeNull());
  });

  it('marks nothing but the project as done for a draft', async () => {
    answer('draft');
    open('assessment');
    await waitFor(() => expect(within(step('ข้อมูลโครงการ')).queryByText('เสร็จแล้ว')).not.toBeNull());
    expect(nav().textContent).not.toContain('เสร็จแล้วผลการประเมิน');
    expect(within(step('ผลการประเมิน')).queryByText('เสร็จแล้ว')).toBeNull();
  });
});

describe('ProjectSteps step 5', () => {
  it('builds the report in place: the label changes and the PDF downloads', async () => {
    answer('submitted');
    server.use(...createJobHandlers());
    open('results');
    await waitFor(() =>
      expect(within(step('รายงาน')).getByRole('button').getAttribute('aria-disabled')).toBeNull(),
    );
    const button = within(step('รายงาน')).getByRole('button');
    expect(button.textContent).toContain('รายงาน');
    fireEvent.click(button);

    await waitFor(() => expect(button.textContent).toContain('กำลังสร้าง…'));
    expect(button.getAttribute('aria-busy')).toBe('true');
    await waitFor(() => expect(button.textContent).toContain('ดาวน์โหลดแล้ว'), { timeout: 3000 });
    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0].href).toMatch(/^\/api\/v1\/reports\/.+\/download$/);

    // Ready: a click saves it again, no new job.
    fireEvent.click(button);
    await waitFor(() => expect(clicks).toHaveLength(2));
  });

  it('turns to "ลองอีกครั้ง" when the build fails and asks again on the next click', async () => {
    answer('submitted');
    server.use(...createJobHandlers({ failFirst: true }));
    open('results');
    await waitFor(() =>
      expect(within(step('รายงาน')).getByRole('button').getAttribute('aria-disabled')).toBeNull(),
    );
    const button = within(step('รายงาน')).getByRole('button');
    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toContain('ลองอีกครั้ง'), { timeout: 3000 });
    expect(button.getAttribute('data-failed')).toBe('true');
    expect(clicks).toHaveLength(0);

    fireEvent.click(button);
    await waitFor(() => expect(button.textContent).toContain('ดาวน์โหลดแล้ว'), { timeout: 3000 });
    await waitFor(() => expect(clicks).toHaveLength(1));
  });
});
