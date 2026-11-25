import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { formatNumber } from '@/lib/format/locale';

import { projectPaths } from '../versions/rules';
import type { DashboardProjectItem } from './api';
import styles from './dashboard.module.css';
import { formatMillionBaht } from './format';

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** Project list of the projects card: a table on desktop, cards at phone width. */
export function ProjectsTable({ items }: { items: DashboardProjectItem[] }) {
  const t = useTranslations('dashboard.projectsPanel');
  const tIslands = useTranslations('projects.islands');
  const tTypes = useTranslations('projects.types');
  const col = (key: string) => t(`columns.${key}`);

  return (
    <table className={styles.table} aria-label={t('tableLabel')}>
      <thead>
        <tr>
          <th scope="col">{col('project')}</th>
          <th scope="col">{col('island')}</th>
          <th scope="col">{col('type')}</th>
          <th scope="col" className={styles.num}>
            {col('value')}
          </th>
          <th scope="col">{col('progress')}</th>
          <th scope="col">{col('version')}</th>
          <th scope="col">{col('risk')}</th>
          <th scope="col">{col('actions')}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <tr key={p.project_id}>
            <td className={styles.cellProject}>
              <span className={styles.nickname}>{p.nickname}</span>
              <span className={styles.projectName}>{p.name}</span>
            </td>
            <td data-label={col('island')}>
              {p.island_code === 'other' && p.island_other
                ? p.island_other
                : tIslands(p.island_code)}
            </td>
            <td data-label={col('type')}>
              {p.type_code === 'other' && p.type_other ? p.type_other : tTypes(p.type_code)}
            </td>
            <td data-label={col('value')} className={styles.num}>
              {formatMillionBaht(p.value_baht)}
            </td>
            <td data-label={col('progress')}>
              <span className={styles.progressCell}>
                <span
                  className={styles.progressTrack}
                  role="progressbar"
                  aria-label={t('progressLabel', { pct: p.progress_pct })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={clamp(p.progress_pct)}
                >
                  <span
                    className={styles.progressFill}
                    style={{ width: `${clamp(p.progress_pct)}%` }}
                  />
                </span>
                <span className={styles.progressText}>{formatNumber(p.progress_pct)}%</span>
              </span>
            </td>
            <td data-label={col('version')}>
              {t('versionNo', { no: p.latest_version_no })}{' '}
              <span className={styles.statusChip} data-status={p.latest_version_status}>
                {t(`status.${p.latest_version_status}`)}
              </span>
            </td>
            <td data-label={col('risk')}>
              {p.h_vh_count === null ? (
                <span className={styles.itemMeta}>{t('notSubmitted')}</span>
              ) : (
                <span
                  className={styles.riskChip}
                  aria-label={t('riskLabel', { count: p.h_vh_count })}
                >
                  {formatNumber(p.h_vh_count)}
                </span>
              )}
            </td>
            <td className={styles.cellActions}>
              <Link href={projectPaths.assessment(p.project_id, p.latest_version_id)}>
                {t('assess')}
              </Link>
              {p.latest_submitted_version_id && (
                <Link href={projectPaths.results(p.project_id, p.latest_submitted_version_id)}>
                  {t('results')}
                </Link>
              )}
              <Link href={`/projects/${p.project_id}`}>{t('versionsLink')}</Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
