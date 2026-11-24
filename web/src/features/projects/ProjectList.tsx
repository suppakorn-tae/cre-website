'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Input,
  Pagination,
  Skeleton,
  Toast,
  type DataTableColumn,
} from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import { PAGE_SIZE, useDeleteProject, useProjects } from './api';
import { useProjectLabels } from './labels';
import styles from './projects.module.css';
import type { Project } from './validation';

const SEARCH_DELAY_MS = 300;

/** Own projects: search by name, nickname or island, paged, with delete. */
export function ProjectList() {
  const t = useTranslations('projects.list');
  const tUi = useTranslations('ui');
  const tUnits = useTranslations('projects.units');
  const labels = useProjectLabels();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [toDelete, setToDelete] = useState<Project | null>(null);
  const [notice, setNotice] = useState<'deleted' | 'failed' | null>(null);

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

  const projects = useProjects(q, page);
  const remove = useDeleteProject();

  const data = projects.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function confirmDelete() {
    if (!toDelete) return;
    remove.mutate(toDelete.id, {
      onSuccess: () => {
        setNotice('deleted');
        // Deleting the last row of the last page would leave an empty page.
        if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      },
      onError: () => setNotice('failed'),
      onSettled: () => setToDelete(null),
    });
  }

  const columns: DataTableColumn<Project>[] = [
    {
      key: 'project',
      header: t('columns.project'),
      primary: true,
      render: (p) => (
        <Link href={`/projects/${p.id}`} className={styles.projectLink}>
          <span className={styles.nickname}>{p.nickname}</span>
          <span className={styles.projectName}>{p.name}</span>
        </Link>
      ),
    },
    {
      key: 'island',
      header: t('columns.island'),
      render: (p) => labels.island(p.island_code, p.island_other),
    },
    {
      key: 'type',
      header: t('columns.type'),
      render: (p) => labels.type(p.type_code, p.type_other),
    },
    {
      key: 'value',
      header: t('columns.value'),
      align: 'end',
      render: (p) => `${formatNumber(p.value_baht)} ${tUnits('baht')}`,
    },
    {
      key: 'progress',
      header: t('columns.progress'),
      render: (p) =>
        t('progressCell', {
          actual: formatNumber(p.progress_pct),
          expected: p.expected_progress_pct,
        }),
    },
    {
      key: 'versions',
      header: t('columns.versions'),
      render: (p) =>
        p.version_count > 0 ? t('versionCell', { count: p.version_count }) : t('noVersions'),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      render: (p) => (
        <span className={styles.rowActions}>
          <Link href={`/projects/${p.id}/edit`} className={styles.rowLink}>
            {t('edit')}
          </Link>
          <button type="button" className={styles.rowDelete} onClick={() => setToDelete(p)}>
            {t('delete')}
          </button>
        </span>
      ),
    },
  ];

  const searching = q !== '';
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(total, page * PAGE_SIZE);

  return (
    <section className={styles.listPage}>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        <Link href="/projects/new" className={styles.createLink}>
          {t('create')}
        </Link>
      </header>

      <Input
        type="search"
        label={t('searchLabel')}
        placeholder={t('searchPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className={styles.search}
        autoComplete="off"
      />

      {notice && (
        <div className={styles.notice}>
          <Toast
            title={notice === 'deleted' ? t('deleted') : t('deleteFailed')}
            tone={notice === 'deleted' ? 'success' : 'error'}
            closeLabel={tUi('close')}
            onClose={() => setNotice(null)}
          />
        </div>
      )}

      {projects.isPending && (
        <div className={styles.loading} role="status" aria-label={t('loading')}>
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {projects.isError && (
        <div className={styles.error} role="alert">
          <p>{t('loadFailed')}</p>
          <Button variant="secondary" size="sm" onClick={() => projects.refetch()}>
            {t('retry')}
          </Button>
        </div>
      )}

      {data && (
        <div className={projects.isPlaceholderData ? styles.stale : undefined}>
          <DataTable
            caption={t('tableCaption')}
            columns={columns}
            rows={data.items}
            rowKey={(p) => p.id}
            empty={
              searching ? (
                <EmptyState title={t('noResults.title')} description={t('noResults.text')} />
              ) : (
                <EmptyState
                  title={t('empty.title')}
                  description={t('empty.text')}
                  action={
                    <Link href="/projects/new" className={styles.createLink}>
                      {t('empty.action')}
                    </Link>
                  }
                />
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
              <Pagination
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

      <ConfirmDialog
        open={toDelete !== null}
        destructive
        title={t('deleteDialog.title')}
        confirmLabel={remove.isPending ? t('deleteDialog.deleting') : t('deleteDialog.confirm')}
        cancelLabel={tUi('cancel')}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        {toDelete && (
          <>
            <p>{t('deleteDialog.body', { nickname: toDelete.nickname, name: toDelete.name })}</p>
            <p>{t('deleteDialog.research')}</p>
          </>
        )}
      </ConfirmDialog>
    </section>
  );
}
