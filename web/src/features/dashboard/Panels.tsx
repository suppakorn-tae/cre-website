'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type ReactNode } from 'react';

import { Button, EmptyState, Input, Pagination, Skeleton } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import { projectPaths } from '../versions/rules';
import {
  PANEL_PAGE_SIZE,
  useIndicatorNames,
  useIslandsPanel,
  useProjectsPanel,
  useTopIndicatorsPanel,
} from './api';
import styles from './dashboard.module.css';

const SEARCH_DELAY_MS = 300;

/** Loading, error and empty states shared by the three panels. */
function PanelState({
  query,
  empty,
  children,
}: {
  query: { isPending: boolean; isError: boolean; refetch: () => unknown };
  empty: boolean;
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
  return empty ? <EmptyState title={t('panel.noData')} /> : <>{children}</>;
}

/** Panel of the projects card: search by name or nickname, paged. */
export function ProjectsPanel() {
  const t = useTranslations('dashboard.projectsPanel');
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
  const data = projects.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.page.total / PANEL_PAGE_SIZE)) : 1;

  return (
    <div>
      <Input
        type="search"
        label={t('searchLabel')}
        placeholder={t('searchPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoComplete="off"
      />
      <PanelState query={projects} empty={data?.items.length === 0}>
        <ul className={styles.list}>
          {data?.items.map((p) => (
            <li key={p.project_id} className={styles.listItem}>
              <div>
                <p className={styles.itemTitle}>
                  <span className={styles.nickname}>{p.nickname}</span> {p.name}
                </p>
                <p className={styles.itemMeta}>
                  {t('progress', { pct: p.progress_pct })} ·{' '}
                  {t('versions', { count: p.version_count })} ·{' '}
                  {p.h_vh_count === null
                    ? t('notSubmitted')
                    : t('riskCount', { count: formatNumber(p.h_vh_count) })}
                </p>
              </div>
              <span className={styles.itemActions}>
                <Link href={projectPaths.assessment(p.project_id, p.latest_version_id)}>
                  {t('assess')}
                </Link>
                {p.latest_submitted_version_id && (
                  <Link href={projectPaths.results(p.project_id, p.latest_submitted_version_id)}>
                    {t('results')}
                  </Link>
                )}
              </span>
            </li>
          ))}
        </ul>
        {data && pageCount > 1 && (
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
      </PanelState>
    </div>
  );
}

/** Panel of the H+VH indicators card: the ten indicators most often H or VH. */
export function TopIndicatorsPanel() {
  const t = useTranslations('dashboard.topPanel');
  const top = useTopIndicatorsPanel(true);
  const names = useIndicatorNames(true).data;
  return (
    <PanelState query={top} empty={top.data?.length === 0}>
      <ol className={styles.list}>
        {top.data?.map((i) => (
          <li key={i.indicator_code} className={styles.listItem}>
            <div>
              <p className={styles.itemTitle}>{names?.indicators.get(i.indicator_code) ?? ''}</p>
              <p className={styles.itemMeta}>{names?.factors.get(i.factor_code) ?? ''}</p>
            </div>
            <span className={styles.itemMeta}>
              {t('high', { count: formatNumber(i.h_count) })} ·{' '}
              {t('veryHigh', { count: formatNumber(i.vh_count) })}
            </span>
          </li>
        ))}
      </ol>
    </PanelState>
  );
}

/** Panel of the islands card: projects grouped by island. */
export function IslandsPanel({ islandName }: { islandName: (code: string) => string }) {
  const t = useTranslations('dashboard.islandsPanel');
  const islands = useIslandsPanel(true);
  return (
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
                  <span className={styles.nickname}>{p.nickname}</span> {p.name}
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
  );
}
