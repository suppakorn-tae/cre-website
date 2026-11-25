'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, EmptyState, KpiCard, Skeleton } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import { useDashboard } from './api';
import { LevelChart, ProjectRiskChart } from './Charts';
import styles from './dashboard.module.css';
import { IslandsPanel, ProjectsPanel, TopIndicatorsPanel } from './Panels';

type PanelId = 'projects' | 'indicators' | 'islands';

/** First screen after log in: KPI cards, two charts and the panel of the selected card. */
export function DashboardPage() {
  const t = useTranslations('dashboard');
  const tIslands = useTranslations('projects.islands');
  const [panel, setPanel] = useState<PanelId>('projects');
  const dashboard = useDashboard();
  const data = dashboard.data;

  const pick = (id: PanelId) => ({
    onSelect: () => setPanel(id),
    selected: panel === id,
    selectedLabel: t('showing'),
  });

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        <Link href="/projects/new" className={styles.createLink}>
          {t('addProject')}
        </Link>
      </header>

      {dashboard.isPending && (
        <div role="status" aria-label={t('loading')} className={styles.skeletons}>
          <Skeleton height={96} />
          <Skeleton height={240} />
        </div>
      )}

      {dashboard.isError && (
        <div role="alert" className={styles.panelError}>
          <p>{t('loadFailed')}</p>
          <Button variant="secondary" size="sm" onClick={() => dashboard.refetch()}>
            {t('retry')}
          </Button>
        </div>
      )}

      {data && data.kpis.project_count === 0 && (
        <EmptyState
          title={t('empty.title')}
          description={t('empty.text')}
          action={
            <Link href="/projects/new" className={styles.createLink}>
              {t('empty.action')}
            </Link>
          }
        />
      )}

      {data && data.kpis.project_count > 0 && (
        <>
          <div className={styles.kpis}>
            <KpiCard
              label={t('kpi.projects')}
              value={formatNumber(data.kpis.project_count)}
              unit={t('kpi.projectsUnit')}
              note={t('kpi.projectsNote', { versions: formatNumber(data.kpis.version_count) })}
              {...pick('projects')}
            />
            <KpiCard
              label={t('kpi.indicators')}
              value={formatNumber(data.kpis.h_vh_indicator_count)}
              unit={t('kpi.indicatorsUnit')}
              note={t('kpi.indicatorsNote')}
              {...pick('indicators')}
            />
            <KpiCard
              label={t('kpi.islands')}
              value={formatNumber(data.kpis.island_count)}
              unit={t('kpi.islandsUnit')}
              {...pick('islands')}
            />
            <KpiCard
              label={t('kpi.value')}
              value={formatNumber(data.kpis.total_value_baht)}
              unit={t('kpi.valueUnit')}
            />
          </div>

          <div className={styles.charts}>
            <LevelChart counts={data.level_distribution} />
            <ProjectRiskChart risks={data.project_risks} />
          </div>

          <section className={styles.panel} aria-labelledby="panel-title">
            <h2 id="panel-title" className={styles.chartTitle}>
              {t(`panel.${panel}`)}
            </h2>
            {panel === 'projects' && <ProjectsPanel />}
            {panel === 'indicators' && <TopIndicatorsPanel />}
            {panel === 'islands' && <IslandsPanel islandName={(code) => tIslands(code)} />}
          </section>
        </>
      )}
    </section>
  );
}
