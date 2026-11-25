import * as Tooltip from '@radix-ui/react-tooltip';
import { useTranslations } from 'next-intl';

import { formatNumber } from '@/lib/format/locale';

import type { IndicatorName, ResultsResponse } from './api';
import styles from './results.module.css';
import {
  CHART_MAX,
  CHART_MIN,
  chartPct,
  FALLBACK_CUTOFFS,
  hLineRm,
  levelOfMean,
  reachesH,
  valuePlacement,
} from './rules';

type Props = {
  averages: ResultsResponse['factor_averages'];
  names: Map<string, IndicatorName>;
  /** `level_cutoffs` of the results response; the H line falls back to 3.5 when absent. */
  cutoffs?: ResultsResponse['level_cutoffs'];
};

const TICKS = [5, 4, 3, 2, 1];
const fmt = (value: number) =>
  formatNumber(value, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Average RM per factor (FR-47), drawn from the stored averages without recalculating.
 * Bars take the colour of the level their mean falls in, like every other chart; the
 * level code is always in text too (the tooltip and the hidden summary).
 */
export function FactorChart({ averages, names, cutoffs }: Props) {
  const hLine = hLineRm(cutoffs);
  const t = useTranslations('results.overview.factorChart');
  const tUi = useTranslations('ui');
  const factorNames = new Map<string, string>();
  for (const { factorCode, factorName } of names.values()) factorNames.set(factorCode, factorName);

  return (
    <section aria-labelledby="results-factor-title" className={styles.card}>
      <h2 id="results-factor-title" className={styles.cardTitle}>
        {t('title')}
      </h2>
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
              {averages.map((a) => {
                const place = valuePlacement(a.average_rm, hLine);
                const level = levelOfMean(a.average_rm, cutoffs ?? FALLBACK_CUTOFFS);
                const name = factorNames.get(a.factor_code);
                const summary = t('summary', {
                  name: name ?? a.factor_code,
                  rm: fmt(a.average_rm),
                  level,
                  levelName: tUi(`levels.${level}`),
                });
                return (
                  <li
                    key={a.factor_code}
                    className={styles.factorCol}
                    data-high={reachesH(a.average_rm, hLine)}
                    data-level={level}
                  >
                    <Tooltip.Root>
                      <Tooltip.Trigger asChild>
                        <button type="button" className={styles.factorHit} aria-label={summary}>
                          <span
                            className={styles.factorValue}
                            style={{ bottom: `${place.bottomPct}%` }}
                            data-placement={place.mode}
                            aria-hidden="true"
                          >
                            {fmt(a.average_rm)}
                          </span>
                          <span
                            className={styles.factorBar}
                            style={{ height: `${chartPct(a.average_rm)}%` }}
                            data-high={reachesH(a.average_rm, hLine)}
                            aria-hidden="true"
                          />
                          <span className={styles.factorCode} aria-hidden="true">
                            {a.factor_code}
                          </span>
                        </button>
                      </Tooltip.Trigger>
                      <Tooltip.Portal>
                        <Tooltip.Content sideOffset={6} className={styles.tip}>
                          {summary}
                        </Tooltip.Content>
                      </Tooltip.Portal>
                    </Tooltip.Root>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </Tooltip.Provider>
      <p className={styles.muted}>{t('note')}</p>
    </section>
  );
}
