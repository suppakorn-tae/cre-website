import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import shell from '../../../messages/th/shell.json';

vi.mock('next/navigation', () => ({
  usePathname: () => '/projects/abc',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { AccountMenu, AppShell } from './AppShell';
import { ProjectSteps } from './ProjectSteps';

const wrap = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ shell }}>
      {node}
    </NextIntlClientProvider>,
  );

describe('AccountMenu', () => {
  it('shows the admin link only for admins', () => {
    const user = wrap(<AccountMenu user={{ email: 'a@b.th', isAdmin: false }} admin={false} />);
    expect(user).toContain('บัญชีของฉัน');
    expect(user).toContain('ออกจากระบบ');
    expect(user).not.toContain('/admin/users');

    const admin = wrap(<AccountMenu user={{ email: 'a@b.th', isAdmin: true }} admin={false} />);
    expect(admin).toContain('/admin/users');
  });
});

describe('AppShell', () => {
  it('renders navigation with the current section marked', () => {
    const html = wrap(
      <AppShell variant="app" user={{ email: 'somchai@example.co.th', isAdmin: false }}>
        <p>เนื้อหา</p>
      </AppShell>,
    );
    expect(html).toContain('แดชบอร์ด');
    expect(html).toMatch(/aria-current="page"[^>]*>โครงการ/);
    expect(html).toContain('somchai@example.co.th');
    expect(html).toContain('เนื้อหา');
  });

  it('renders the admin navigation for the admin variant', () => {
    const html = wrap(
      <AppShell variant="admin" user={{ email: 'admin@example.co.th', isAdmin: true }}>
        <p>x</p>
      </AppShell>,
    );
    expect(html).toContain('จัดการผู้ใช้');
    expect(html).toContain('เมนูผู้ดูแลระบบ');
  });
});

describe('ProjectSteps', () => {
  it('marks the current step and earlier ones as done', () => {
    const html = wrap(<ProjectSteps current="results" />);
    expect(html).toMatch(/aria-current="step"[^>]*>(?:(?!<li).)*ผลการประเมิน/);
    expect(html.match(/เสร็จแล้ว/g)).toHaveLength(2);
    for (const label of ['ข้อมูลโครงการ', 'ประเมิน', 'คำแนะนำและกลยุทธ์', 'รายงาน']) {
      expect(html).toContain(label);
    }
  });
});
