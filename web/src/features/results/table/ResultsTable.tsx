'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { EmptyState, Input, LEVELS, LevelBadge, MultiSelect } from '@/components/ui';

import type { IndicatorName, IndicatorResult, Level } from '../overview/api';
import { formatRm, formatScore, subscript } from '../overview/format';
import styles from '../overview/results.module.css';
import { filterRows } from './filter';

const DIMENSIONS = ['ec', 'so', 'ev'] as const;

/** Dimension of an indicator, read from the code prefix (EC, SO or EV). */
export function dimensionOf(code: string): (typeof DIMENSIONS)[number] | undefined {
  const prefix = code.slice(0, 2).toLowerCase();
  return DIMENSIONS.find((d) => d === prefix);
}

type Props = { items: IndicatorResult[]; names: Map<string, IndicatorName> };

/** Detail table (FR-25): every score per indicator, with search and a level filter. Read only. */
export function ResultsTable({ items, names }: Props) {
  const t = useTranslations('results.table');
  const tUi = useTranslations('ui');
  const [text, setText] = useState('');
  const [levels, setLevels] = useState<Level[]>([...LEVELS]);
  const rows = filterRows(items, names, text, levels);

  const scores = [
    ['rl', 'rl'],
    ['riC', 'ri_c'],
    ['riT', 'ri_t'],
    ['riE', 'ri_e'],
    ['riMax', 'ri_max'],
  ] as const;

  return (
    <section aria-labelledby="results-table-title" className={styles.panelBody}>
      <h2 id="results-table-title" className={styles.sectionTitle}>
        {t('title')}
      </h2>
      <div className={styles.filters}>
        <Input
          type="search"
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          autoComplete="off"
        />
        <MultiSelect
          label={t('levelLabel')}
          value={levels}
          onChange={(next) => setLevels(next as Level[])}
          allLabel={t('allLevels')}
          countLabel={(count) => t('levelCount', { count })}
          placeholder={t('allLevels')}
          options={LEVELS.map((l) => ({ value: l, label: `${l} · ${tUi(`levels.${l}`)}` }))}
        />
      </div>
      <p role="status" className={styles.muted}>
        {t('count', { shown: rows.length, total: items.length })}
      </p>

      {rows.length === 0 ? (
        <EmptyState title={t('emptyTitle')} description={t('emptyText')} />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <caption className={styles.srOnly}>{t('caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('columns.code')}</th>
                <th scope="col">{t('columns.indicator')}</th>
                {scores.map(([key]) => (
                  <th key={key} scope="col" className={styles.num}>
                    {t.rich(`columns.${key}`, subscript)}
                  </th>
                ))}
                <th scope="col" className={styles.num}>
                  {t('columns.rm')}
                </th>
                <th scope="col">{t('columns.level')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.indicator_code}
                  data-dim={dimensionOf(row.indicator_code)}
                  className={styles.dimRow}
                >
                  <td data-primary="true" className={styles.code}>
                    {row.indicator_code}
                  </td>
                  <td data-label={t('columns.indicator')}>
                    {names.get(row.indicator_code)?.name ?? row.indicator_code}
                  </td>
                  {scores.map(([key, field]) => (
                    <td key={key} className={styles.num} data-label={t(`labels.${key}`)}>
                      {formatScore(row[field])}
                    </td>
                  ))}
                  <td className={styles.num} data-label={t('columns.rm')}>
                    {formatRm(row.rm)}
                  </td>
                  <td data-label={t('columns.level')}>
                    <LevelBadge level={row.level} label={tUi(`levels.${row.level}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className={styles.muted}>{t.rich('legend', subscript)}</p>
    </section>
  );
}
