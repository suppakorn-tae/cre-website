// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { setupServer } from 'msw/node';
import { NextIntlClientProvider } from 'next-intl';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import compare from '../../../messages/th/compare.json';
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

import { catalogueHandlers } from '@/mocks/catalogue';
import { createCompareHandlers } from '@/features/compare/mocks';

import type { VersionSummary } from './api';
import { mockProjectId, mockVersions } from './mocks';
import { VersionsTab } from './VersionsTab';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const server = setupServer(...createCompareHandlers(), ...catalogueHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(cleanup);
afterAll(() => server.close());

function mount(overrides: Partial<React.ComponentProps<typeof VersionsTab>> = {}) {
  const spies = {
    onViewChange: vi.fn<(view: 'summary' | 'rm') => void>(),
    onCreate: vi.fn<(trigger: HTMLElement | null) => void>(),
    onDelete: vi.fn<(version: VersionSummary, trigger: HTMLElement | null) => void>(),
  };
  const props = {
    projectId: mockProjectId,
    versions: mockVersions(),
    view: 'summary' as const,
    ...spies,
    ...overrides,
  };
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <NextIntlClientProvider locale="th" messages={{ versions, compare, ui }}>
        <VersionsTab {...props} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return spies;
}

const card = (no: number) => screen.getByRole('button', { name: new RegExp(`^v${no}\\s*สร้าง`) });

describe('VersionsTab', () => {
  it('starts on the latest submitted version, compared with the one before', async () => {
    mount();
    expect(card(3).getAttribute('aria-pressed')).toBe('true');
    const base = (await screen.findByLabelText('v3 เทียบกับ')) as HTMLSelectElement;
    await waitFor(() => expect(base.selectedOptions[0]?.textContent).toMatch(/^v2 · ส่ง/));
    // KPI cards with deltas: progress +5 from v2 (40 %), RM 2.71.
    expect(await screen.findByText('จาก v2 (40 %)')).toBeTruthy();
    expect(screen.getAllByText('2.71').length).toBeGreaterThan(0);
  });

  it('selects a version by clicking its card, without navigating', async () => {
    mount();
    fireEvent.click(card(2));
    expect(card(2).getAttribute('aria-pressed')).toBe('true');
    expect(card(3).getAttribute('aria-pressed')).toBe('false');
    expect(await screen.findByLabelText('v2 เทียบกับ')).toBeTruthy();
  });

  it('changes who it compares against with the select', async () => {
    mount();
    const base = (await screen.findByLabelText('v3 เทียบกับ')) as HTMLSelectElement;
    await waitFor(() => expect(base.options.length).toBe(1));
    expect(base.options[0].textContent).toMatch(/^v2/);
  });

  it('explains a never-submitted version instead of comparing it (hi-fi 2.8)', async () => {
    mount();
    fireEvent.click(card(1));
    expect(screen.getByText('ยังไม่มีผลการประเมิน')).toBeTruthy();
    expect(screen.getByText('v1 อ่านอย่างเดียว เพราะมีเวอร์ชันใหม่กว่า')).toBeTruthy();
    expect(screen.queryByLabelText('v1 เทียบกับ')).toBeNull();
    const open = screen.getByRole('link', { name: 'เปิดเวอร์ชันล่าสุด (v3)' });
    expect(open.getAttribute('href')).toBe(
      `/projects/${mockProjectId}/versions/0193a5c2-0000-7000-8000-000000000103/assess`,
    );
  });

  it('is a two-option radio group for the view and reports a change', async () => {
    const props = mount();
    const group = await screen.findByRole('radiogroup', { name: 'มุมมองการเปรียบเทียบ' });
    const radios = within(group).getAllByRole('radio');
    expect(radios.map((r) => (r as HTMLInputElement).checked)).toEqual([true, false]);
    fireEvent.click(radios[1]);
    expect(props.onViewChange).toHaveBeenCalledWith('rm');
  });

  it('shows the RM view with its filters, and a text alternative for the chart', async () => {
    mount({ view: 'rm' });
    expect(await screen.findByText('เลือกแล้ว 4 จาก 10')).toBeTruthy();
    expect(screen.getByRole('img', { name: /ค่า RM ของตัวชี้วัดที่เลือก/ })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'ค่า RM ของตัวชี้วัดที่เลือกในแต่ละเวอร์ชัน' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^เอาด้าน .* ออก$/ })).toHaveLength(2);
  });

  it('opens the card menu and hands the delete to the page with the menu button', async () => {
    const props = mount();
    const trigger = screen.getByRole('button', { name: 'การดำเนินการของ v2' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'ดูคำตอบ' })).toBeTruthy();
    expect(within(menu).getByRole('menuitem', { name: 'ดูผลการประเมิน' })).toBeTruthy();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'ลบเวอร์ชัน' }));
    expect(props.onDelete).toHaveBeenCalledTimes(1);
    const [version, button] = props.onDelete.mock.calls[0];
    expect(version.version_no).toBe(2);
    expect(button).toBe(trigger);
  });

  it('offers no results link for a draft in its menu', async () => {
    mount();
    fireEvent.keyDown(screen.getByRole('button', { name: 'การดำเนินการของ v1' }), { key: 'Enter' });
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'ดูผลการประเมิน' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'ดูคำตอบ' })).toBeTruthy();
  });

  it('hands the new-version button to the page', () => {
    const props = mount();
    const button = screen.getByRole('button', { name: 'เวอร์ชันใหม่' });
    fireEvent.click(button);
    expect(props.onCreate).toHaveBeenCalledWith(button);
  });
});
