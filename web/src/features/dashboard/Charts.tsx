import { useTranslations } from 'next-intl';

import { LEVELS, LevelBadge } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import type { DashboardSummary } from './api';
import styles from './dashboard.module.css';

/** Width of a bar as a share of the largest value; a non-zero value keeps a visible sliver. */
export function barPercent(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 0;
  return Math.max(2, Math.round((value / max) * 100));
}

/** Horizontal bars, one per level, each in its level colour. */
export function LevelChart({ counts }: { counts: DashboardSummary['level_distribution'] }) {
  const t = useTranslations('dashboard.levelChart');
  const tLevels = useTranslations('ui.levels');
  const max = Math.max(...LEVELS.map((l) => counts[l]));
  return (
    <section className={styles.chart} aria-labelledby="level-chart-title">
      <h2 id="level-chart-title" className={styles.chartTitle}>
        {t('title')}
      </h2>
      <p className={styles.chartCaption}>{t('caption')}</p>
      {max === 0 ? (
        <p className={styles.chartNone}>{t('none')}</p>
      ) : (
        <ul className={styles.bars}>
          {LEVELS.map((level) => (
            <li key={level} className={styles.barRow}>
              <span className={styles.barLabel}>
                <LevelBadge level={level} variant="solid" label={tLevels(level)} />
                <span className={styles.barName}>{tLevels(level)}</span>
              </span>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.fill}
                  data-level={level}
                  style={{ width: `${barPercent(counts[level], max)}%` }}
                />
              </span>
              <span className={styles.barValue}>{formatNumber(counts[level])}</span>
            </li>
          ))}
        </ul>
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
