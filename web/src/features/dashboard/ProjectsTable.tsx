import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { DataTable, LevelBadge, type DataTableColumn } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import { projectPaths } from '../versions/rules';
import type { DashboardProjectItem } from './api';
import styles from './dashboard.module.css';
import { formatMillionBaht } from './format';

const clamp = (n: number) => Math.min(100, Math.max(0, n));

/** H and VH counts of a project's latest submitted version, by project id. */
export type ProjectRiskSplit = ReadonlyMap<string, { h: number; vh: number }>;

type Props = {
  items: DashboardProjectItem[];
  /** Splits the H+VH total into an H and a VH chip when the project is in the map. */
  risks?: ProjectRiskSplit;
  /** Extra row actions after "ประเมิน", "ผล" and "เวอร์ชัน", e.g. edit and delete. */
  extraActions?: (project: DashboardProjectItem) => ReactNode;
};

/**
 * The project list of the dashboard and of `/projects`: a table from 768px up
 * and one card per project below, so the two pages cannot drift apart.
 */
export function ProjectsTable({ items, risks, extraActions }: Props) {
  const t = useTranslations('dashboard.projectsPanel');
  const tIslands = useTranslations('projects.islands');
  const tTypes = useTranslations('projects.types');
  const tLevels = useTranslations('ui.levels');

  const island = (p: DashboardProjectItem) =>
    p.island_code === 'other' && p.island_other ? p.island_other : tIslands(p.island_code);
  const type = (p: DashboardProjectItem) =>
    p.type_code === 'other' && p.type_other ? p.type_other : tTypes(p.type_code);

  const progress = (p: DashboardProjectItem) => {
    const pct = clamp(p.progress_pct);
    return (
      <span className={styles.progressCell}>
        <span
          className={styles.progressTrack}
          role="progressbar"
          aria-label={t('progressLabel', { pct: p.progress_pct })}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span className={styles.progressFill} style={{ width: `${pct}%` }} />
        </span>
        <span className={styles.progressText}>{formatNumber(p.progress_pct)}%</span>
      </span>
    );
  };

  const version = (p: DashboardProjectItem) => {
    return (
      <span className={styles.versionCell}>
        <span className={styles.versionNo}>{t('versionNo', { no: p.latest_version_no })}</span>
        <span className={styles.statusChip} data-status={p.latest_version_status}>
          {t(`status.${p.latest_version_status}`)}
        </span>
      </span>
    );
  };

  const risk = (p: DashboardProjectItem) => {
    if (p.h_vh_count === null) {
      return <span className={styles.itemMeta}>{t('notSubmitted')}</span>;
    }
    const split = risks?.get(p.project_id);
    if (!split) {
      return (
        <span className={styles.riskChip} aria-label={t('riskLabel', { count: p.h_vh_count })}>
          {formatNumber(p.h_vh_count)}
        </span>
      );
    }
    if (split.h + split.vh === 0) return <span className={styles.itemMeta}>0</span>;
    return (
      <span className={styles.chips}>
        {split.h > 0 && <LevelBadge level="H" count={split.h} label={tLevels('H')} />}
        {split.vh > 0 && <LevelBadge level="VH" count={split.vh} label={tLevels('VH')} />}
      </span>
    );
  };

  const actions = (p: DashboardProjectItem, card?: boolean) => {
    return (
      <span className={card ? styles.cardActions : styles.cellActions}>
        <Link
          href={projectPaths.assessment(p.project_id, p.latest_version_id)}
          className={styles.actionOutline}
          aria-label={t('assessLabel', { nickname: p.nickname })}
        >
          {t('assess')}
        </Link>
        {p.latest_submitted_version_id && (
          <Link
            href={projectPaths.results(p.project_id, p.latest_submitted_version_id)}
            className={styles.actionText}
            aria-label={t('resultsLabel', { nickname: p.nickname })}
          >
            {t('results')}
          </Link>
        )}
        <Link
          href={`/projects/${p.project_id}`}
          className={styles.actionText}
          aria-label={t('versionsLabel', { nickname: p.nickname })}
        >
          {t('versionsLink')}
        </Link>
      </span>
    );
  };

  const columns: DataTableColumn<DashboardProjectItem>[] = [
    {
      key: 'nickname',
      header: t('columns.nickname'),
      primary: true,
      render: (p) => <span className={styles.nicknameChip}>{p.nickname}</span>,
    },
    {
      key: 'project',
      header: t('columns.project'),
      render: (p) => (
        <Link href={`/projects/${p.project_id}`} className={styles.nameLink}>
          {p.name}
        </Link>
      ),
    },
    { key: 'island', header: t('columns.island'), render: island },
    { key: 'type', header: t('columns.type'), render: type },
    {
      key: 'value',
      header: t('columns.value'),
      align: 'end',
      render: (p) => formatMillionBaht(p.value_baht),
    },
    {
      key: 'progress',
      header: t('columns.progress'),
      render: progress,
    },
    { key: 'version', header: t('columns.version'), render: version },
    { key: 'risk', header: t('columns.risk'), render: risk },
    {
      key: 'actions',
      header: t('columns.actions'),
      hideHeader: true,
      render: (p) => (
        <span className={styles.actionsStack}>
          {actions(p)}
          {extraActions && <span className={styles.extraActions}>{extraActions(p)}</span>}
        </span>
      ),
    },
  ];

  return (
    <DataTable
      caption={t('tableLabel')}
      columns={columns}
      rows={items}
      rowKey={(p) => p.project_id}
      dense
      renderCard={(p) => (
        <article className={styles.projectCard}>
          <header className={styles.cardHead}>
            <span className={styles.nicknameChip}>{p.nickname}</span>
            <div className={styles.cardTitle}>
              <Link href={`/projects/${p.project_id}`} className={styles.nameLink}>
                {p.name}
              </Link>
              <span className={styles.itemMeta}>
                {t('islandAndType', { island: island(p), type: type(p) })}
              </span>
            </div>
          </header>
          <dl className={styles.cardFacts}>
            <div>
              <dt>{t('columns.value')}</dt>
              <dd>{formatMillionBaht(p.value_baht)}</dd>
            </div>
            <div>
              <dt>{t('columns.version')}</dt>
              <dd>{version(p)}</dd>
            </div>
            <div>
              <dt>{t('columns.risk')}</dt>
              <dd>{risk(p)}</dd>
            </div>
          </dl>
          <div className={styles.cardProgress}>
            <span>{t('progressTitle')}</span>
            {progress(p)}
          </div>
          {actions(p, true)}
          {extraActions && <div className={styles.cardExtra}>{extraActions(p)}</div>}
        </article>
      )}
    />
  );
}
