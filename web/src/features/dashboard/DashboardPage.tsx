'use client';

import {
  IconAlertTriangle,
  IconBuildingFactory2,
  IconCurrencyBaht,
  IconMapPin,
} from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, EmptyState, Icon, KpiCard, LEVELS, Skeleton } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import { AddProjectLink } from './AddProjectLink';
import { useDashboard, useIslandNames } from './api';
import { LevelChart, ProjectRiskChart } from './Charts';
import styles from './dashboard.module.css';
import { formatMillionBaht } from './format';
import { IslandsPanel, ProjectsPanel, TopIndicatorsPanel } from './Panels';

type PanelId = 'projects' | 'indicators' | 'islands';

/** First screen after log in: KPI cards, two charts and the panel of the selected card. */
export function DashboardPage() {
  const t = useTranslations('dashboard');
  const tIslands = useTranslations('projects.islands');
  const [panel, setPanel] = useState<PanelId>('projects');
  const dashboard = useDashboard();
  const data = dashboard.data;
  const islands = useIslandNames(Boolean(data && data.kpis.island_count > 0));
  const islandNames = islands.data?.map((g) => tIslands(g.island_code)).join(' · ');

  const pick = (id: PanelId) => ({
    onSelect: () => setPanel(id),
    selected: panel === id,
    selectedLabel: t('showing'),
  });

  const scored = data ? LEVELS.reduce((sum, l) => sum + data.level_distribution[l], 0) : 0;
  const averageValue =
    data && data.kpis.project_count > 0
      ? formatMillionBaht(data.kpis.total_value_baht / data.kpis.project_count)
      : '';

  return (
    <section className={styles.page}>
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        {data?.kpis.project_count !== 0 && (
          <AddProjectLink label={t('addProject')} compactOnPhone />
        )}
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
        <div className={styles.emptyCard}>
          <EmptyState
            icon={<Icon icon={IconBuildingFactory2} size={24} />}
            title={t('empty.title')}
            description={t('empty.text')}
            action={<AddProjectLink label={t('empty.action')} />}
          />
          <p className={styles.emptyNote}>{t('empty.note')}</p>
        </div>
      )}

      {data && data.kpis.project_count > 0 && (
        <>
          <div className={styles.kpis}>
            <KpiCard
              icon={<Icon icon={IconBuildingFactory2} size={20} />}
              label={t('kpi.projects')}
              value={formatNumber(data.kpis.project_count)}
              unit={t('kpi.projectsUnit')}
              note={t('kpi.projectsNote', { versions: formatNumber(data.kpis.version_count) })}
              {...pick('projects')}
            />
            <KpiCard
              icon={<Icon icon={IconAlertTriangle} size={20} />}
              tone="red"
              label={t('kpi.indicators')}
              value={formatNumber(data.kpis.h_vh_indicator_count)}
              unit={t('kpi.indicatorsUnit')}
              note={t('kpi.indicatorsNote', { total: formatNumber(scored) })}
              {...pick('indicators')}
            />
            <KpiCard
              icon={<Icon icon={IconMapPin} size={20} />}
              label={t('kpi.islands')}
              value={formatNumber(data.kpis.island_count)}
              unit={t('kpi.islandsUnit')}
              note={islandNames}
              {...pick('islands')}
            />
            <KpiCard
              icon={<Icon icon={IconCurrencyBaht} size={20} />}
              tone="orange"
              label={t('kpi.value')}
              value={formatMillionBaht(data.kpis.total_value_baht)}
              unit={t('kpi.valueUnit')}
              note={t('kpi.valueNote', { average: averageValue })}
            />
          </div>

          <div className={styles.charts}>
            <LevelChart counts={data.level_distribution} />
            <ProjectRiskChart risks={data.project_risks} />
          </div>

          {panel === 'projects' && <ProjectsPanel />}
          {panel === 'indicators' && <TopIndicatorsPanel />}
          {panel === 'islands' && <IslandsPanel islandName={(code) => tIslands(code)} />}
        </>
      )}
    </section>
  );
}
