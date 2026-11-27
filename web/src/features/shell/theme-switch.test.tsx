// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import auth from '../../../messages/th/auth.json';
import shell from '../../../messages/th/shell.json';
import { resetThemeStoreForTests } from '@/lib/theme/use-theme';

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
}));

import { AuthThemeButton } from '../auth/register/AuthThemeButton';
import { AccountMenu } from './AppShell';
import { ThemeSync } from './ThemeSync';

const root = () => document.documentElement;

function ui(node: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="th" messages={{ shell, auth }}>
      {node}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  root().removeAttribute('data-theme');
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  resetThemeStoreForTests();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  resetThemeStoreForTests();
});

describe('theme switch in the account menu', () => {
  it('shows the label and the three choices as radios, system checked by default', () => {
    render(ui(<AccountMenu user={{ email: 'a@b.th', isAdmin: false }} defaultOpen />));
    expect(screen.getByText('ธีม')).toBeTruthy();
    const radios = screen.getAllByRole('menuitemradio');
    expect(radios.map((r) => r.textContent)).toEqual(['ตามระบบ', 'สว่าง', 'มืด']);
    expect(
      screen.getByRole('menuitemradio', { name: 'ตามระบบ' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it.each([
    ['มืด', 'dark'],
    ['สว่าง', 'light'],
  ])('choosing %s sets data-theme=%s and keeps it after a reload', (name, theme) => {
    const view = render(ui(<AccountMenu user={{ email: 'a@b.th', isAdmin: false }} defaultOpen />));
    fireEvent.click(screen.getByRole('menuitemradio', { name }));
    expect(root().getAttribute('data-theme')).toBe(theme);
    expect(screen.getByRole('menuitemradio', { name }).getAttribute('aria-checked')).toBe('true');
    // The menu stays open, so the pick is seen at once.
    expect(screen.getByRole('menu')).toBeTruthy();

    // A reload: new page, new store, same localStorage.
    view.unmount();
    root().removeAttribute('data-theme');
    resetThemeStoreForTests();
    render(ui(<AccountMenu user={{ email: 'a@b.th', isAdmin: false }} defaultOpen />));
    expect(root().getAttribute('data-theme')).toBe(theme);
    expect(screen.getByRole('menuitemradio', { name }).getAttribute('aria-checked')).toBe('true');
  });

  it('choosing "ตามระบบ" again follows the system theme', () => {
    render(ui(<AccountMenu user={{ email: 'a@b.th', isAdmin: false }} defaultOpen />));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'มืด' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'ตามระบบ' }));
    expect(root().getAttribute('data-theme')).toBe('light');
    expect(window.localStorage.getItem('cre-theme')).toBeNull();
  });
});

describe('theme switch on the auth pages', () => {
  it('is an icon button with a Thai name that opens the same three choices', () => {
    render(ui(<AuthThemeButton />));
    const button = screen.getByRole('button', { name: 'เปลี่ยนธีม' });
    expect(button).toBeTruthy();
    fireEvent.keyDown(button, { key: 'Enter' });
    expect(screen.getAllByRole('menuitemradio').map((r) => r.textContent)).toEqual([
      'ตามระบบ',
      'สว่าง',
      'มืด',
    ]);
  });
});

describe('ThemeSync', () => {
  it('follows the system theme live on a page with no switch', () => {
    let dark = false;
    const listeners = new Set<() => void>();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        get matches() {
          return dark;
        },
        addEventListener: (_: string, l: () => void) => listeners.add(l),
        removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      })),
    );
    render(ui(<ThemeSync />));
    expect(root().getAttribute('data-theme')).toBe('light');
    dark = true;
    for (const l of listeners) l();
    expect(root().getAttribute('data-theme')).toBe('dark');
  });
});
