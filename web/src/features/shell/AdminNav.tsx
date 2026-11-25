'use client';

import {
  IconChartBar,
  IconChartPie,
  IconClipboardText,
  IconDownload,
  IconFileText,
  IconUsers,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

import { Icon } from '@/components/ui';

import styles from './admin-nav.module.css';

const ADMIN_NAV: { key: string; href: string; icon: TablerIcon }[] = [
  { key: 'users', href: '/admin/users', icon: IconUsers },
  { key: 'advice', href: '/admin/advice', icon: IconClipboardText },
  { key: 'thresholds', href: '/admin/thresholds', icon: IconChartBar },
  { key: 'impactThresholds', href: '/admin/impact-thresholds', icon: IconChartPie },
  { key: 'export', href: '/admin/export', icon: IconDownload },
  { key: 'audit', href: '/admin/audit', icon: IconFileText },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Admin menu: a 240 px card beside the page from 1024 px up, a horizontal
 * scrolling tab bar under the page title below that.
 */
export function AdminNav() {
  return <AdminNavMenu pathname={usePathname()} />;
}

/** The menu itself. `pathname` is null until the URL is known (the fallback). */
export function AdminNavMenu({ pathname }: { pathname: string | null }) {
  const t = useTranslations('shell.adminNav');
  const list = useRef<HTMLUListElement>(null);

  // On the tab bar, keep the current page's tab in view.
  useEffect(() => {
    list.current
      ?.querySelector('[aria-current="page"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    <nav aria-label={t('label')} className={styles.nav}>
      <h2 className={styles.title}>{t('label')}</h2>
      <ul className={styles.list} ref={list}>
        {ADMIN_NAV.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={styles.link}
              aria-current={pathname && isActive(pathname, item.href) ? 'page' : undefined}
            >
              <Icon icon={item.icon} size={20} />
              <span className={styles.text}>
                {item.key === 'impactThresholds'
                  ? t.rich('impactThresholds', { sub: (chunks) => <sub>{chunks}</sub> })
                  : t(item.key)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
