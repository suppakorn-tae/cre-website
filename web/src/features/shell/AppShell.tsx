'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactNode } from 'react';

import { browserApi } from '@/lib/api/client';
import '@/styles/tokens.css';

import { AdminNav } from './AdminNav';
import { LOGGED_OUT_PATH } from './login-path';
import { signOut } from './logout';
import { nextMenuIndex } from './menu-keys';
import styles from './shell.module.css';

export type ShellVariant = 'app' | 'admin';
export type ShellUser = { email: string; isAdmin: boolean };

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
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [lastPath, setLastPath] = useState(pathname);

  // Close the account menu when the page changes.
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
    items?.[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (e.key === 'Tab') {
        setMenuOpen(false);
        return;
      }
      const list = Array.from(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [],
      );
      const current = list.indexOf(document.activeElement as HTMLElement);
      const next = nextMenuIndex(e.key, current, list.length);
      if (next !== null) {
        e.preventDefault();
        list[next]?.focus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [menuOpen]);

  const admin = variant === 'admin';

  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        {t('skipToContent')}
      </a>
      <header className={styles.header}>
        <Link href="/dashboard" className={styles.brand}>
          <span className={styles.brandName}>{t('brand.name')}</span>
          <span className={styles.tagline}>{t('brand.tagline')}</span>
        </Link>
        <div className={styles.account} ref={menuRef}>
          <button
            type="button"
            ref={buttonRef}
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
            {user.isAdmin && (
              <span className={styles.badge} data-testid="admin-badge">
                {t('account.adminBadge')}
              </span>
            )}
          </button>
          {menuOpen && <AccountMenu user={user} />}
        </div>
      </header>

      {admin ? (
        <div className={styles.adminBody}>
          <AdminNav />
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

export function AccountMenu({ user }: { user: ShellUser }) {
  const t = useTranslations('shell.account');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

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
    <div role="menu" className={styles.menu}>
      <span className={styles.role}>{user.isAdmin ? t('roleAdmin') : t('roleUser')}</span>
      <Link role="menuitem" tabIndex={-1} href="/account" className={styles.menuItem}>
        {t('myAccount')}
      </Link>
      {user.isAdmin && (
        <Link role="menuitem" tabIndex={-1} href="/admin/users" className={styles.menuItem}>
          {t('admin')}
        </Link>
      )}
      <button
        type="button"
        role="menuitem"
        className={styles.menuItem}
        tabIndex={-1}
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
