'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { DataTable, DonutChart, LevelBadge, type DataTableColumn } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import type { IndicatorName, IndicatorResult, ResultsResponse } from './api';
import { FactorChart } from './FactorChart';
import { formatRm } from './format';
import styles from './results.module.css';
import { distribution, topRisks, TOP_COLLAPSED, TOP_COUNT } from './rules';

type Props = {
  results: ResultsResponse;
  names: Map<string, IndicatorName>;
};

const TOP_ID = 'results-top-table';

/** Overview (FR-47): distribution of levels, mean RM per factor and the Top 10 by RM, as stored. */
export function OverviewTab({ results, names }: Props) {
  const t = useTranslations('results.overview');
  const tUi = useTranslations('ui');
  const [expanded, setExpanded] = useState(false);
  const top = topRisks(results.items);
  const shown = expanded ? top : top.slice(0, TOP_COLLAPSED);
  const parts = distribution(results.summary);
  const total = results.summary.scored_count;
  const pct = (value: number) =>
    formatNumber(value, undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const columns: DataTableColumn<IndicatorResult>[] = [
    {
      key: 'rank',
      header: t('columns.rank'),
      nowrap: true,
      render: (row) => top.indexOf(row) + 1,
    },
    {
      key: 'code',
      header: t('columns.code'),
      primary: true,
      nowrap: true,
      render: (r) => r.indicator_code,
    },
    {
      key: 'indicator',
      header: t('columns.indicator'),
      render: (r) => names.get(r.indicator_code)?.name ?? r.indicator_code,
    },
    {
      key: 'factor',
      header: t('columns.factor'),
      nowrap: true,
      render: (r) => {
        const info = names.get(r.indicator_code);
        if (!info) return '';
        return (
          <>
            <span aria-hidden="true">{info.factorCode}</span>
            <span className="sr-only">{info.factorName}</span>
          </>
        );
      },
    },
    {
      key: 'rm',
      header: t('columns.rm'),
      align: 'end',
      nowrap: true,
      render: (r) => formatRm(r.rm),
    },
    {
      key: 'level',
      header: t('columns.level'),
      nowrap: true,
      render: (r) => <LevelBadge level={r.level} label={tUi(`levels.${r.level}`)} />,
    },
  ];

  const summary = t('distributionSummary', {
    total: formatNumber(total),
    parts: parts
      .map((p) => `${p.level} ${tUi(`levels.${p.level}`)} ${formatNumber(p.count)}`)
      .join(', '),
  });

  return (
    <div className={styles.panelBody}>
      <div className={styles.charts}>
        <section aria-labelledby="results-dist-title" className={styles.card}>
          <h2 id="results-dist-title" className={styles.cardTitle}>
            {t('distributionTitle')}
          </h2>
          <div className={styles.distBody}>
            <DonutChart
              segments={parts.map((p) => ({
                key: p.level,
                value: p.count,
                color: `var(--level-${p.level.toLowerCase()})`,
              }))}
              label={summary}
              describedBy="results-dist-legend"
              centre={formatNumber(total)}
              caption={t('unit')}
              details={Object.fromEntries(
                parts.map((p) => [
                  p.level,
                  {
                    title: t('tooltip.title', { level: p.level, name: tUi(`levels.${p.level}`) }),
                    detail: t('tooltip.detail', {
                      count: formatNumber(p.count),
                      pct: pct(p.pct),
                    }),
                  },
                ]),
              )}
            />
            <ul id="results-dist-legend" className={styles.legend}>
              {parts.map((p) => (
                <li key={p.level} className={styles.legendItem} data-level={p.level}>
                  <span className={styles.legendHead}>
                    <span className={styles.legendDot} aria-hidden="true" />
                    {p.level}
                    <span className="sr-only">{tUi(`levels.${p.level}`)}</span>
                  </span>
                  <span className={styles.legendValue}>
                    {t('legendItem', { count: formatNumber(p.count), pct: pct(p.pct) })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <FactorChart
          averages={results.factor_averages}
          items={results.items}
          names={names}
          cutoffs={results.level_cutoffs}
        />
      </div>

      <section aria-labelledby="results-top-title" className={`${styles.card} ${styles.topCard}`}>
        <h2 id="results-top-title" className={styles.cardTitle}>
          {t('topTitle', { count: TOP_COUNT })}
        </h2>
        <div id={TOP_ID}>
          <DataTable
            bare
            caption={t('topCaption')}
            columns={columns}
            rows={shown}
            rowKey={(r) => r.indicator_code}
          />
        </div>
        {top.length > TOP_COLLAPSED && (
          <div className={styles.topMore}>
            <button
              type="button"
              className={styles.topMoreButton}
              aria-expanded={expanded}
              aria-controls={TOP_ID}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? t('showLess', { count: TOP_COLLAPSED })
                : t('showAll', { count: TOP_COUNT })}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
