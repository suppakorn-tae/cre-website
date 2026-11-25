'use client';

import { useTranslations } from 'next-intl';

import { LEVELS } from '@/components/ui';

import styles from './compare.module.css';
import type { TrendPoint } from './api';
import { BOX_H, PAD_X, PLOT_H, plotWidth, useBoxWidth } from './chartBox';
import { linePath, plotPoints } from './rules';

const H = PLOT_H;
const MAX_RM = 5;

/** Plain SVG: average RM line and stacked level distribution per version. */
export function TrendCharts({ points }: { points: TrendPoint[] }) {
  const t = useTranslations('compare.trend');
  const [boxRef, boxWidth] = useBoxWidth();
  const W = plotWidth(boxWidth);
  const tl = useTranslations('compare.levels');
  const path = linePath(
    plotPoints(
      points.map((p) => p.avg_rm),
      W,
      H,
      MAX_RM,
    ),
  );
  const dots = plotPoints(
    points.map((p) => p.avg_rm),
    W,
    H,
    MAX_RM,
  );
  const slot = W / Math.max(points.length, 1);

  return (
    <section aria-labelledby="trend-title" className={styles.charts}>
      <h2 id="trend-title" className={styles.sectionTitle}>
        {t('title')}
      </h2>
      <figure className={styles.figure}>
        <figcaption>{t('avgRm')}</figcaption>
        <div ref={boxRef} className={styles.plot}>
          <svg
            width={boxWidth}
            height={BOX_H}
            viewBox={`0 0 ${boxWidth} ${BOX_H}`}
            role="img"
            aria-label={t('avgRm')}
          >
            <g transform={`translate(${PAD_X} 8)`}>
              <path d={path} className={styles.line} fill="none" />
              {dots.map((p, i) =>
                p ? (
                  <circle
                    key={points[i].version_id}
                    cx={p.x}
                    cy={p.y}
                    r="3.5"
                    className={styles.dot}
                  />
                ) : null,
              )}
              {points.map((p, i) => (
                <text
                  key={p.version_id}
                  x={dots[i]?.x ?? (points.length > 1 ? (i * W) / (points.length - 1) : 0)}
                  y={H + 22}
                  textAnchor="middle"
                  className={styles.axis}
                >
                  {t('versionShort', { no: p.version_no })}
                </text>
              ))}
            </g>
          </svg>
        </div>
      </figure>
      <figure className={styles.figure}>
        <figcaption>{t('distribution')}</figcaption>
        <div className={styles.plot}>
          <svg
            width={boxWidth}
            height={BOX_H}
            viewBox={`0 0 ${boxWidth} ${BOX_H}`}
            role="img"
            aria-label={t('distribution')}
          >
            <g transform={`translate(${PAD_X} 8)`}>
              {points.map((p, i) => {
                const d = p.level_distribution;
                if (!d) return null;
                const total = LEVELS.reduce((s, l) => s + d[l], 0) || 1;
                let y = H;
                return (
                  <g key={p.version_id}>
                    {LEVELS.map((l) => {
                      const h = (d[l] / total) * H;
                      y -= h;
                      return (
                        <rect
                          key={l}
                          x={i * slot + slot * 0.2}
                          y={y}
                          width={slot * 0.6}
                          height={h}
                          className={styles[`lv${l}`]}
                        >
                          <title>{`${tl(l)} ${d[l]}`}</title>
                        </rect>
                      );
                    })}
                    <text
                      x={i * slot + slot / 2}
                      y={H + 22}
                      textAnchor="middle"
                      className={styles.axis}
                    >
                      {t('versionShort', { no: p.version_no })}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <ul className={styles.legend}>
          {LEVELS.map((l) => (
            <li key={l} className={styles[`key${l}`]}>
              {tl(l)}
            </li>
          ))}
        </ul>
      </figure>
    </section>
  );
}
