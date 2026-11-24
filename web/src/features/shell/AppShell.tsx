'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { browserApi } from '@/lib/api/client';

import { LOGIN_PATH } from './login-path';
import styles from './shell.module.css';

export type ShellVariant = 'app' | 'admin';
export type ShellUser = { email: string; isAdmin: boolean };

const APP_NAV = [
  { key: 'dashboard', href: '/dashboard' },
  { key: 'projects', href: '/projects' },
] as const;

const ADMIN_NAV = [
  { key: 'users', href: '/admin/users' },
  { key: 'advice', href: '/admin/advice' },
  { key: 'thresholds', href: '/admin/thresholds' },
  { key: 'audit', href: '/admin/audit' },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  variant,
  user,
  children,
}: {
  variant: ShellVariant;
  user: ShellUser;
  children: ReactNode;
}) {
  const t = useTranslations('shell');
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [lastPath, setLastPath] = useState(pathname);

  // Close both layers when the page changes.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setDrawerOpen(false);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen && !menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        setMenuOpen(false);
      }
    };
    const onPointer = (e: MouseEvent) => {
      if (menuOpen && !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [drawerOpen, menuOpen]);

  const admin = variant === 'admin';
  const items = admin
    ? ADMIN_NAV.map((i) => ({ ...i, label: t(`adminNav.${i.key}`) }))
    : APP_NAV.map((i) => ({ ...i, label: t(`nav.${i.key}`) }));
  const navLabel = admin ? t('adminNav.label') : t('nav.label');

  const links = (
    <ul className={styles.navList}>
      {items.map((item) => (
        <li key={item.href}>
          <Link
            href={item.href}
            className={styles.navLink}
            aria-current={isActive(pathname, item.href) ? 'page' : undefined}
          >
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        {t('skipToContent')}
      </a>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.burger}
          aria-label={t('nav.open')}
          aria-expanded={drawerOpen}
          aria-controls="shell-drawer"
          onClick={() => setDrawerOpen(true)}
        >
          <span aria-hidden="true">☰</span>
        </button>
        <Link href="/dashboard" className={styles.brand}>
          <span className={styles.brandName}>{t('brand.name')}</span>
          <span className={styles.tagline}>{t('brand.tagline')}</span>
        </Link>
        {!admin && (
          <nav aria-label={navLabel} className={styles.topNav}>
            {links}
          </nav>
        )}
        <div className={styles.account} ref={menuRef}>
          <button
            type="button"
            className={styles.accountButton}
            aria-label={t('account.menuLabel')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span className={styles.avatar} aria-hidden="true">
              {user.email.charAt(0).toUpperCase()}
            </span>
            <span className={styles.email}>{user.email}</span>
          </button>
          {menuOpen && <AccountMenu user={user} admin={admin} />}
        </div>
      </header>

      {admin ? (
        <div className={styles.adminBody}>
          <nav aria-label={navLabel} className={styles.sideNav}>
            {links}
          </nav>
          <main id="main" className={styles.main}>
            {children}
          </main>
        </div>
      ) : (
        <main id="main" className={styles.main}>
          {children}
        </main>
      )}

      {drawerOpen && (
        <div className={styles.drawerRoot}>
          <button
            type="button"
            className={styles.scrim}
            aria-label={t('nav.close')}
            onClick={() => setDrawerOpen(false)}
          />
          <nav id="shell-drawer" aria-label={navLabel} className={styles.drawer}>
            {links}
          </nav>
        </div>
      )}
    </div>
  );
}

export function AccountMenu({ user, admin }: { user: ShellUser; admin: boolean }) {
  const t = useTranslations('shell.account');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function logout() {
    setBusy(true);
    setFailed(false);
    try {
      await browserApi().POST('/auth/logout');
      router.replace(LOGIN_PATH);
      router.refresh();
    } catch {
      setBusy(false);
      setFailed(true);
    }
  }

  return (
    <div role="menu" className={styles.menu}>
      {user.isAdmin && <span className={styles.role}>{t('roleAdmin')}</span>}
      <Link role="menuitem" href="/account" className={styles.menuItem}>
        {t('myAccount')}
      </Link>
      {user.isAdmin && !admin && (
        <Link role="menuitem" href="/admin/users" className={styles.menuItem}>
          {t('admin')}
        </Link>
      )}
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        disabled={busy}
        onClick={logout}
      >
        {busy ? t('loggingOut') : t('logout')}
      </button>
      {failed && (
        <p role="alert" className={styles.menuError}>
          {t('logoutFailed')}
        </p>
      )}
    </div>
  );
}
