'use client';

import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Alert, Button, KpiCard, Skeleton } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import { compareKey, fetchComparison, type TrendPoint } from './api';
import styles from './compare.module.css';
import { deltaTone, type Better } from './rules';
import { TrendCharts } from './TrendCharts';

type Props = {
  projectId: string;
  points: TrendPoint[];
  /** Version being compared against; null when no other version has been submitted. */
  baseId: string | null;
  targetId: string;
  progress: Record<string, number>;
};

/** Summary of changes (hi-fi 2.4): four deltas, the trend and the level distribution. */
export function SummaryView({ projectId, points, baseId, targetId, progress }: Props) {
  const t = useTranslations('compare');
  return (
    <div className={styles.stack}>
      {baseId ? (
        <Kpis projectId={projectId} baseId={baseId} targetId={targetId} />
      ) : (
        <Alert tone="info">{t('needOther')}</Alert>
      )}
      <TrendCharts points={points} progress={progress} />
    </div>
  );
}

function Kpis({
  projectId,
  baseId,
  targetId,
}: {
  projectId: string;
  baseId: string;
  targetId: string;
}) {
  const t = useTranslations('compare');
  const query = useQuery({
    queryKey: compareKey(projectId, baseId, targetId),
    queryFn: () => fetchComparison(projectId, baseId, targetId),
  });
  if (query.isError) {
    return (
      <Alert
        tone="error"
        action={
          <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
            {t('retry')}
          </Button>
        }
      >
        {t('compareFailed')}
      </Alert>
    );
  }
  if (!query.data) {
    return (
      <div aria-busy="true" className={styles.kpis}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height="7rem" />
        ))}
      </div>
    );
  }
  const { base, target, level_up_count: up, level_down_count: down } = query.data;
  const from = (value?: string) =>
    value === undefined
      ? t('metrics.fromBase', { no: base.version_no })
      : t('metrics.fromBaseValue', { no: base.version_no, value });
  const rm = (v: number | null) =>
    v === null
      ? t('none')
      : formatNumber(v, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className={styles.kpis}>
      <KpiCard
        label={t('metrics.progress')}
        value={t('metrics.percent', { value: formatNumber(target.progress_at_submit) })}
        note={
          <Delta
            change={target.progress_at_submit - base.progress_at_submit}
            better="higher"
            format={(n) => t('metrics.percent', { value: formatNumber(n) })}
            suffix={from(t('metrics.percent', { value: formatNumber(base.progress_at_submit) }))}
            sameText={t('metrics.same', { no: base.version_no })}
          />
        }
      />
      <KpiCard
        label={t('metrics.avgRm')}
        value={rm(target.avg_rm)}
        note={
          target.avg_rm !== null && base.avg_rm !== null ? (
            <Delta
              change={Math.round((target.avg_rm - base.avg_rm) * 100) / 100}
              better="lower"
              format={rm}
              suffix={from()}
              sameText={t('metrics.same', { no: base.version_no })}
            />
          ) : (
            t('none')
          )
        }
      />
      <KpiCard
        label={t('metrics.hvh')}
        value={formatNumber(target.h_vh_count)}
        note={
          <Delta
            change={target.h_vh_count - base.h_vh_count}
            better="lower"
            format={(n) => formatNumber(n)}
            suffix={from(formatNumber(base.h_vh_count))}
            sameText={t('metrics.same', { no: base.version_no })}
          />
        }
      />
      <KpiCard
        label={t('metrics.levelChanges')}
        value={formatNumber(up + down)}
        note={
          <span className={styles.deltaRow}>
            <Marked tone={down > 0 ? 'good' : 'same'} arrow="▼" word={t('metrics.down')}>
              {t('metrics.levelsDown', { count: formatNumber(down) })}
            </Marked>
            <span aria-hidden="true">·</span>
            <Marked tone={up > 0 ? 'bad' : 'same'} arrow="▲" word={t('metrics.up')}>
              {t('metrics.levelsUp', { count: formatNumber(up) })}
            </Marked>
          </span>
        }
      />
    </div>
  );
}

/** A change in green or red, always with an arrow and a word, never colour alone. */
function Delta({
  change,
  better,
  format,
  suffix,
  sameText,
}: {
  change: number;
  better: Better;
  format: (n: number) => string;
  suffix: string;
  sameText: string;
}) {
  const t = useTranslations('compare.metrics');
  if (change === 0) return <span className={styles.same}>{sameText}</span>;
  return (
    <Marked
      tone={deltaTone(change, better)}
      arrow={change > 0 ? '▲' : '▼'}
      word={change > 0 ? t('up') : t('down')}
      suffix={suffix}
    >
      {format(Math.abs(change))}
    </Marked>
  );
}

function Marked({
  tone,
  arrow,
  word,
  suffix,
  children,
}: {
  tone: 'good' | 'bad' | 'same';
  arrow: string;
  word: string;
  suffix?: string;
  children: ReactNode;
}) {
  return (
    <span className={styles.deltaRow}>
      <span className={styles[tone]}>
        <span aria-hidden="true">{arrow}</span> <VisuallyHidden.Root>{word} </VisuallyHidden.Root>
        {children}
      </span>
      {suffix && <span>{suffix}</span>}
    </span>
  );
}
