'use client';

import {
  IconBuildingFactory2,
  IconChevronRight,
  IconMapPin,
  IconSearch,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';

import { Button, EmptyState, Icon, Pagination, Skeleton, LevelBadge } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import { AddProjectLink } from './AddProjectLink';
import {
  PANEL_PAGE_SIZE,
  useDashboard,
  useIndicatorNames,
  useAllProjects,
  useIslandsPanel,
  useProjectsPanel,
  useTopIndicatorsPanel,
  type DashboardProjectItem,
} from './api';
import styles from './dashboard.module.css';
import { formatMillionBaht } from './format';
import { ProjectsTable, type ProjectRiskSplit } from './ProjectsTable';

const SEARCH_DELAY_MS = 300;

/** White card with a title row; `actions` sit at the end of the row. */
export function PanelCard({
  title,
  caption,
  actions,
  children,
}: {
  title: string;
  caption?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.panelHead}>
        <div>
          <h2 id={titleId} className={styles.chartTitle}>
            {title}
          </h2>
          {caption && <p className={styles.chartCaption}>{caption}</p>}
        </div>
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
  const t = useTranslations('dashboard.topPanel');
  const tPanel = useTranslations('dashboard.panel');
  const tLevels = useTranslations('ui.levels');
  const top = useTopIndicatorsPanel(true);
  const names = useIndicatorNames(true).data;
  // Projects with a submitted version: the "of N" of "found in".
  const projectTotal = useDashboard().data?.project_risks.length ?? 0;
  return (
    <PanelCard title={tPanel('indicators')} caption={tPanel('indicatorsCaption')}>
      <PanelState query={top} empty={top.data?.length === 0}>
        <table className={styles.topTable}>
          <thead>
            <tr>
              <th scope="col">{t('rank')}</th>
              <th scope="col">{t('indicator')}</th>
              <th scope="col">{t('foundIn')}</th>
              <th scope="col">{t('levels')}</th>
              <th scope="col">{t('projects')}</th>
            </tr>
          </thead>
          <tbody>
            {top.data?.map((i) => {
              const found = i.found_in;
              const of = Math.max(projectTotal, found);
              return (
                <tr key={i.indicator_code}>
                  <td className={styles.rank}>{i.rank}</td>
                  <td className={styles.topName}>
                    <b>{i.indicator_code}</b> {names?.indicators.get(i.indicator_code) ?? ''}
                  </td>
                  <td>
                    <span className={styles.foundIn}>
                      <span className={styles.foundText}>
                        {t('foundOf', { found: formatNumber(found), total: formatNumber(of) })}
                      </span>
                      <span className={styles.foundTrack} aria-hidden="true">
                        <span
                          className={styles.foundFill}
                          style={{ width: `${(100 * found) / of}%` }}
                        />
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className={styles.chips}>
                      {i.vh_count > 0 && (
                        <LevelBadge level="VH" count={i.vh_count} label={tLevels('VH')} />
                      )}
                      {i.h_count > 0 && (
                        <LevelBadge level="H" count={i.h_count} label={tLevels('H')} />
                      )}
                    </span>
                  </td>
                  <td>
                    <span className={styles.topProjects}>
                      {i.projects.map((p) => (
                        <span key={p.id} className={styles.nicknameChip}>
                          {p.nickname}
                        </span>
                      ))}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PanelState>
    </PanelCard>
  );
}

/** Panel of the islands card: one card per island, one row per project. */
export function IslandsPanel({ islandName }: { islandName: (code: string) => string }) {
  const t = useTranslations('dashboard.islandsPanel');
  const tStatus = useTranslations('dashboard.projectsPanel.status');
  const tLevels = useTranslations('ui.levels');
  const tPanel = useTranslations('dashboard.panel');
  const islands = useIslandsPanel(true);
  // Value and version are not in the island rows: join them from the project list by id.
  const items = useAllProjects(true).data;
  const summary = useDashboard().data;
  const byId = new Map(items?.map((p) => [p.project_id, p]));
  const risks = new Map(summary?.project_risks.map((r) => [r.project_id, r]));
  return (
    <PanelCard title={tPanel('islands')}>
      <PanelState query={islands} empty={islands.data?.length === 0}>
        <div className={styles.islands}>
          {islands.data?.map((g) => {
            const value = g.projects.reduce(
              (sum, p) => sum + (byId.get(p.project_id)?.value_baht ?? 0),
              0,
            );
            return (
              <section key={g.island_code} className={styles.island}>
                <header className={styles.islandHead}>
                  <span className={styles.islandIcon}>
                    <Icon icon={IconMapPin} size={20} />
                  </span>
                  <div>
                    <h3 className={styles.islandName}>{islandName(g.island_code)}</h3>
                    <p className={styles.itemMeta}>
                      {t('summary', {
                        count: g.projects.length,
                        value: formatMillionBaht(value),
                      })}
                    </p>
                  </div>
                </header>
                <ul className={styles.islandList}>
                  {g.projects.map((p) => {
                    const risk = risks.get(p.project_id);
                    const item = byId.get(p.project_id);
                    const versionNo = risk?.version_no ?? item?.latest_version_no;
                    const status = risk ? 'submitted' : (item?.latest_version_status ?? 'draft');
                    return (
                      <li key={p.project_id} className={styles.islandProject}>
                        <span className={styles.nicknameChip}>{p.nickname}</span>
                        <div className={styles.islandInfo}>
                          <p className={styles.itemTitle}>{p.name}</p>
                          <span className={styles.chips}>
                            {versionNo !== undefined && (
                              <b className={styles.versionNo}>
                                {t('versionNo', { no: versionNo })}
                              </b>
                            )}
                            <span className={styles.statusChip} data-status={status}>
                              {tStatus(status)}
                            </span>
                            {risk && risk.h_count > 0 && (
                              <LevelBadge level="H" count={risk.h_count} label={tLevels('H')} />
                            )}
                            {risk && risk.vh_count > 0 && (
                              <LevelBadge level="VH" count={risk.vh_count} label={tLevels('VH')} />
                            )}
                          </span>
                        </div>
                        <Link
                          href={`/projects/${p.project_id}`}
                          className={styles.actionOutline}
                          aria-label={t('openLabel', { nickname: p.nickname })}
                        >
                          {t('open')}
                          <Icon icon={IconChevronRight} size={16} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </PanelState>
    </PanelCard>
  );
}
