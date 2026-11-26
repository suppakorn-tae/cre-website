import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import shell from '../../../messages/th/shell.json';

vi.mock('next/navigation', () => ({
  usePathname: () => '/admin/users',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { AccountControl, AccountMenu, AdminSide, AppShell } from './AppShell';
import { ProjectSteps } from './ProjectSteps';
import { ContentSkeleton } from './Skeletons';

const wrap = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ shell }}>
      {node}
    </NextIntlClientProvider>,
  );

describe('AccountMenu', () => {
  it('renders the closed trigger with the e-mail, a chevron and a name', () => {
    const html = wrap(<AccountMenu user={{ email: 'a@b.th', isAdmin: false }} />);
    expect(html).toContain('a@b.th');
    expect(html).toContain('aria-label="เมนูบัญชี"');
    expect(html).toContain('tabler-icon-chevron-down');
    expect(html).not.toContain('role="menu"');
  });
});

describe('AppShell', () => {
  it('has no menu tabs; the logo returns to the dashboard', () => {
    const html = wrap(
      <AppShell
        variant="app"
        account={<AccountControl user={{ email: 'somchai@example.co.th', isAdmin: false }} />}
      >
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
      <AppShell
        variant="admin"
        account={<AccountControl user={{ email: 'admin@example.co.th', isAdmin: true }} />}
        side={<AdminSide />}
      >
        <p>x</p>
      </AppShell>,
    );
    for (const label of [
      'จัดการผู้ใช้',
      'คำแนะนำตัวชี้วัด',
      'เกณฑ์ RL (a–e)',
      'RI<sub>C</sub> / RI<sub>T</sub>',
      'ส่งออกข้อมูลวิจัย',
      'Audit log',
    ]) {
      expect(html).toContain(label);
    }
    expect(html.match(/<li>/g)).toHaveLength(6);
    expect(html).toMatch(/aria-current="page"[^>]*>(?:(?!<li).)*จัดการผู้ใช้/);
    // Every item has a decorative icon (the header has its own, outside the nav).
    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
    expect(nav.match(/<svg[^>]*aria-hidden="true"/g)).toHaveLength(6);
  });
});

describe('AppShell admin layout and header', () => {
  const render = (variant: 'app' | 'admin', isAdmin: boolean) =>
    wrap(
      <AppShell
        variant={variant}
        account={<AccountControl user={{ email: 'x@example.co.th', isAdmin }} />}
        side={variant === 'admin' ? <AdminSide /> : undefined}
      >
        <p>x</p>
      </AppShell>,
    );

  it('shows the admin badge for admins only', () => {
    expect(render('admin', true)).toContain('data-testid="admin-badge"');
    expect(render('app', true)).toContain('data-testid="admin-badge"');
    expect(render('app', false)).not.toContain('admin-badge');
  });

  it('titles the admin menu and keeps it as one labelled nav with no toggle', () => {
    const html = render('admin', true);
    expect(html).toContain('เมนูผู้ดูแลระบบ');
    expect(html).toMatch(/<nav[^>]*aria-label="เมนูผู้ดูแลระบบ"/);
    expect(html.match(/<nav/g)).toHaveLength(1);
    expect(html).not.toContain('aria-controls="admin-nav"');
  });

  it('writes the badge as Admin', () => {
    expect(render('admin', true)).toMatch(/data-testid="admin-badge"[^>]*>Admin</);
  });

  it('renders the account button as a closed menu button', () => {
    const html = render('app', false);
    expect(html).toMatch(/aria-haspopup="menu"[^>]*aria-expanded="false"/);
    expect(html).not.toContain('role="menu"');
  });

  it('renders the frame without an account control while the session loads', () => {
    const html = wrap(
      <AppShell variant="app" account={<span>skeleton</span>}>
        <p>x</p>
      </AppShell>,
    );
    expect(html).toContain('href="#main"');
    expect(html).toContain('href="/dashboard"');
    expect(html).toContain('skeleton');
    expect(html).not.toContain('aria-haspopup');
  });

  it('sends no admin menu until the side slot is filled', () => {
    const html = wrap(
      <AppShell variant="admin" account={<span>skeleton</span>} side={<span>side skeleton</span>}>
        <p>x</p>
      </AppShell>,
    );
    expect(html).toContain('side skeleton');
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('/admin/users');
  });

  it('does not render the admin sidebar for the app variant', () => {
    expect(render('app', true)).not.toContain('<nav');
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

describe('ContentSkeleton', () => {
  it('announces the loading state in Thai', () => {
    const html = wrap(<ContentSkeleton />);
    expect(html).toContain('role="status"');
    expect(html).toContain('กำลังโหลด');
  });
});
