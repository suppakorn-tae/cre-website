'use client';

import { IconArrowRight } from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Alert, EmptyState, Icon, LevelBadge } from '@/components/ui';
import { planPath } from '@/features/plan/rules';
import { StrategyChip } from '@/features/plan/StrategyChip';
import { formatNumber } from '@/lib/format/locale';

import type { IndicatorName, IndicatorResult, ResultsResponse } from '../overview/api';
import { formatRm, formatScore, subscript } from '../overview/format';
import overview from '../overview/results.module.css';
import styles from './hvh.module.css';
import { highRisks, HVH_VISIBLE } from './rules';

type Props = {
  projectId: string;
  versionId: string;
  results: ResultsResponse;
  names: Map<string, IndicatorName>;
};

type Pill = {
  key: 'x' | 'y1' | 'y2' | 'y3';
  /** What was entered; the api sends no y3 answer, so that pill shows the score only. */
  input?: string;
  score: number;
};

/**
 * H / VH summary (UC-10): the high-risk indicators as compact cards. Advice
 * lists and the strategy choice live on the plan page (step 4).
 */
export function HvhTab({ projectId, versionId, results, names }: Props) {
  const t = useTranslations('results.hvh');
  const tTable = useTranslations('results.table');
  const tUi = useTranslations('ui');
  const [showAll, setShowAll] = useState(false);
  const rows = highRisks(results.items);
  const { VH, H } = results.summary.level_counts;

  if (rows.length === 0) {
    return <EmptyState title={t('emptyTitle')} description={t('emptyText')} />;
  }
  const visible = showAll ? rows : rows.slice(0, HVH_VISIBLE);
  const hidden = rows.length - HVH_VISIBLE;

  const pills = (row: IndicatorResult, meta?: IndicatorName): Pill[] => [
    {
      key: 'x',
      input: t('inputValues.x', { value: formatNumber(row.x), unit: meta?.unit ?? '' }).trim(),
      score: row.rl,
    },
    { key: 'y1', input: t('inputValues.y1', { value: formatNumber(row.y1_pct) }), score: row.ri_c },
    { key: 'y2', input: t('inputValues.y2', { value: formatNumber(row.y2_pct) }), score: row.ri_t },
    { key: 'y3', score: row.ri_e },
  ];

  return (
    <section className={overview.panelBody}>
      <Alert
        tone="error"
        role="status"
        action={
          <Link
            href={planPath(projectId, versionId)}
            className="focus-ring inline-flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-small font-semibold text-white no-underline hover:bg-primary-hover"
          >
            {t('toPlan')}
            <Icon icon={IconArrowRight} size={18} />
          </Link>
        }
      >
        {t('banner', { count: rows.length, vh: VH, h: H })}
      </Alert>
      <ol aria-label={t('listLabel')} className={styles.cards}>
        {visible.map((row) => {
          const meta = names.get(row.indicator_code);
          return (
            <li key={row.indicator_code} className={styles.card} data-level={row.level}>
              <div className={styles.main}>
                <header className={styles.head}>
                  <LevelBadge level={row.level} label={tUi(`levels.${row.level}`)} />
                  <div className={styles.name}>
                    <h3 className={styles.heading}>
                      {row.indicator_code} {meta?.name ?? ''}
                    </h3>
                    {meta && (
                      <p className={overview.muted}>
                        {meta.factorCode} {meta.factorName}
                      </p>
                    )}
                  </div>
                  <StrategyChip
                    value={row.strategy}
                    unsetLabel={t('strategyUnset')}
                    prefix={t('strategyPrefix')}
                  />
                </header>
                <dl className={styles.pills}>
                  {pills(row, meta).map((pill) => (
                    <div key={pill.key} className={styles.pill}>
                      <dt>{t.rich(`inputs.${pill.key}`, subscript)}</dt>
                      <dd>
                        {pill.input && <span>{pill.input} → </span>}
                        <strong>{formatScore(pill.score)}</strong>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              <p className={styles.rm} data-level={row.level}>
                <span>{t('rm')}</span>
                <strong>{formatRm(row.rm)}</strong>
              </p>
            </li>
          );
        })}
      </ol>
      {hidden > 0 && (
        <button
          type="button"
          className={styles.more}
          aria-expanded={showAll}
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? t('less', { count: HVH_VISIBLE }) : t('more', { count: hidden })}
        </button>
      )}
      <p className={overview.muted}>{tTable.rich('legend', subscript)}</p>
    </section>
  );
}
