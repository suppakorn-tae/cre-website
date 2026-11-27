'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { IconChevronDown, IconLogout, IconShieldCheck, IconUser } from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState, type ReactNode } from 'react';

import { Icon } from '@/components/ui';
import { Logo } from '@/components/ui/Logo';
import { browserApi } from '@/lib/api/client';
import '@/styles/tokens.css';

import { AdminNav, AdminNavMenu } from './AdminNav';
import { accountMenuLinks, roleKey } from './account-menu';
import { LOGGED_OUT_PATH } from './login-path';
import { signOut } from './logout';
import styles from './shell.module.css';
import { ThemeMenuGroup } from './ThemeSwitch';
import { ThemeSync } from './ThemeSync';

export type ShellVariant = 'app' | 'admin';
export type ShellUser = { email: string; isAdmin: boolean };

/**
 * The frame around every signed-in page: skip link, header with the logo, the
 * admin side menu and the main region. It does not read the session or the
 * URL, so it prerenders into the static shell. The session-dependent parts
 * arrive as `account` (the header's account control) and `children` (the
 * guarded page).
 */
export function AppShell({
  variant,
  account,
  side,
  children,
}: {
  variant: ShellVariant;
  account: ReactNode;
  /** The admin side menu. Only given after the session check, see SessionGate. */
  side?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('shell');

  return (
    <div className={styles.shell}>
      <ThemeSync />
      <a href="#main" className={styles.skip}>
        {t('skipToContent')}
      </a>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.brand}>
          <Logo variant="header" />
        </Link>
        {account}
      </header>

      {variant === 'admin' ? (
        <div className={styles.adminBody}>
          {side}
          <main id="main" className={styles.main}>
            {children}
          </main>
        </div>
      ) : (
        <main id="main" className={styles.main}>
          {children}
        </main>
      )}
    </div>
  );
}

/** The admin side menu. Render it only once the session is known to be an admin's. */
export function AdminSide() {
  // usePathname() needs the request URL, so it waits behind a boundary.
  return (
    <Suspense fallback={<AdminNavMenu pathname={null} />}>
      <AdminNav />
    </Suspense>
  );
}

/** The header's account control: the user menu. Needs the signed-in user. */
export function AccountControl({ user }: { user: ShellUser }) {
  return (
    <div className={styles.account}>
      <AccountMenu user={user} />
    </div>
  );
}

const menuItemBase =
  'flex h-control-md cursor-pointer select-none items-center gap-3 rounded-control px-3 text-body no-underline outline-none data-[disabled]:cursor-default data-[disabled]:text-disabled';
const menuItem = `${menuItemBase} text-text data-[highlighted]:bg-blue-50 data-[highlighted]:text-primary aria-[current=page]:bg-blue-50 aria-[current=page]:font-semibold aria-[current=page]:text-primary`;
const LINK_ICONS = { myAccount: IconUser, admin: IconShieldCheck } as const;
const dangerItem = `${menuItemBase} text-error data-[highlighted]:bg-error-bg`;

/** The user menu: avatar, e-mail and chevron open a Radix menu (arrow keys, Home/End, Esc). */
export function AccountMenu({ user, defaultOpen }: { user: ShellUser; defaultOpen?: boolean }) {
  const t = useTranslations('shell.account');
  const pathname = usePathname();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const avatar = user.email.charAt(0).toUpperCase();

  async function logout() {
    setBusy(true);
    setFailed(false);
    try {
      await signOut(browserApi());
    } catch {
      setBusy(false);
      setFailed(true);
      return;
    }
    router.replace(LOGGED_OUT_PATH);
    router.refresh();
  }

  return (
    <DropdownMenu.Root defaultOpen={defaultOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className={styles.accountButton}
          aria-label={`${user.email}${user.isAdmin ? ` ${t('adminBadge')}` : ''} ${t('menuLabel')}`}
        >
          {/* The letter is drawn by CSS, so it is not text a voice-control user must say. */}
          <span className={styles.avatar} data-initial={avatar} aria-hidden="true" />
          <span className={styles.email}>{user.email}</span>
          {/* A space between the parts, so the visible text reads as the label does. */}{' '}
          {user.isAdmin && (
            <span className={styles.badge} data-testid="admin-badge">
              {t('adminBadge')}
            </span>
          )}
          <Icon icon={IconChevronDown} size={16} className={styles.chevron} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="end"
        sideOffset={8}
        className="z-50 min-w-60 max-w-80 rounded-card border border-border bg-card p-2 shadow-floating"
      >
        <div className="flex items-center gap-3 px-3 py-2">
          <span className={styles.avatar} aria-hidden="true">
            {avatar}
          </span>
          <div className="min-w-0">
            <p className="m-0 text-body font-semibold break-words">{user.email}</p>
            <p className="m-0 text-caption text-text-muted">{t(roleKey(user))}</p>
          </div>
        </div>
        <DropdownMenu.Separator className="my-1 h-px bg-divider" />
        {accountMenuLinks(user, pathname).map((link) => (
          <DropdownMenu.Item key={link.key} asChild>
            <Link
              href={link.href}
              className={menuItem}
              aria-current={link.current ? 'page' : undefined}
            >
              <Icon icon={LINK_ICONS[link.key]} size={18} />
              {t(link.key)}
            </Link>
          </DropdownMenu.Item>
        ))}
        <DropdownMenu.Separator className="my-1 h-px bg-divider" />
        <ThemeMenuGroup />
        <DropdownMenu.Separator className="my-1 h-px bg-divider" />
        <DropdownMenu.Item
          disabled={busy}
          className={dangerItem}
          // Keep the menu open while signing out, so a failure shows in it.
          onSelect={(e) => {
            e.preventDefault();
            void logout();
          }}
        >
          <Icon icon={IconLogout} size={18} />
          {busy ? t('loggingOut') : t('logout')}
        </DropdownMenu.Item>
        {failed && (
          <p role="alert" className="m-0 px-3 py-1 text-caption text-error">
            {t('logoutFailed')}
          </p>
        )}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}
