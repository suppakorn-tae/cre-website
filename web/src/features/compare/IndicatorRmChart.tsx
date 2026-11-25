'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CheckboxGroup, Skeleton } from '@/components/ui';

import { fetchIndicatorRm, indicatorRmKey } from './api';
import styles from './compare.module.css';
import { linePath, plotPoints } from './rules';

const W = 320;
const H = 120;

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
  const label = (kind: 'indicators' | 'factors', code: string) =>
    tc.has(`${kind}.${code}`) ? tc(`${kind}.${code}`) : code;

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
        options={factorCodes.map((c) => ({ value: c, label: label('factors', c) }))}
        value={factors}
        onChange={(v) => setFactors(v)}
      />
      <figure className={styles.figure}>
        <svg viewBox={`-8 -8 ${W + 16} ${H + 32}`} role="img" aria-label={t('title')}>
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
              y={H + 18}
              textAnchor="middle"
              className={styles.axis}
            >
              {tc('trend.versionShort', { no: v.version_no })}
            </text>
          ))}
        </svg>
        <ul className={styles.legend}>
          {matrix.indicators.map((row, n) => (
            <li key={row.indicator_code} data-series={n % 6}>
              {label('indicators', row.indicator_code)}
            </li>
          ))}
        </ul>
      </figure>
    </section>
  );
}
