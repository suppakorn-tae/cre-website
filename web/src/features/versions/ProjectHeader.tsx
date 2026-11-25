'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { formatDate, formatNumber } from '@/lib/format/locale';

import type { Project } from './api';
import { planState, projectPaths } from './rules';
import styles from './versions.module.css';

/** Project fields plus entered against expected progress (UC-06). */
export function ProjectHeader({ project }: { project: Project }) {
  const t = useTranslations('versions.detail');
  const state = planState(project.progress_pct, project.expected_progress_pct);
  const island =
    project.island_code === 'other' && project.island_other
      ? project.island_other
      : t(`islands.${project.island_code}`);
  const type =
    project.type_code === 'other' && project.type_other
      ? project.type_other
      : t(`types.${project.type_code}`);
  const planText =
    state.kind === 'onPlan' ? t('onPlan') : t(state.kind, { value: formatNumber(state.points) });
  const baht = formatNumber(project.value_baht);

  return (
    <header className={styles.header}>
      <nav aria-label={t('breadcrumbLabel')} className={styles.crumbs}>
        <Link href="/dashboard">{t('breadcrumbRoot')}</Link>
        <span aria-hidden="true"> / </span>
        <span>
          {project.nickname} {project.name}
        </span>
      </nav>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>
          {project.name} <span className={styles.nickname}>{project.nickname}</span>
        </h1>
        <Link className={styles.secondaryLink} href={projectPaths.edit(project.id)}>
          {t('edit')}
        </Link>
      </div>
      <p className={styles.meta}>
        {[
          island,
          type,
          t('value', { value: baht }),
          t('period', {
            start: formatDate(project.start_date),
            end: formatDate(project.end_date),
          }),
        ].join(' · ')}
      </p>
      <div className={styles.progress}>
        <p className={styles.progressLabel}>{t('progressTitle')}</p>
        <div
          className={styles.bar}
          role="img"
          aria-label={`${t('actual', { value: formatNumber(project.progress_pct) })} · ${t('expected', { value: formatNumber(project.expected_progress_pct) })}`}
        >
          <span className={styles.barActual} style={{ width: `${clamp(project.progress_pct)}%` }} />
          <span
            className={styles.barExpected}
            style={{ insetInlineStart: `${clamp(project.expected_progress_pct)}%` }}
          />
        </div>
        <p className={styles.progressText}>
          {t('actual', { value: formatNumber(project.progress_pct) })}
          {' · '}
          {t('expected', { value: formatNumber(project.expected_progress_pct) })}
          {' · '}
          <span className={state.kind === 'behind' ? styles.behind : undefined}>{planText}</span>
        </p>
      </div>
    </header>
  );
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}
