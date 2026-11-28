// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import projects from '../../../messages/th/projects.json';

let answer = { total: 2, max_projects: 3 };
vi.mock('@/lib/api/client', () => ({
  browserApi: () => ({ GET: async () => ({ data: answer }) }),
}));
vi.mock('next/link', () => ({
  default: ({ href, ...rest }: { href: string } & Record<string, unknown>) => (
    <a href={href} {...rest} />
  ),
}));

import { AddProjectLink, ProjectLimitHint } from './AddProjectLink';

afterEach(cleanup);

function mount(withLimit = true) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="th" messages={{ projects }}>
        <AddProjectLink label="เพิ่มโครงการ" withLimit={withLimit} />
        <ProjectLimitHint />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return screen.getByRole('link', { name: 'เพิ่มโครงการ' });
}

describe('add project link and the project limit', () => {
  it('below the limit: shows n / max and an enabled link', async () => {
    answer = { total: 2, max_projects: 3 };
    const link = mount();
    expect(await screen.findByText('2 / 3 โครงการ')).toBeTruthy();
    expect(link.getAttribute('aria-disabled')).toBeNull();
    expect(link.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByText(/สร้างโครงการใหม่ไม่ได้/)).toBeNull();
  });

  it.each([
    ['at', 3],
    ['above', 5],
  ])(
    '%s the limit: the link is aria-disabled, focusable and described by the hint',
    async (_n, total) => {
      answer = { total, max_projects: 3 };
      const link = mount();
      await screen.findByText(`${total} / 3 โครงการ`);
      await waitFor(() => expect(link.getAttribute('aria-disabled')).toBe('true'));
      const hint = screen.getByText(/สร้างโครงการใหม่ไม่ได้ เพราะมีโครงการครบ 3 โครงการแล้ว/);
      expect(hint.closest('p')?.textContent).toContain('ลบโครงการที่ไม่ใช้');
      expect(link.getAttribute('aria-describedby')).toBe(hint.closest('p')!.id);
      // Still a link in the tab order, not removed, and a click does not navigate.
      expect(link.getAttribute('href')).toBe('/projects/new');
      expect(link.getAttribute('tabindex')).not.toBe('-1');
      link.focus();
      expect(document.activeElement).toBe(link);
      expect(fireEvent.click(link)).toBe(false);
    },
  );

  it('without withLimit it is a plain link and asks nothing', () => {
    answer = { total: 3, max_projects: 3 };
    const link = mount(false);
    expect(link.getAttribute('aria-disabled')).toBeNull();
    expect(screen.queryByText(/\/ \d+ โครงการ/)).toBeNull();
  });
});
