'use client';

import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';

import { DonutChart, LEVELS } from '@/components/ui';
import { useLeaving } from '@/components/ui/chartMotion';
import { formatNumber } from '@/lib/format/locale';

import type { DashboardSummary } from './api';
import styles from './dashboard.module.css';
import { CountUp } from './motion';

/** Whole-percent share of a level; display only, the counts stay the source. */
export function levelPercent(count: number, total: number): number {
  return total <= 0 ? 0 : Math.round((count / total) * 100);
}

/** One decimal, e.g. "15.5%": the hi-fi legend shows shares like 2.1% and 38.0%. */
function formatShare(count: number, total: number): string {
  const share = total <= 0 ? 0 : (count / total) * 100;
  return `${formatNumber(share, undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Order of the hi-fi, in the ring (clockwise from the top) and in the legend: highest risk first. */
const LEGEND_ORDER = [...LEVELS].reverse();

/** Donut of the level distribution with a legend of counts and percentages. */
export function LevelChart({ counts }: { counts: DashboardSummary['level_distribution'] }) {
  const t = useTranslations('dashboard.levelChart');
  const tLevels = useTranslations('ui.levels');
  const total = LEVELS.reduce((sum, l) => sum + counts[l], 0);
  const label = t('donutLabel', {
    total: formatNumber(total),
    parts: LEVELS.map((l) => `${tLevels(l)} ${formatNumber(counts[l])}`).join(', '),
  });
  return (
    <section className={styles.chart} aria-labelledby="level-chart-title">
      <div>
        <h2 id="level-chart-title" className={styles.chartTitle}>
          {t('title')}
        </h2>
        <p className={styles.chartCaption}>{t('caption')}</p>
      </div>
      {total === 0 ? (
        <p className={styles.chartNone}>{t('none')}</p>
      ) : (
        <div className={styles.donutWrap}>
          <div className={styles.donut}>
            <DonutChart
              segments={LEGEND_ORDER.map((l) => ({
                key: l,
                value: counts[l],
                color: `var(--level-${l.toLowerCase()})`,
              }))}
              label={label}
              centre={total}
              caption={t('unit')}
            />
          </div>
          <ul className={styles.donutLegend}>
            {LEGEND_ORDER.map((level) => (
              <li key={level} className={styles.donutRow} data-level={level}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.barName}>
                  <span aria-hidden="true">{level}</span>
                  <span className={styles.srOnly}>{tLevels(level)}</span>
                </span>
                <span className={styles.barValue}>
                  <CountUp value={counts[level]} />
                </span>
                <span className={styles.donutPct}>{formatShare(counts[level], total)}</span>
                <span className={styles.donutBar} aria-hidden="true">
                  <span
                    className={styles.donutBarFill}
                    style={{ width: `${levelPercent(counts[level], total)}%` }}
                  />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Axis of the H/VH chart: the next multiple of 5 above the largest bar, at least 5. */
export function axisMax(largest: number): number {
  return Math.max(5, Math.ceil(largest / 5) * 5);
}

/** Stacked H and VH bar per project (latest submitted version). */
export function ProjectRiskChart({ risks }: { risks: DashboardSummary['project_risks'] }) {
  const t = useTranslations('dashboard.riskChart');
  const max = axisMax(Math.max(0, ...risks.map((r) => r.h_count + r.vh_count)));
  const ticks = Array.from({ length: max / 5 + 1 }, (_, i) => i * 5);
  // A project or tick that goes away stays for a moment and fades out where it was.
  const rows = useLeaving(risks, (r) => r.project_id);
  const tickRows = useLeaving(ticks, String);
  return (
    <section className={styles.chart} aria-labelledby="risk-chart-title">
      <div className={styles.chartHead}>
        <div>
          <h2 id="risk-chart-title" className={styles.chartTitle}>
            {t('title')}
          </h2>
          <p className={styles.chartCaption}>{t('caption')}</p>
        </div>
        {risks.length > 0 && (
          <p className={styles.legend} aria-hidden="true">
            <span className={styles.legendItem} data-level="H">
              {t('legendH')}
            </span>
            <span className={styles.legendItem} data-level="VH">
              {t('legendVH')}
            </span>
          </p>
        )}
      </div>
      {risks.length === 0 ? (
        <p className={styles.chartNone}>{t('none')}</p>
      ) : (
        <div className={styles.plot} style={{ '--axis-steps': max / 5 } as CSSProperties}>
          <span className={styles.grid} aria-hidden="true" />
          <ul className={styles.bars}>
            {rows.map(({ item: r, leaving }) => {
              const total = r.h_count + r.vh_count;
              const width = (100 * total) / max;
              return (
                <li
                  key={r.project_id}
                  className={styles.barRow}
                  data-leaving={leaving ? '' : undefined}
                  aria-hidden={leaving ? true : undefined}
                >
                  <span className={styles.barLabel}>
                    <span className={styles.nicknameChip}>{r.nickname}</span>
                    <span className={styles.barProject}>{r.name}</span>
                  </span>
                  <span className={styles.track}>
                    <span
                      className={styles.stack}
                      style={{ width: `${width}%` }}
                      aria-hidden="true"
                    >
                      <span className={styles.fill} data-level="H" style={{ flex: r.h_count }} />
                      <span className={styles.fill} data-level="VH" style={{ flex: r.vh_count }} />
                    </span>
                    <span
                      className={`${styles.total} ${styles.barValue}`}
                      style={{ left: `${width}%` }}
                    >
                      <span aria-hidden="true">
                        <CountUp value={total} />
                      </span>
                      <span className={styles.srOnly}>
                        {t('high')} {formatNumber(r.h_count)} · {t('veryHigh')}{' '}
                        {formatNumber(r.vh_count)}
                      </span>
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className={styles.axis} aria-hidden="true">
            <span className={styles.axisTicks}>
              {tickRows.map(({ item: tick, leaving }) => (
                <span
                  key={tick}
                  data-leaving={leaving ? '' : undefined}
                  style={{ left: `${Math.min(100, (100 * tick) / max)}%` }}
                >
                  {tick}
                </span>
              ))}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
