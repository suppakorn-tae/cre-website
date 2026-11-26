'use client';

import { IconChevronRight } from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  Button,
  DataTable,
  EmptyState,
  Icon,
  Input,
  Select,
  Skeleton,
  type DataTableColumn,
} from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import {
  PAGE_SIZE,
  orderedMethods,
  useAdminUsers,
  useOwnUserId,
  type AccountStatus,
  type AdminUser,
  type UserRole,
} from './api';
import { RoleBadge, StatusBadge } from './UserBadges';
import { UserPager } from './UserPager';
import styles from './users.module.css';

const SEARCH_DELAY_MS = 300;

/** All users: search by e-mail or organisation, filter by role and status, paged. */
export function UserList() {
  const t = useTranslations('admin-users.list');
  const tMethods = useTranslations('admin-users.methods');
  const tRoles = useTranslations('admin-users.roles');
  const tStatuses = useTranslations('admin-users.statuses');
  const tUi = useTranslations('ui');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [role, setRole] = useState<UserRole | ''>('');
  const [status, setStatus] = useState<AccountStatus | ''>('');
  const [page, setPage] = useState(1);

  // Search after a short pause in typing; a new search starts on page 1.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQ((prev) => {
        const next = text.trim();
        if (next !== prev) setPage(1);
        return next;
      });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const users = useAdminUsers({ q, role, status }, page);
  const ownId = useOwnUserId().data;

  const data = users.data;
  const total = data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);
  const filtered = q !== '' || role !== '' || status !== '';

  const accountName = (u: AdminUser) => u.email ?? t('deletedAccount');

  const columns: DataTableColumn<AdminUser>[] = [
    {
      key: 'email',
      header: t('columns.email'),
      primary: true,
      render: (u) => (
        <span className={styles.emailCell}>
          <span
            className={`${styles.truncate} ${u.email ? styles.email : styles.emailDeleted}`}
            title={accountName(u)}
          >
            {accountName(u)}
          </span>
          {u.id === ownId && <span className={styles.you}>{t('you')}</span>}
        </span>
      ),
    },
    {
      key: 'organisation',
      header: t('columns.organisation'),
      render: (u) =>
        u.organisation ? (
          <span className={`${styles.truncate} ${styles.org}`} title={u.organisation}>
            {u.organisation}
          </span>
        ) : (
          t('noOrganisation')
        ),
    },
    { key: 'role', header: t('columns.role'), render: (u) => <RoleBadge role={u.role} /> },
    {
      key: 'status',
      header: t('columns.status'),
      render: (u) => <StatusBadge status={u.status} />,
    },
    {
      key: 'methods',
      header: t('columns.methods'),
      render: (u) => (
        <span className={styles.methods}>
          {u.sign_in_methods.length === 0
            ? tMethods('none')
            : orderedMethods(u.sign_in_methods)
                .map((m) => tMethods(m))
                .join(', ')}
        </span>
      ),
    },
    {
      key: 'projects',
      header: t('columns.projects'),
      align: 'end',
      render: (u) => formatNumber(u.project_count),
    },
    {
      key: 'versions',
      header: t('columns.versions'),
      align: 'end',
      render: (u) => formatNumber(u.version_count),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      render: (u) => (
        <Link
          href={`/admin/users/${u.id}`}
          className={styles.rowLink}
          aria-label={t('viewLabel', { account: accountName(u) })}
          title={t('viewLabel', { account: accountName(u) })}
        >
          <Icon icon={IconChevronRight} size={18} />
        </Link>
      ),
    },
  ];

  return (
    <section className={styles.page}>
      <header className={styles.pageHead}>
        <h1 className={styles.title}>{t('title')}</h1>
        {data && <p className={styles.subtitle}>{t('subtitle', { total: formatNumber(total) })}</p>}
      </header>

      <div className={styles.filters}>
        <Input
          type="search"
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className={styles.search}
          autoComplete="off"
        />
        <Select
          label={t('roleFilter')}
          value={role}
          onChange={(e) => {
            setRole(e.target.value as UserRole | '');
            setPage(1);
          }}
          placeholder={t('all')}
          options={[
            { value: 'user', label: tRoles('user') },
            { value: 'admin', label: tRoles('admin') },
          ]}
          className={styles.filter}
        />
        <Select
          label={t('statusFilter')}
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as AccountStatus | '');
            setPage(1);
          }}
          placeholder={t('all')}
          options={[
            { value: 'active', label: tStatuses('active') },
            { value: 'deactivated', label: tStatuses('deactivated') },
            { value: 'deleted', label: tStatuses('deleted') },
          ]}
          className={styles.filter}
        />
      </div>

      {users.isPending && (
        <div className={styles.loading} role="status" aria-label={t('loading')}>
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {users.isError && (
        <div className={styles.error} role="alert">
          <p>{t('loadFailed')}</p>
          <Button variant="secondary" size="sm" onClick={() => users.refetch()}>
            {t('retry')}
          </Button>
        </div>
      )}

      {data && (
        <div className={users.isPlaceholderData ? styles.stale : undefined}>
          <DataTable
            caption={t('tableCaption')}
            columns={columns}
            rows={data.items}
            rowKey={(u) => u.id}
            empty={
              filtered ? (
                <EmptyState title={t('noResults.title')} description={t('noResults.text')} />
              ) : (
                <EmptyState title={t('empty.title')} description={t('empty.text')} />
              )
            }
          />
          {total > 0 && (
            <div className={styles.footer}>
              <p className={styles.summary}>
                {t('summary', {
                  from: formatNumber(from),
                  to: formatNumber(to),
                  total: formatNumber(total),
                })}
              </p>
              <UserPager
                page={page}
                pageCount={pageCount}
                onChange={setPage}
                labels={{
                  nav: tUi('pagination.nav'),
                  previous: tUi('pagination.previous'),
                  next: tUi('pagination.next'),
                  page: (n) => tUi('pagination.page', { n }),
                }}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
