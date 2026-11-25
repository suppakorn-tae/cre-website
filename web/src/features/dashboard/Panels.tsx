'use client';

import { IconBuildingFactory2, IconSearch } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';

import { Button, EmptyState, Icon, Pagination, Skeleton, LevelBadge } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import { AddProjectLink } from './AddProjectLink';
import {
  PANEL_PAGE_SIZE,
  useDashboard,
  useIndicatorNames,
  useIslandsPanel,
  useProjectsPanel,
  useTopIndicatorsPanel,
  type DashboardProjectItem,
} from './api';
import styles from './dashboard.module.css';
import { ProjectsTable, type ProjectRiskSplit } from './ProjectsTable';

const SEARCH_DELAY_MS = 300;

/** White card with a title row; `actions` sit at the end of the row. */
export function PanelCard({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.panelHead}>
        <h2 id={titleId} className={styles.chartTitle}>
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Loading, error and empty states shared by the three panels. */
function PanelState({
  query,
  empty,
  emptyState,
  children,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  empty: boolean;
  emptyState?: ReactNode;
  children: ReactNode;
}) {
  const t = useTranslations('dashboard');
  if (query.isPending) {
    return (
      <div role="status" aria-label={t('loading')} className={styles.skeletons}>
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div role="alert" className={styles.panelError}>
        <p>{t('panel.loadFailed')}</p>
        <Button variant="secondary" size="sm" onClick={() => query.refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  if (empty) return <>{emptyState ?? <EmptyState title={t('panel.noData')} />}</>;
  return <>{children}</>;
}

/**
 * The project card of the dashboard and of `/projects`: title with the count,
 * search, the table (cards on phones), the count line and paging.
 */
export function ProjectsPanel({
  extraActions,
}: {
  /** Extra actions at the end of each row, e.g. edit and delete on `/projects`. */
  extraActions?: (project: DashboardProjectItem) => ReactNode;
}) {
  const t = useTranslations('dashboard.projectsPanel');
  const tPanel = useTranslations('dashboard.panel');
  const tEmpty = useTranslations('dashboard.empty');
  const tUi = useTranslations('ui');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

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

  const projects = useProjectsPanel(q, page, true);
  const summary = useDashboard().data;
  const risks = useMemo<ProjectRiskSplit>(
    () =>
      new Map(summary?.project_risks.map((r) => [r.project_id, { h: r.h_count, vh: r.vh_count }])),
    [summary],
  );
  const data = projects.data;
  const total = data?.page.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PANEL_PAGE_SIZE));

  // Deleting the last row of the last page leaves this page past the end: step back.
  const pastEnd = data !== undefined && page > pageCount;
  if (pastEnd) setPage(pageCount);

  return (
    <PanelCard
      title={tPanel('projects', { count: formatNumber(total) })}
      actions={
        <label className={styles.search}>
          <span className={styles.srOnly}>{t('searchLabel')}</span>
          <Icon icon={IconSearch} size={18} />
          <input
            type="search"
            value={text}
            placeholder={t('searchPlaceholder')}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
          />
        </label>
      }
    >
      <PanelState
        query={projects}
        empty={data?.items.length === 0 && !pastEnd}
        emptyState={
          q ? (
            <EmptyState
              icon={<Icon icon={IconSearch} size={24} />}
              title={t('noResults.title')}
              description={t('noResults.text')}
            />
          ) : (
            <EmptyState
              icon={<Icon icon={IconBuildingFactory2} size={24} />}
              title={tEmpty('title')}
              description={tEmpty('text')}
              action={<AddProjectLink label={tEmpty('action')} />}
            />
          )
        }
      >
        {data && (
          <div className={projects.isPlaceholderData ? styles.stale : undefined}>
            <div className={styles.flush}>
              <ProjectsTable items={data.items} risks={risks} extraActions={extraActions} />
            </div>
            <div className={styles.panelFoot}>
              <p className={styles.itemMeta}>
                {t('summary', {
                  shown: formatNumber(data.items.length),
                  total: formatNumber(total),
                })}
              </p>
              {pageCount > 1 && (
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
              )}
            </div>
          </div>
        )}
      </PanelState>
    </PanelCard>
  );
}

/** Panel of the H+VH indicators card: the ten indicators most often H or VH. */
export function TopIndicatorsPanel() {
  const tPanel = useTranslations('dashboard.panel');
  const tLevels = useTranslations('ui.levels');
  const top = useTopIndicatorsPanel(true);
  const names = useIndicatorNames(true).data;
  return (
    <PanelCard title={tPanel('indicators')}>
      <PanelState query={top} empty={top.data?.length === 0}>
        <ol className={styles.list}>
          {top.data?.map((i) => (
            <li key={i.indicator_code} className={styles.rankItem}>
              <span className={styles.rank}>{i.rank}</span>
              <div className={styles.rankName}>
                <p className={styles.itemTitle}>{names?.indicators.get(i.indicator_code) ?? ''}</p>
                <p className={styles.itemMeta}>{names?.factors.get(i.factor_code) ?? ''}</p>
              </div>
              <span className={styles.chips}>
                {i.vh_count > 0 && (
                  <LevelBadge level="VH" count={i.vh_count} label={tLevels('VH')} />
                )}
                {i.h_count > 0 && <LevelBadge level="H" count={i.h_count} label={tLevels('H')} />}
              </span>
            </li>
          ))}
        </ol>
      </PanelState>
    </PanelCard>
  );
}

/** Panel of the islands card: projects grouped by island. */
export function IslandsPanel({ islandName }: { islandName: (code: string) => string }) {
  const t = useTranslations('dashboard.islandsPanel');
  const tPanel = useTranslations('dashboard.panel');
  const islands = useIslandsPanel(true);
  return (
    <PanelCard title={tPanel('islands')}>
      <PanelState query={islands} empty={islands.data?.length === 0}>
        {islands.data?.map((g) => (
          <section key={g.island_code} className={styles.group}>
            <h3 className={styles.groupTitle}>
              {islandName(g.island_code)} · {t('projectCount', { count: g.projects.length })}
            </h3>
            <ul className={styles.list}>
              {g.projects.map((p) => (
                <li key={p.project_id} className={styles.listItem}>
                  <p className={styles.itemTitle}>
                    <span className={styles.nicknameChip}>{p.nickname}</span> {p.name}
                  </p>
                  <span className={styles.itemMeta}>
                    {p.h_vh_count === null ? t('notSubmitted') : formatNumber(p.h_vh_count)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </PanelState>
    </PanelCard>
  );
}
