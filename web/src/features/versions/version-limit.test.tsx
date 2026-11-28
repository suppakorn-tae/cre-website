// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { limitState } from '@/features/dashboard/limit';

import compare from '../../../messages/th/compare.json';
import reports from '../../../messages/th/reports.json';
import ui from '../../../messages/th/ui.json';
import versions from '../../../messages/th/versions.json';
import { MAX_VERSIONS_FLAG } from '@/mocks/limits';

import { fetchVersionList } from './api';
import { createVersionHandlers, mockProjectId, mockVersions } from './mocks';
import { VersionList } from './VersionList';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client')>();
  const client = original.createApiClient({
    baseUrl: 'http://localhost/api/v1',
    fetch: (input) => globalThis.fetch(input),
  });
  return { ...original, browserApi: () => client };
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

function mount(count: number, max: number) {
  const onCreate = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="th" messages={{ versions, compare, reports, ui }}>
        <VersionList
          projectId="p1"
          versions={mockVersions()}
          limit={limitState(count, max)}
          selectedId={undefined}
          onSelect={vi.fn()}
          onCreate={onCreate}
          onDelete={vi.fn()}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { onCreate, button: screen.getByRole('button', { name: 'เวอร์ชันใหม่' }) };
}

describe('new version at the version limit', () => {
  it('below the limit: shows n / max and opens the create dialog', () => {
    const { button, onCreate } = mount(3, 10);
    expect(screen.getByText('3 / 10 เวอร์ชัน')).toBeTruthy();
    expect(button.getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByText(/สร้างเวอร์ชันใหม่ไม่ได้/)).toBeNull();
    fireEvent.click(button);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['at', 10],
    ['above', 12],
  ])('%s the limit: aria-disabled, focusable, described by the hint, no create', (_n, count) => {
    const { button, onCreate } = mount(count, 10);
    expect(screen.getByText(`${count} / 10 เวอร์ชัน`)).toBeTruthy();
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(false);
    const hint = screen.getByText(/สร้างเวอร์ชันใหม่ไม่ได้ เพราะโครงการนี้มีเวอร์ชันครบ 10 เวอร์ชันแล้ว/);
    expect(button.getAttribute('aria-describedby')).toBe(hint.closest('p')!.id);
    expect(hint.closest('p')!.textContent).toContain('ลบเวอร์ชันที่ไม่ใช้');
    button.focus();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe('version mocks and the limit', () => {
  const server = setupServer(...createVersionHandlers());
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => server.resetHandlers(...createVersionHandlers()));
  afterAll(() => server.close());

  it('answers with max_versions, 10 unless the flag sets it', async () => {
    expect((await fetchVersionList(mockProjectId)).max).toBe(10);
    localStorage.setItem(MAX_VERSIONS_FLAG, '3');
    const list = await fetchVersionList(mockProjectId);
    expect(list.max).toBe(3);
    expect(list.items).toHaveLength(3);
  });

  it('refuses a new version at the limit with version_limit_reached', async () => {
    localStorage.setItem(MAX_VERSIONS_FLAG, '3');
    const res = await fetch(`http://localhost/api/v1/projects/${mockProjectId}/versions`, {
      method: 'POST',
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('version_limit_reached');
  });
});
