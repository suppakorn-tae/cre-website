'use client';

import { useTranslations } from 'next-intl';
import { Fragment, useState } from 'react';

import { Button, EmptyState, Skeleton } from '@/components/ui';
import { formatDateTime, formatNumber } from '@/lib/format/locale';

import { useAuditLog, type AuditSummary } from './api';
import { AuditDetail } from './AuditDetail';
import { AuditFilters } from './AuditFilters';
import {
  EMPTY_FILTERS,
  TARGET_TYPES,
  hasFilters,
  toAuditQuery,
  type FilterValues,
} from './filters';
import styles from './audit.module.css';

/** Read-only audit log: filters, table with expandable values, load more (UC-19, FR-40). */
export function AuditLog() {
  const t = useTranslations('admin-audit');
  const [filters, setFilters] = useState<FilterValues>(EMPTY_FILTERS);
  const [open, setOpen] = useState<number | null>(null);
  const log = useAuditLog(toAuditQuery(filters));

  const rows: AuditSummary[] = log.data?.pages.flatMap((p) => p.items) ?? [];
  const total = log.data?.pages.at(-1)?.meta.total ?? 0;
  const columnCount = 5;

  function targetLabel(row: AuditSummary): string {
    const known = (TARGET_TYPES as readonly string[]).includes(row.target_type);
    return `${t(known ? `targets.${row.target_type}` : 'targets.other')} ${row.target_id}`;
  }

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
        <p className={styles.note}>{t('timeNote')}</p>
      </header>

      <AuditFilters
        values={filters}
        onChange={(next) => {
          setFilters(next);
          setOpen(null);
        }}
      />

      {log.isPending && log.fetchStatus !== 'idle' && (
        <div className={styles.loading} role="status" aria-label={t('loading')}>
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      )}

      {log.isError && (
        <div className={styles.error} role="alert">
          <p>{t('loadFailed')}</p>
          <Button variant="secondary" size="sm" onClick={() => log.refetch()}>
            {t('retry')}
          </Button>
        </div>
      )}

      {log.data && rows.length === 0 && (
        <EmptyState
          title={hasFilters(filters) ? t('noResults.title') : t('empty.title')}
          description={hasFilters(filters) ? t('noResults.text') : t('empty.text')}
        />
      )}

      {rows.length > 0 && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>{t('table.caption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('table.time')}</th>
                  <th scope="col">{t('table.admin')}</th>
                  <th scope="col">{t('table.action')}</th>
                  <th scope="col">{t('table.target')}</th>
                  <th scope="col">{t('table.details')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const expanded = open === row.id;
                  const detailId = `audit-detail-${row.id}`;
                  return (
                    <Fragment key={row.id}>
                      <tr>
                        <td data-label={t('table.time')}>{formatDateTime(row.occurred_at)}</td>
                        <td data-label={t('table.admin')}>
                          {row.admin_email ?? t('table.anonymised')}
                        </td>
                        <td data-label={t('table.action')}>{t(`actions.${row.action}`)}</td>
                        <td data-label={t('table.target')}>{targetLabel(row)}</td>
                        <td data-label={t('table.details')}>
                          <button
                            type="button"
                            className={styles.toggle}
                            aria-expanded={expanded}
                            aria-controls={detailId}
                            onClick={() => setOpen(expanded ? null : row.id)}
                          >
                            {expanded ? t('table.hide') : t('table.view')}
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className={styles.detailRow}>
                          <td id={detailId} colSpan={columnCount}>
                            <AuditDetail id={row.id} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.footer}>
            <p className={styles.summary}>
              {t('summary', { shown: formatNumber(rows.length), total: formatNumber(total) })}
            </p>
            {log.hasNextPage && (
              <Button
                variant="secondary"
                disabled={log.isFetchingNextPage}
                onClick={() => log.fetchNextPage()}
              >
                {log.isFetchingNextPage ? t('loadingMore') : t('loadMore')}
              </Button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
