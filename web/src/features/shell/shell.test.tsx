import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import shell from '../../../messages/th/shell.json';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/users',
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
  it('shows role and the admin link only for admins', () => {
    const user = wrap(<AccountMenu user={{ email: 'a@b.th', isAdmin: false }} />);
    expect(user).toContain('บทบาท: ผู้ประเมิน');
    expect(user).toContain('บัญชีของฉัน');
    expect(user).toContain('ออกจากระบบ');
    expect(user).not.toContain('/admin/users');

    const admin = wrap(<AccountMenu user={{ email: 'a@b.th', isAdmin: true }} />);
    expect(admin).toContain('บทบาท: ผู้ดูแลระบบ');
    expect(admin).toContain('/admin/users');
  });
});

describe('AppShell', () => {
  it('has no menu tabs; the logo returns to the dashboard', () => {
    const html = wrap(
      <AppShell variant="app" user={{ email: 'somchai@example.co.th', isAdmin: false }}>
        <p>เนื้อหา</p>
      </AppShell>,
    );
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('<nav');
    expect(html).toContain('somchai@example.co.th');
    expect(html).toContain('เนื้อหา');
  });

  it('renders the six admin menu items for the admin variant', () => {
    const html = wrap(
      <AppShell variant="admin" user={{ email: 'admin@example.co.th', isAdmin: true }}>
        <p>x</p>
      </AppShell>,
    );
    for (const label of [
      'จัดการผู้ใช้',
      'คำแนะนำตัวชี้วัด',
      'เกณฑ์ระดับความเสี่ยง',
      'เกณฑ์ผลกระทบต้นทุนและเวลา',
      'ส่งออกข้อมูลวิจัย',
      'บันทึกการกระทำ',
    ]) {
      expect(html).toContain(label);
    }
    expect(html.match(/<li>/g)).toHaveLength(6);
    expect(html).toMatch(/aria-current="page"[^>]*>จัดการผู้ใช้/);
  });
});

describe('ProjectSteps', () => {
  it('marks the current step and earlier ones as done', () => {
    const html = wrap(<ProjectSteps current="results" />);
    expect(html).toMatch(/aria-current="step"[^>]*>(?:(?!<li).)*ผลการประเมิน/);
    expect(html.match(/เสร็จแล้ว/g)).toHaveLength(2);
    for (const label of ['ข้อมูลโครงการ', 'ประเมินความเสี่ยง', 'แผนจัดการ', 'รายงาน']) {
      expect(html).toContain(label);
    }
  });
});
