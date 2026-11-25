import { useTranslations } from 'next-intl';

import { formatNumber } from '@/lib/format/locale';

import type { IndicatorName, ResultsResponse } from './api';
import styles from './results.module.css';
import { CHART_MAX, CHART_MIN, chartPct, hLineRm, reachesH, valuePlacement } from './rules';

type Props = {
  averages: ResultsResponse['factor_averages'];
  names: Map<string, IndicatorName>;
  /** `level_cutoffs` of the results response; the H line falls back to 3.5 when absent. */
  cutoffs?: ResultsResponse['level_cutoffs'];
};

const TICKS = [5, 4, 3, 2, 1];
const fmt = (value: number) =>
  formatNumber(value, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Average RM per factor (FR-47), drawn from the stored averages without recalculating. */
export function FactorChart({ averages, names, cutoffs }: Props) {
  const hLine = hLineRm(cutoffs);
  const t = useTranslations('results.overview.factorChart');
  const factorNames = new Map<string, string>();
  for (const { factorCode, factorName } of names.values()) factorNames.set(factorCode, factorName);

  return (
    <section aria-labelledby="results-factor-title">
      <h2 id="results-factor-title" className={styles.sectionTitle}>
        {t('title')}
      </h2>
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
              return (
                <li
                  key={a.factor_code}
                  className={styles.factorCol}
                  title={factorNames.get(a.factor_code)}
                  data-high={reachesH(a.average_rm, hLine)}
                >
                  <span
                    className={styles.factorValue}
                    style={{ bottom: `${place.bottomPct}%` }}
                    data-placement={place.mode}
                  >
                    {fmt(a.average_rm)}
                  </span>
                  <span
                    className={styles.factorBar}
                    style={{ height: `${chartPct(a.average_rm)}%` }}
                    data-high={reachesH(a.average_rm, hLine)}
                  />
                  <span className={styles.factorCode}>{a.factor_code}</span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <p className={styles.muted}>{t('note')}</p>
    </section>
  );
}
