import * as Tooltip from '@radix-ui/react-tooltip';
import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';

import { TooltipContent } from '@/components/ui/TooltipContent';
import { formatNumber } from '@/lib/format/locale';

import type { IndicatorName, ResultsResponse } from './api';
import { subscript } from './format';
import styles from './results.module.css';
import {
  CHART_MAX,
  CHART_MIN,
  chartPct,
  factorSeries,
  FALLBACK_CUTOFFS,
  hLineRm,
  levelOfMean,
  reachesH,
  valuePlacement,
} from './rules';

type Props = {
  averages: ResultsResponse['factor_averages'];
  /** Stored per-indicator rows of the page; RL and RI_max means are taken from them. */
  items: ResultsResponse['items'];
  names: Map<string, IndicatorName>;
  /** `level_cutoffs` of the results response; the H line falls back to 3.5 when absent. */
  cutoffs?: ResultsResponse['level_cutoffs'];
};

const LEVELS = ['VL', 'L', 'M', 'H', 'VH'] as const;
const TICKS = [5, 4, 3, 2, 1];
const fmt = (value: number) =>
  formatNumber(value, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * RL, RI_max and RM per factor (FR-47, hi-fi 3.3a): two narrow grey bars and a wide RM bar
 * coloured by the level of its mean. RM is the stored average; RL and RI_max are browser means
 * of the stored per-indicator rows. Nothing is recalculated by the engine. The bars grow in
 * from the axis (CSS, off with reduced motion).
 */
export function FactorChart({ averages, items, names, cutoffs }: Props) {
  const hLine = hLineRm(cutoffs);
  const t = useTranslations('results.overview.factorChart');
  const tUi = useTranslations('ui');
  const factorNames = new Map<string, string>();
  for (const { factorCode, factorName } of names.values()) factorNames.set(factorCode, factorName);
  const series = factorSeries(averages, items, names);

  return (
    <section aria-labelledby="results-factor-title" className={styles.card}>
      <div className={styles.factorHead}>
        <h2 id="results-factor-title" className={`${styles.cardTitle} ${styles.factorTitle}`}>
          {t.rich('title', subscript)}
        </h2>
        <ul className={styles.factorChips} aria-hidden="true">
          <li className={styles.factorChip} data-chip="rl">
            <span className={styles.factorSwatch} data-swatch="rl" aria-hidden="true" />
            {t('chipRl')}
          </li>
          <li className={styles.factorChip} data-chip="ri">
            <span className={styles.factorSwatch} data-swatch="ri" aria-hidden="true" />
            {t.rich('chipRi', subscript)}
          </li>
          <li className={styles.factorChip} data-chip="rm">
            <span className={styles.factorSwatch} data-swatch="rm" aria-hidden="true">
              {LEVELS.map((level) => (
                <span key={level} data-level={level} />
              ))}
            </span>
            {t('chipRm')}
          </li>
        </ul>
      </div>
      <div className={styles.factorScroll}>
        <Tooltip.Provider delayDuration={100}>
          <div className={styles.factorChart}>
            <div className={styles.factorAxis} aria-hidden="true">
              {TICKS.map((tick) => (
                <span key={tick} style={{ bottom: `${chartPct(tick)}%` }}>
                  {tick}
                </span>
              ))}
            </div>
            <div className={styles.factorPlot}>
              {TICKS.map((tick) => (
                <span
                  key={tick}
                  aria-hidden="true"
                  className={styles.factorGrid}
                  style={{ bottom: `${chartPct(tick)}%` }}
                />
              ))}
              <span
                className={styles.factorLine}
                style={{ bottom: `${chartPct(hLine)}%` }}
                data-testid="h-line"
              >
                <span className={styles.factorLineLabel}>{t('threshold', { rm: hLine })}</span>
              </span>
              <ol
                className={styles.factorBars}
                aria-label={t('label', { min: CHART_MIN, max: CHART_MAX })}
              >
                {series.map((a, index) => {
                  const rm = a.averageRm;
                  const place = valuePlacement(rm, hLine);
                  const level = levelOfMean(rm, cutoffs ?? FALLBACK_CUTOFFS);
                  const name = factorNames.get(a.factorCode);
                  const hasInputs = a.averageRl !== undefined && a.averageRiMax !== undefined;
                  const values = {
                    name: name ?? a.factorCode,
                    rl: hasInputs ? fmt(a.averageRl!) : '',
                    ri: hasInputs ? fmt(a.averageRiMax!) : '',
                    rm: fmt(rm),
                    level,
                    levelName: tUi(`levels.${level}`),
                  };
                  const summary = hasInputs ? t('summary', values) : t('summaryRm', values);
                  const detail = hasInputs ? t('detail', values) : t('detailRm', values);
                  return (
                    <li
                      key={a.factorCode}
                      className={styles.factorCol}
                      data-high={reachesH(rm, hLine)}
                      data-level={level}
                      style={{ '--i': index } as CSSProperties}
                    >
                      <Tooltip.Root>
                        <Tooltip.Trigger asChild>
                          <button
                            type="button"
                            className={styles.factorHit}
                            aria-label={t(name ? 'hitLabelNamed' : 'hitLabel', {
                              rm: values.rm,
                              code: a.factorCode,
                              name: name ?? '',
                              detail,
                            })}
                          >
                            {hasInputs && (
                              <>
                                <span className={styles.factorSlot} data-series="rl">
                                  <span
                                    className={styles.factorBarFill}
                                    style={{ height: `${chartPct(a.averageRl!)}%` }}
                                  />
                                </span>
                                <span className={styles.factorSlot} data-series="ri">
                                  <span
                                    className={styles.factorBarFill}
                                    style={{ height: `${chartPct(a.averageRiMax!)}%` }}
                                  />
                                </span>
                              </>
                            )}
                            <span className={styles.factorSlot} data-series="rm">
                              <span
                                className={styles.factorValue}
                                style={{ bottom: `${place.bottomPct}%` }}
                                data-placement={place.mode}
                                aria-hidden="true"
                              >
                                {fmt(rm)}
                              </span>
                              <span
                                className={styles.factorBarFill}
                                style={{ height: `${chartPct(rm)}%` }}
                                data-high={reachesH(rm, hLine)}
                                aria-hidden="true"
                              />
                            </span>{' '}
                            <span className={styles.factorCode} aria-hidden="true">
                              {a.factorCode}
                            </span>
                          </button>
                        </Tooltip.Trigger>
                        <TooltipContent>{summary}</TooltipContent>
                      </Tooltip.Root>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </Tooltip.Provider>
      </div>
      <ul className={styles.factorNames}>
        {series.map((a) => (
          <li key={a.factorCode}>
            <strong>{a.factorCode}</strong> {factorNames.get(a.factorCode)}
          </li>
        ))}
      </ul>
      <p className={styles.muted}>{t('note')}</p>
    </section>
  );
}
