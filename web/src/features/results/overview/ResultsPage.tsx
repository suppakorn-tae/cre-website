'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, EmptyState, KpiCard, LEVELS, Skeleton, Tabs } from '@/components/ui';
import { fetchProject, projectKey } from '@/features/versions/api';
import { projectPaths } from '@/features/versions/rules';
import { ApiError } from '@/lib/api/errors';
import { formatDateTime, formatNumber } from '@/lib/format/locale';

import { HeatmapTab } from '../heatmap/HeatmapTab';
import { HvhTab } from '../hvh/HvhTab';
import { ResultsTable } from '../table/ResultsTable';
import { useIndicatorNames, useResults, useVersion } from './api';
import { OverviewTab } from './OverviewTab';
import styles from './results.module.css';
import { highCount, TAB_IDS, type TabId } from './rules';
import { subscript } from './format';

const ID_PREFIX = 'results';

/**
 * Results of one version (UC-09): level counts above four tabs. Overview and
 * Detail table live here; IO-56 replaces the `pending` panels of Heat map and
 * H / VH only by adding a case to `renderPanel`.
 */
export function ResultsPage({ projectId, versionId }: { projectId: string; versionId: string }) {
  const t = useTranslations('results');
  const tUi = useTranslations('ui');
  const [tab, setTab] = useState<TabId>('overview');
  const project = useQuery({
    queryKey: projectKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const version = useVersion(projectId, versionId);
  const submitted = version.data?.status === 'submitted';
  const results = useResults(projectId, versionId, submitted);
  const names = useIndicatorNames();

  if (version.isError) {
    const missing = version.error instanceof ApiError && version.error.status === 404;
    return (
      <EmptyState
        title={missing ? t('page.notFound') : t('page.loadFailed')}
        action={
          missing ? (
            <Link className={styles.link} href={`/projects/${projectId}`}>
              {t('page.backToProject')}
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => void version.refetch()}>
              {t('page.retry')}
            </Button>
          )
        }
      />
    );
  }
  if (version.data && !submitted) {
    return (
      <EmptyState
        title={t('draft.title')}
        description={t('draft.text')}
        action={
          <Link className={styles.link} href={projectPaths.assessment(projectId, versionId)}>
            {t('draft.action')}
          </Link>
        }
      />
    );
  }
  if (results.isError || names.isError) {
    return (
      <EmptyState
        title={t('page.loadFailed')}
        action={
          <Button
            variant="secondary"
            onClick={() => void (results.isError ? results.refetch() : names.refetch())}
          >
            {t('page.retry')}
          </Button>
        }
      />
    );
  }
  if (!version.data || !results.data || !names.data) {
    return (
      <div role="status" aria-label={t('page.loading')} className={styles.panelBody}>
        <Skeleton height="2rem" width="50%" />
        <Skeleton height="6rem" />
        <Skeleton height="12rem" />
      </div>
    );
  }

  const { summary, items } = results.data;
  const tabs = TAB_IDS.map((id) => ({
    id,
    label: t(`tabs.${id}`),
    count: id === 'hvh' ? highCount(summary) : undefined,
  }));

  function renderPanel(id: TabId) {
    switch (id) {
      case 'overview':
        return <OverviewTab results={results.data!} names={names.data!} />;
      case 'table':
        return <ResultsTable items={items} names={names.data!} />;
      case 'heatmap':
        return <HeatmapTab items={items} names={names.data!} />;
      default:
        return (
          <HvhTab
            projectId={projectId}
            versionId={versionId}
            results={results.data!}
            names={names.data!}
          />
        );
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <nav aria-label={t('page.breadcrumbLabel')} className={styles.crumbs}>
          <Link href="/dashboard">{t('page.breadcrumbRoot')}</Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/projects/${projectId}`}>{project.data?.nickname ?? '…'}</Link>
        </nav>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{t('page.title', { no: version.data.version_no })}</h1>
          <div className={styles.actions}>
            <Link
              className={styles.actionSecondary}
              href={`/projects/${projectId}/versions/${versionId}/report`}
            >
              {t('page.reportAction')}
            </Link>
            <button type="button" className={styles.actionPrimary} onClick={() => setTab('hvh')}>
              {t('page.adviceAction')}
            </button>
          </div>
        </div>
        <p className={styles.muted}>
          {[
            project.data?.name,
            t('page.submittedAt', { at: formatDateTime(results.data.submitted_at) }),
          ]
            .filter(Boolean)
            .join(' · ')}
          {' · '}
          {t.rich('page.formula', subscript)}
        </p>
        <p className={styles.disclaimer} role="note">
          {t('page.disclaimer')}
        </p>
      </header>

      <div className={styles.counts} role="group" aria-label={t('page.countsLabel')}>
        {[...LEVELS].reverse().map((level) => (
          <KpiCard
            key={level}
            label={`${level} · ${tUi(`levels.${level}`)}`}
            value={formatNumber(summary.level_counts[level])}
            unit={t('page.indicatorUnit')}
          />
        ))}
      </div>

      <Tabs
        items={tabs}
        value={tab}
        onChange={(id) => setTab(id as TabId)}
        label={t('tabs.label')}
        idPrefix={ID_PREFIX}
      />
      <div
        role="tabpanel"
        id={`${ID_PREFIX}-panel-${tab}`}
        aria-labelledby={`${ID_PREFIX}-tab-${tab}`}
        tabIndex={0}
      >
        {renderPanel(tab)}
      </div>
    </div>
  );
}
