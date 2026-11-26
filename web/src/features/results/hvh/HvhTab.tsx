'use client';

import { IconAlertCircle, IconArrowRight } from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';

import { EmptyState, Icon, LevelBadge } from '@/components/ui';
import { planPath } from '@/features/plan/rules';
import { StrategyChip } from '@/features/plan/StrategyChip';
import { formatNumber } from '@/lib/format/locale';

import type { IndicatorName, IndicatorResult, ResultsResponse } from '../overview/api';
import { formatRm, formatScore, subscript } from '../overview/format';
import overview from '../overview/results.module.css';
import styles from './hvh.module.css';
import { highRisks, HVH_VISIBLE, xInput } from './rules';

type Props = {
  projectId: string;
  versionId: string;
  results: ResultsResponse;
  names: Map<string, IndicatorName>;
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

  const pills = (row: IndicatorResult, meta?: IndicatorName) => {
    const x = xInput(meta?.unit ?? '', row.x);
    const bold = { b: (chunks: ReactNode) => <strong>{chunks}</strong> };
    const rich = (key: 'x' | 'xBare' | 'y1' | 'y2' | 'y3', values: Record<string, string>) =>
      t.rich(`inputs.${key}`, { ...subscript, ...bold, ...values });
    return [
      rich(x.unit ? 'x' : 'xBare', { ...x, score: formatScore(row.rl) }),
      rich('y1', { value: formatNumber(row.y1_pct), score: formatScore(row.ri_c) }),
      rich('y2', { value: formatNumber(row.y2_pct), score: formatScore(row.ri_t) }),
      rich('y3', { score: formatScore(row.ri_e) }),
    ];
  };

  return (
    <section className={overview.panelBody}>
      <div role="status" className={styles.banner}>
        <Icon icon={IconAlertCircle} size={20} className={styles.bannerIcon} />
        <p className={styles.bannerText}>{t('banner', { count: rows.length, vh: VH, h: H })}</p>
        <Link href={planPath(projectId, versionId)} className={styles.bannerAction}>
          {t('toPlan')}
          <Icon icon={IconArrowRight} size={18} />
        </Link>
      </div>
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
                  {row.strategy && (
                    <StrategyChip value={row.strategy} unsetLabel="" prefix={t('strategyPrefix')} />
                  )}
                </header>
                <ul className={styles.pills}>
                  {pills(row, meta).map((text, i) => (
                    <li key={i} className={styles.pill}>
                      {text}
                    </li>
                  ))}
                </ul>
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
