'use client';

import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Alert, Button, Skeleton } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import { fetchIndicatorRm, indicatorRmKey } from './api';
import styles from './compare.module.css';
import { IndicatorRmChart, type RmSeries } from './IndicatorRmChart';
import { useNames } from './names';
import { FactorFilter, IndicatorFilter } from './RmFilters';
import { deltaTone, firstIndicators } from './rules';

type Props = {
  projectId: string;
  /** Version compared against (left value of each legend line); null when there is none. */
  baseId: string | null;
  targetId: string;
  progress: Record<string, number>;
};

const DEFAULT_FACTORS = 2;

/** RM per indicator (hi-fi 2.5 and 2.5b): filters, the RM chart and a legend card per factor. */
export function RmView({ projectId, baseId, targetId, progress }: Props) {
  const t = useTranslations('compare');
  const names = useNames();
  const matrix = useQuery({
    queryKey: indicatorRmKey(projectId, []),
    queryFn: () => fetchIndicatorRm(projectId, []),
  });
  // null means "not changed yet": the first factors and their first indicators.
  const [factorPick, setFactorPick] = useState<string[] | null>(null);
  const [indicatorPick, setIndicatorPick] = useState<string[] | null>(null);

  if (matrix.isError) {
    return (
      <Alert
        tone="error"
        action={
          <Button variant="ghost" size="sm" onClick={() => void matrix.refetch()}>
            {t('retry')}
          </Button>
        }
      >
        {t('loadFailed')}
      </Alert>
    );
  }
  if (!matrix.data) {
    return (
      <div aria-busy="true" className={styles.stack}>
        <Skeleton height="3rem" />
        <Skeleton height="18rem" />
      </div>
    );
  }

  const { versions, indicators } = matrix.data;
  const factorCodes = [...new Set(indicators.map((i) => i.factor_code))];
  const factors = factorCodes.map((code) => ({ code, name: names.factor(code) }));
  const chosenFactors = (factorPick ?? factorCodes.slice(0, DEFAULT_FACTORS)).filter((c) =>
    factorCodes.includes(c),
  );
  const candidates = indicators.filter((i) => chosenFactors.includes(i.factor_code));
  const wanted = indicatorPick ?? firstIndicators(indicators, chosenFactors);
  const rows = candidates.filter((i) => wanted.includes(i.indicator_code));

  const column = (versionId: string | null) =>
    versions.findIndex((v) => v.version_id === versionId);
  const baseAt = column(baseId);
  const targetAt = column(targetId);
  const series: (RmSeries & { factor: string })[] = rows.map((row, index) => ({
    code: row.indicator_code,
    name: names.indicator(row.indicator_code),
    factor: row.factor_code,
    index,
    dashed: chosenFactors.indexOf(row.factor_code) % 2 === 1,
    values: row.points.map((p) => p.rm),
  }));

  function pickFactors(next: string[]) {
    // Keep the picked indicators of the factors that stay, and start a new factor with its first ones.
    const kept = rows.filter((r) => next.includes(r.factor_code)).map((r) => r.indicator_code);
    const added = next.filter((c) => !chosenFactors.includes(c));
    setFactorPick(next);
    setIndicatorPick([...kept, ...firstIndicators(indicators, added)]);
  }

  return (
    <div className={styles.stack}>
      <div className={styles.filters}>
        <FactorFilter factors={factors} chosen={chosenFactors} onChange={pickFactors} />
        <IndicatorFilter
          options={candidates.map((i) => ({
            code: i.indicator_code,
            name: names.indicator(i.indicator_code),
            factor: i.factor_code,
          }))}
          factors={factors.filter((f) => chosenFactors.includes(f.code))}
          chosen={rows.map((r) => r.indicator_code)}
          onApply={setIndicatorPick}
        />
      </div>

      <section aria-labelledby="rm-title" className={styles.card}>
        <h2 id="rm-title" className={styles.cardTitle}>
          {t('rm.title')}
        </h2>
        <p className={styles.hint}>{t('rm.axes')}</p>
        {series.length === 0 ? (
          <p className={styles.noMatch}>{t('rm.nothingChosen')}</p>
        ) : (
          <IndicatorRmChart
            versions={versions.map((v) => ({
              id: v.version_id,
              no: v.version_no,
              submitted: v.submitted,
              progress: progress[v.version_id],
            }))}
            series={series}
          />
        )}
      </section>

      <div className={styles.factorCards}>
        {chosenFactors.map((factor, factorIndex) => {
          const own = series.filter((s) => s.factor === factor);
          if (own.length === 0) return null;
          return (
            <FactorLegend
              key={factor}
              title={names.factor(factor)}
              dashed={factorIndex % 2 === 1}
              series={own}
              baseAt={baseAt}
              targetAt={targetAt}
              baseNo={versions[baseAt]?.version_no}
              targetNo={versions[targetAt]?.version_no}
            />
          );
        })}
      </div>
    </div>
  );
}

function FactorLegend({
  title,
  dashed,
  series,
  baseAt,
  targetAt,
  baseNo,
  targetNo,
}: {
  title: string;
  dashed: boolean;
  series: RmSeries[];
  baseAt: number;
  targetAt: number;
  baseNo?: number;
  targetNo?: number;
}) {
  const t = useTranslations('compare.rm');
  const id = useId();
  const num = (v: number) =>
    formatNumber(v, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <section aria-labelledby={id} className={styles.factorCard}>
      <h3 id={id} className={styles.factorTitle}>
        {title} <span className={styles.factorLine}>({dashed ? t('dashed') : t('solid')})</span>
      </h3>
      <ul className={styles.factorList}>
        {series.map((s) => {
          const base = baseAt >= 0 ? s.values[baseAt] : null;
          const target = targetAt >= 0 ? s.values[targetAt] : null;
          const change =
            base !== null && target !== null ? Math.round((target - base) * 100) / 100 : null;
          return (
            <li
              key={s.code}
              className={styles.factorItem}
              data-series={s.index % 6}
              data-shape={s.index % 4}
            >
              <span className={styles.itemName}>{s.name}</span>
              <span className={styles.itemValues}>
                {baseNo !== undefined && (
                  <>
                    {t('at', { no: baseNo, value: base === null ? t('noValue') : num(base) })}
                    <span aria-hidden="true"> → </span>
                  </>
                )}
                {targetNo !== undefined &&
                  t('at', { no: targetNo, value: target === null ? t('noValue') : num(target) })}
                {change !== null && change !== 0 && (
                  <span className={styles[deltaTone(change, 'lower')]}>
                    {' '}
                    <span aria-hidden="true">{change > 0 ? '▲' : '▼'}</span>
                    <VisuallyHidden.Root>{change > 0 ? t('up') : t('down')} </VisuallyHidden.Root>
                    {num(Math.abs(change))}
                  </span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
