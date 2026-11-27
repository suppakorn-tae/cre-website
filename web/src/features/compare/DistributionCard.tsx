'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { LEVELS } from '@/components/ui';
import { useLeaving } from '@/components/ui/chartMotion';
import { formatNumber } from '@/lib/format/locale';

import type { TrendPoint } from './api';
import styles from './compare.module.css';

const HIGH_TO_LOW = [...LEVELS].reverse();

/** One stacked bar per version, VH to VL, with the counts inside the segments. */
export function DistributionCard({ points }: { points: TrendPoint[] }) {
  const t = useTranslations('compare.distribution');
  const tl = useTranslations('compare.levels');
  const tt = useTranslations('compare.trend');
  const titleId = useId();
  // The scored count is the same in every submitted version.
  const total = Math.max(
    0,
    ...points.map((p) => (p.level_distribution ? sum(p.level_distribution) : 0)),
  );

  return (
    <section aria-labelledby={titleId} className={styles.card}>
      <div className={styles.cardHead}>
        <h2 id={titleId} className={styles.cardTitle}>
          {total > 0 ? t('title', { total: formatNumber(total) }) : t('titleNoTotal')}
        </h2>
        <ul className={styles.levelKeys}>
          {HIGH_TO_LOW.map((level) => (
            <li key={level} title={tl(level)}>
              <span className={styles.levelSwatch} data-level={level} aria-hidden="true" />
              {level}
              <span className={styles.srOnly}> {tl(level)}</span>
            </li>
          ))}
        </ul>
      </div>
      <ul className={styles.distribution}>
        {points.map((p) => {
          const counts = p.level_distribution;
          const name = tt('versionShort', { no: p.version_no });
          return (
            <li key={p.version_id} className={styles.distRow}>
              <span className={styles.distName}>{name}</span>
              {counts ? (
                <span
                  role="img"
                  className={styles.distBar}
                  aria-label={`${name}: ${HIGH_TO_LOW.map((l) => `${tl(l)} ${counts[l]}`).join(', ')}`}
                >
                  <Parts counts={counts} />
                </span>
              ) : (
                <span className={styles.distEmpty}>{t('notSent')}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function sum(counts: Record<(typeof LEVELS)[number], number>): number {
  return LEVELS.reduce((total, level) => total + counts[level], 0);
}

/** The segments of one bar; a level that drops to zero shrinks and fades out in its place. */
function Parts({ counts }: { counts: Record<(typeof LEVELS)[number], number> }) {
  const tl = useTranslations('compare.levels');
  const parts = useLeaving(
    HIGH_TO_LOW.filter((l) => counts[l] > 0).map((level) => ({ level, count: counts[level] })),
    (p) => p.level,
  );
  return parts.map(({ item, leaving }) => (
    <span
      key={item.level}
      className={styles.distPart}
      data-level={item.level}
      data-leaving={leaving ? '' : undefined}
      aria-hidden={leaving ? true : undefined}
      style={{ flexGrow: item.count }}
      title={`${tl(item.level)} ${item.count}`}
    >
      {formatNumber(item.count)}
    </span>
  ));
}
