'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button, DataTable, EmptyState, LevelBadge, type DataTableColumn } from '@/components/ui';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format/locale';

import type { VersionSummary } from './api';
import { canCompare, newestFirst, projectPaths } from './rules';
import styles from './versions.module.css';

type Props = {
  projectId: string;
  versions: VersionSummary[];
  onCreate: () => void;
  onDelete: (version: VersionSummary) => void;
};

/** Versions of one project, newest first (UC-06). Older ones are read-only. */
export function VersionList({ projectId, versions, onCreate, onDelete }: Props) {
  const t = useTranslations('versions.list');
  const rows = newestFirst(versions);
  const none = t('none');

  const columns: DataTableColumn<VersionSummary>[] = [
    {
      key: 'version',
      header: t('columns.version'),
      primary: true,
      render: (v) => <strong>{t('versionNo', { no: v.version_no })}</strong>,
    },
    {
      key: 'status',
      header: t('columns.status'),
      render: (v) => (
        <span className={styles.badges}>
          <span className={v.status === 'submitted' ? styles.badgeOk : styles.badgeMuted}>
            {t(`status.${v.status}`)}
          </span>
          <span className={v.editable ? styles.badgeInfo : styles.badgeMuted}>
            {v.editable ? t('status.latest') : t('status.readOnly')}
          </span>
        </span>
      ),
    },
    { key: 'created', header: t('columns.created'), render: (v) => formatDate(v.created_at) },
    {
      key: 'submitted',
      header: t('columns.submitted'),
      render: (v) => (v.submitted_at ? formatDateTime(v.submitted_at) : t('neverSubmitted')),
    },
    {
      key: 'progress',
      header: t('columns.progress'),
      align: 'end',
      render: (v) =>
        v.progress_at_submit === null
          ? none
          : t('percent', { value: formatNumber(v.progress_at_submit) }),
    },
    {
      key: 'levels',
      header: t('columns.levels'),
      render: (v) =>
        v.very_high_count === null || v.high_count === null ? (
          none
        ) : (
          <span className={styles.badges}>
            <LevelBadge level="VH" count={v.very_high_count} label={t('levelVeryHigh')} />
            <LevelBadge level="H" count={v.high_count} label={t('levelHigh')} />
          </span>
        ),
    },
    {
      key: 'averageRm',
      header: t('columns.averageRm'),
      align: 'end',
      render: (v) =>
        v.average_rm === null
          ? none
          : formatNumber(v.average_rm, undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
    },
    {
      key: 'actions',
      header: t('columns.actions'),
      render: (v) => {
        const no = v.version_no;
        const label = (action: string) => t('actions.forVersion', { action, no });
        const answer = v.editable ? t('actions.answer') : t('actions.viewAnswers');
        return (
          <span className={styles.actions}>
            <Link
              className={styles.link}
              href={projectPaths.assessment(projectId, v.id)}
              aria-label={label(answer)}
            >
              {answer}
            </Link>
            {v.status === 'submitted' && (
              <Link
                className={styles.link}
                href={projectPaths.results(projectId, v.id)}
                aria-label={label(t('actions.results'))}
              >
                {t('actions.results')}
              </Link>
            )}
            <button
              type="button"
              className={styles.dangerLink}
              aria-label={label(t('actions.delete'))}
              onClick={() => onDelete(v)}
            >
              {t('actions.delete')}
            </button>
          </span>
        );
      },
    },
  ];

  return (
    <section className={styles.card} aria-labelledby="versions-title">
      <div className={styles.cardHead}>
        <h2 id="versions-title" className={styles.cardTitle}>
          {t('title')}
        </h2>
        <div className={styles.headActions}>
          {canCompare(versions) && (
            <Link className={styles.secondaryLink} href={projectPaths.compare(projectId)}>
              {t('compare')}
            </Link>
          )}
          <Button onClick={onCreate}>{t('create')}</Button>
        </div>
      </div>
      <DataTable
        caption={t('caption')}
        columns={columns}
        rows={rows}
        rowKey={(v) => v.id}
        empty={
          <EmptyState
            title={t('empty.title')}
            description={t('empty.description')}
            action={<Button onClick={onCreate}>{t('create')}</Button>}
          />
        }
      />
    </section>
  );
}
