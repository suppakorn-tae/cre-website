'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  Button,
  DataTable,
  EmptyState,
  KpiCard,
  LevelBadge,
  Select,
  Skeleton,
  type DataTableColumn,
} from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format/locale';

import { compareKey, fetchComparison, fetchTrend, trendKey, type VersionComparison } from './api';
import styles from './compare.module.css';
import { IndicatorRmChart } from './IndicatorRmChart';
import { useNames } from './names';
import { defaultPair, delta, submittedVersions } from './rules';
import { TrendCharts } from './TrendCharts';

type Change = VersionComparison['level_changes'][number];

/** Compares two submitted versions and shows trends over all versions (UC-21). */
export function CompareView({ projectId }: { projectId: string }) {
  const t = useTranslations('compare');
  const trend = useQuery({ queryKey: trendKey(projectId), queryFn: () => fetchTrend(projectId) });
  const [picked, setPicked] = useState<{ base: string; target: string } | null>(null);

  if (trend.isError) {
    return (
      <EmptyState
        title={t('loadFailed')}
        action={
          <Button variant="secondary" onClick={() => void trend.refetch()}>
            {t('retry')}
          </Button>
        }
      />
    );
  }
  if (!trend.data) {
    return (
      <div aria-busy="true" className={styles.stack}>
        <Skeleton width="40%" height="2rem" />
        <Skeleton height="10rem" />
      </div>
    );
  }

  const points = trend.data;
  const submitted = submittedVersions(points);
  const pair = picked ?? defaultPair(points);
  const back = (
    <Link className={styles.back} href={`/projects/${projectId}`}>
      {t('back')}
    </Link>
  );
  if (!pair) {
    return <EmptyState title={t('needTwo')} action={back} />;
  }

  const options = submitted.map((p) => ({
    value: p.version_id,
    label: t('versionOption', {
      no: p.version_no,
      date: p.submitted_at ? formatDate(p.submitted_at) : '',
    }),
  }));

  return (
    <div className={styles.stack}>
      <header className={styles.header}>
        {back}
        <h1 className={styles.title}>{t('title')}</h1>
      </header>
      <div className={styles.pickers}>
        <Select
          label={t('base')}
          options={options}
          value={pair.base}
          onChange={(e) => setPicked({ ...pair, base: e.target.value })}
        />
        <Select
          label={t('target')}
          options={options}
          value={pair.target}
          onChange={(e) => setPicked({ ...pair, target: e.target.value })}
        />
      </div>
      {pair.base === pair.target ? (
        <p role="alert" className={styles.warn}>
          {t('sameVersion')}
        </p>
      ) : (
        <Comparison projectId={projectId} base={pair.base} target={pair.target} />
      )}
      <TrendCharts points={points} />
      <IndicatorRmChart projectId={projectId} />
    </div>
  );
}

function Comparison({
  projectId,
  base,
  target,
}: {
  projectId: string;
  base: string;
  target: string;
}) {
  const t = useTranslations('compare');
  const names = useNames();
  const query = useQuery({
    queryKey: compareKey(projectId, base, target),
    queryFn: () => fetchComparison(projectId, base, target),
  });
  if (query.isError) {
    return (
      <EmptyState
        title={t('compareFailed')}
        action={
          <Button variant="secondary" onClick={() => void query.refetch()}>
            {t('retry')}
          </Button>
        }
      />
    );
  }
  if (!query.data) return <Skeleton height="8rem" />;
  const { base: b, target: g, level_changes: changes } = query.data;

  const sign = (d: number | null, digits = 0) =>
    d === null
      ? t('none')
      : formatNumber(d, undefined, { signDisplay: 'exceptZero', maximumFractionDigits: digits });
  const num = (v: number | null) =>
    v === null ? t('none') : formatNumber(v, undefined, { maximumFractionDigits: 2 });

  const columns: DataTableColumn<Change>[] = [
    {
      key: 'indicator',
      header: t('columns.indicator'),
      primary: true,
      render: (c) => <strong>{names.indicator(c.indicator_code)}</strong>,
    },
    { key: 'factor', header: t('columns.factor'), render: (c) => names.factor(c.factor_code) },
    {
      key: 'change',
      header: t('columns.change'),
      render: (c) => (
        <span className={styles.change}>
          <LevelBadge level={c.base_level} label={t(`levels.${c.base_level}`)} />
          <span aria-hidden="true">→</span>
          <LevelBadge level={c.target_level} label={t(`levels.${c.target_level}`)} />
          <span className={c.direction === 'up' ? styles.up : styles.down}>
            {t(`direction.${c.direction}`)}
          </span>
        </span>
      ),
    },
    {
      key: 'rm',
      header: t('columns.rm'),
      align: 'end',
      render: (c) => `${num(c.base_rm)} → ${num(c.target_rm)}`,
    },
  ];

  return (
    <>
      <div className={styles.kpis}>
        <KpiCard
          label={t('metrics.progress')}
          value={`${b.progress_at_submit} → ${g.progress_at_submit}`}
          unit="%"
          note={sign(g.progress_at_submit - b.progress_at_submit)}
        />
        <KpiCard
          label={t('metrics.avgRm')}
          value={`${num(b.avg_rm)} → ${num(g.avg_rm)}`}
          note={sign(delta(b.avg_rm, g.avg_rm), 2)}
        />
        <KpiCard
          label={t('metrics.hvh')}
          value={`${b.h_vh_count} → ${g.h_vh_count}`}
          unit={t('metrics.unit')}
          note={sign(g.h_vh_count - b.h_vh_count)}
        />
        <KpiCard
          label={t('metrics.levelChanges')}
          value={`${query.data.level_up_count} / ${query.data.level_down_count}`}
          note={t('metrics.upDown')}
        />
      </div>
      <section aria-labelledby="changes-title" className={styles.stack}>
        <h2 id="changes-title" className={styles.sectionTitle}>
          {t('changes.title')}
        </h2>
        <DataTable
          caption={t('changes.caption')}
          columns={columns}
          rows={changes}
          rowKey={(c) => c.indicator_code}
          empty={<EmptyState title={t('changes.empty')} />}
        />
      </section>
    </>
  );
}
