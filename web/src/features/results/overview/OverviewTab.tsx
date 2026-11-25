'use client';

import { useTranslations } from 'next-intl';

import { DataTable, LevelBadge, type DataTableColumn } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import type { IndicatorName, IndicatorResult, ResultsResponse } from './api';
import { formatRm } from './format';
import styles from './results.module.css';
import { distribution, topRisks, TOP_COUNT } from './rules';

type Props = {
  results: ResultsResponse;
  names: Map<string, IndicatorName>;
};

/** Overview (FR-47): distribution of levels and the Top 10 by RM, as stored. */
export function OverviewTab({ results, names }: Props) {
  const t = useTranslations('results.overview');
  const tUi = useTranslations('ui');
  const top = topRisks(results.items);
  const parts = distribution(results.summary);

  const columns: DataTableColumn<IndicatorResult>[] = [
    {
      key: 'rank',
      header: t('columns.rank'),
      render: (row) => top.indexOf(row) + 1,
    },
    { key: 'code', header: t('columns.code'), primary: true, render: (r) => r.indicator_code },
    {
      key: 'indicator',
      header: t('columns.indicator'),
      render: (r) => names.get(r.indicator_code)?.name ?? r.indicator_code,
    },
    {
      key: 'factor',
      header: t('columns.factor'),
      render: (r) => names.get(r.indicator_code)?.factorName ?? '',
    },
    { key: 'rm', header: t('columns.rm'), align: 'end', render: (r) => formatRm(r.rm) },
    {
      key: 'level',
      header: t('columns.level'),
      render: (r) => <LevelBadge level={r.level} label={tUi(`levels.${r.level}`)} />,
    },
  ];

  return (
    <div className={styles.panelBody}>
      <section aria-labelledby="results-dist-title">
        <h2 id="results-dist-title" className={styles.sectionTitle}>
          {t('distributionTitle')}
          <span className={styles.muted}>
            {' '}
            {t('total', { count: formatNumber(results.summary.scored_count) })}
          </span>
        </h2>
        <div role="img" aria-label={t('distributionLabel')} className={styles.bar}>
          {parts
            .filter((p) => p.count > 0)
            .map((p) => (
              <span
                key={p.level}
                className={styles.barPart}
                data-level={p.level}
                style={{ flexGrow: p.count }}
              />
            ))}
        </div>
        <ul className={styles.legend}>
          {parts.map((p) => (
            <li key={p.level}>
              <LevelBadge level={p.level} variant="solid" label={tUi(`levels.${p.level}`)} />{' '}
              {t('legendItem', {
                count: formatNumber(p.count),
                pct: formatNumber(p.pct, undefined, { maximumFractionDigits: 1 }),
              })}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="results-top-title">
        <h2 id="results-top-title" className={styles.sectionTitle}>
          {t('topTitle', { count: TOP_COUNT })}
        </h2>
        <DataTable
          caption={t('topCaption')}
          columns={columns}
          rows={top}
          rowKey={(r) => r.indicator_code}
        />
      </section>
    </div>
  );
}
