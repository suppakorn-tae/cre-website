import { useTranslations } from 'next-intl';

import { LEVELS, LevelBadge, type Level } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import type { DashboardSummary } from './api';
import styles from './dashboard.module.css';

/** Width of a bar as a share of the largest value; a non-zero value keeps a visible sliver. */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
}

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
      <h2 id="level-chart-title" className={styles.chartTitle}>
        {t('title')}
      </h2>
      <p className={styles.chartCaption}>{t('caption')}</p>
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
            {LEVELS.map((level) => (
              <li key={level} className={styles.donutRow}>
                <LevelBadge level={level} variant="solid" label={tLevels(level)} />
                <span className={styles.barName}>{tLevels(level)}</span>
                <span className={styles.barValue}>{formatNumber(counts[level])}</span>
                <span className={styles.donutPct}>{levelPercent(counts[level], total)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Stacked H and VH bar per project (latest submitted version). */
export function ProjectRiskChart({ risks }: { risks: DashboardSummary['project_risks'] }) {
  const t = useTranslations('dashboard.riskChart');
  const max = Math.max(0, ...risks.map((r) => r.h_count + r.vh_count));
  return (
    <section className={styles.chart} aria-labelledby="risk-chart-title">
      <h2 id="risk-chart-title" className={styles.chartTitle}>
        {t('title')}
      </h2>
      <p className={styles.chartCaption}>{t('caption')}</p>
      {risks.length === 0 ? (
        <p className={styles.chartNone}>{t('none')}</p>
      ) : (
        <>
          <p className={styles.legend}>
            <span className={styles.legendItem} data-level="H">
              {t('high')}
            </span>
            <span className={styles.legendItem} data-level="VH">
              {t('veryHigh')}
            </span>
          </p>
          <ul className={styles.bars}>
            {risks.map((r) => (
              <li key={r.project_id} className={styles.barRow}>
                <span className={styles.barLabel}>
                  <span className={styles.barName} title={r.name}>
                    {r.nickname}
                  </span>
                  <span className={styles.barSub}>{t('version', { n: r.version_no })}</span>
                </span>
                <span className={styles.track} aria-hidden="true">
                  <span
                    className={styles.stack}
                    style={{ width: `${barPercent(r.h_count + r.vh_count, max)}%` }}
                  >
                    <span className={styles.fill} data-level="H" style={{ flex: r.h_count }} />
                    <span className={styles.fill} data-level="VH" style={{ flex: r.vh_count }} />
                  </span>
                </span>
                <span className={styles.barValue}>
                  {t('high')} {formatNumber(r.h_count)} · {t('veryHigh')} {formatNumber(r.vh_count)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
