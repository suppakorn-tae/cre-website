'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CheckboxGroup, Skeleton } from '@/components/ui';

import { fetchIndicatorRm, indicatorRmKey } from './api';
import styles from './compare.module.css';
import { useNames } from './names';
import { BOX_H, PAD_X, PLOT_H, plotWidth, useBoxWidth } from './chartBox';
import { linePath, plotPoints } from './rules';

const H = PLOT_H;

/** RM of each indicator across versions, filtered by factor (FR-46). Plain SVG. */
export function IndicatorRmChart({ projectId }: { projectId: string }) {
  const t = useTranslations('compare.indicatorRm');
  const tc = useTranslations('compare');
  const [factors, setFactors] = useState<string[]>([]);
  const all = useQuery({
    queryKey: indicatorRmKey(projectId, []),
    queryFn: () => fetchIndicatorRm(projectId, []),
  });
  const shown = useQuery({
    queryKey: indicatorRmKey(projectId, factors),
    queryFn: () => fetchIndicatorRm(projectId, factors),
  });
  const names = useNames();
  const [boxRef, boxWidth] = useBoxWidth();
  const W = plotWidth(boxWidth);

  if (!all.data) return <Skeleton height="8rem" />;
  const factorCodes = [...new Set(all.data.indicators.map((i) => i.factor_code))];
  const matrix = shown.data ?? all.data;

  return (
    <section aria-labelledby="rm-title" className={styles.charts}>
      <h2 id="rm-title" className={styles.sectionTitle}>
        {t('title')}
      </h2>
      <CheckboxGroup
        legend={t('factorFilter')}
        options={factorCodes.map((c) => ({ value: c, label: names.factor(c) }))}
        value={factors}
        onChange={(v) => setFactors(v)}
      />
      <figure className={styles.figure}>
        <div ref={boxRef} className={styles.plot}>
          <svg
            width={boxWidth}
            height={BOX_H}
            viewBox={`0 0 ${boxWidth} ${BOX_H}`}
            role="img"
            aria-label={t('title')}
          >
            <g transform={`translate(${PAD_X} 8)`}>
              {matrix.indicators.map((row, n) => (
                <path
                  key={row.indicator_code}
                  d={linePath(
                    plotPoints(
                      row.points.map((p) => p.rm),
                      W,
                      H,
                      5,
                    ),
                  )}
                  className={styles.series}
                  data-series={n % 6}
                  fill="none"
                />
              ))}
              {matrix.versions.map((v, i) => (
                <text
                  key={v.version_id}
                  x={matrix.versions.length > 1 ? (i * W) / (matrix.versions.length - 1) : 0}
                  y={H + 22}
                  textAnchor="middle"
                  className={styles.axis}
                >
                  {tc('trend.versionShort', { no: v.version_no })}
                </text>
              ))}
            </g>
          </svg>
        </div>
        <ul className={styles.legend}>
          {matrix.indicators.map((row, n) => (
            <li key={row.indicator_code} data-series={n % 6}>
              {names.indicator(row.indicator_code)}
            </li>
          ))}
        </ul>
      </figure>
    </section>
  );
}
