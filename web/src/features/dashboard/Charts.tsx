import { useTranslations } from 'next-intl';
import type { CSSProperties } from 'react';

import { LEVELS, type Level } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import type { DashboardSummary } from './api';
import styles from './dashboard.module.css';

/** Whole-percent share of a level; display only, the counts stay the source. */
export function levelPercent(count: number, total: number): number {
  return total <= 0 ? 0 : Math.round((count / total) * 100);
}

export type DonutSegment = { level: Level; length: number; offset: number };

/** Arcs on a ring of circumference 100: one per non-empty level, in level order. */
export function donutSegments(counts: DashboardSummary['level_distribution']): DonutSegment[] {
  const total = LEVELS.reduce((sum, l) => sum + counts[l], 0);
  if (total === 0) return [];
  let offset = 0;
  const segments: DonutSegment[] = [];
  for (const level of LEVELS) {
    if (counts[level] === 0) continue;
    const length = (counts[level] / total) * 100;
    segments.push({ level, length, offset });
    offset += length;
  }
  return segments;
}

const RING_RADIUS = 15.9155; // circumference 100

/** One decimal, e.g. "15.5%": the hi-fi legend shows shares like 2.1% and 38.0%. */
function formatShare(count: number, total: number): string {
  const share = total <= 0 ? 0 : (count / total) * 100;
  return `${formatNumber(share, undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Legend order of the hi-fi: highest risk first. */
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
            <svg viewBox="0 0 40 40" role="img" aria-label={label} className={styles.donutSvg}>
              <circle cx="20" cy="20" r={RING_RADIUS} fill="none" className={styles.donutTrack} />
              {donutSegments(counts).map((seg) => (
                <circle
                  key={seg.level}
                  cx="20"
                  cy="20"
                  r={RING_RADIUS}
                  fill="none"
                  stroke={`var(--level-${seg.level.toLowerCase()})`}
                  strokeWidth="6"
                  strokeDasharray={`${seg.length} ${100 - seg.length}`}
                  strokeDashoffset={25 - seg.offset}
                />
              ))}
            </svg>
            <span className={styles.donutCentre} aria-hidden="true">
              <span className={styles.donutTotal}>{formatNumber(total)}</span>
              <span className={styles.donutUnit}>{t('unit')}</span>
            </span>
          </div>
          <ul className={styles.donutLegend}>
            {LEGEND_ORDER.map((level) => (
              <li key={level} className={styles.donutRow} data-level={level}>
                <span className={styles.dot} aria-hidden="true" />
                <span className={styles.barName}>{tLevels(level)}</span>
                <span className={styles.barValue}>{formatNumber(counts[level])}</span>
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
          <p className={styles.legend}>
            <span className={styles.legendItem} data-level="H">
              {t('high')}
            </span>
            <span className={styles.legendItem} data-level="VH">
              {t('veryHigh')}
            </span>
          </p>
        )}
      </div>
      {risks.length === 0 ? (
        <p className={styles.chartNone}>{t('none')}</p>
      ) : (
        <>
          <ul className={styles.bars} style={{ '--axis-steps': max / 5 } as CSSProperties}>
            {risks.map((r) => (
              <li key={r.project_id} className={styles.barRow}>
                <span className={styles.barLabel}>
                  <span className={styles.nicknameChip}>{r.nickname}</span>
                  <span className={styles.barProject}>{r.name}</span>
                </span>
                <span className={styles.track} aria-hidden="true">
                  <span
                    className={styles.stack}
                    style={{ width: `${(100 * (r.h_count + r.vh_count)) / max}%` }}
                  >
                    <span className={styles.fill} data-level="H" style={{ flex: r.h_count }} />
                    <span className={styles.fill} data-level="VH" style={{ flex: r.vh_count }} />
                  </span>
                </span>
                <span className={styles.barValue}>
                  <span aria-hidden="true">{formatNumber(r.h_count + r.vh_count)}</span>
                  <span className={styles.srOnly}>
                    {t('high')} {formatNumber(r.h_count)} · {t('veryHigh')}{' '}
                    {formatNumber(r.vh_count)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.axis} aria-hidden="true">
            <span className={styles.axisTicks}>
              {ticks.map((tick) => (
                <span key={tick} style={{ left: `${(100 * tick) / max}%` }}>
                  {tick}
                </span>
              ))}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
