'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { EmptyState, Input, LEVELS, LevelBadge, Select } from '@/components/ui';

import type { IndicatorName, IndicatorResult } from '../overview/api';
import { formatRm, formatScore, subscript } from '../overview/format';
import styles from '../overview/results.module.css';
import { filterRows, type LevelFilter } from './filter';

type Props = { items: IndicatorResult[]; names: Map<string, IndicatorName> };

/** Detail table (FR-25): every score per indicator, with search and a level filter. Read only. */
export function ResultsTable({ items, names }: Props) {
  const t = useTranslations('results.table');
  const tUi = useTranslations('ui');
  const [text, setText] = useState('');
  const [level, setLevel] = useState<LevelFilter>('all');
  const rows = filterRows(items, names, text, level);

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
        <Select
          label={t('levelLabel')}
          value={level}
          onChange={(e) => setLevel(e.target.value as LevelFilter)}
          options={[
            { value: 'all', label: t('allLevels') },
            ...LEVELS.map((l) => ({ value: l, label: `${l} · ${tUi(`levels.${l}`)}` })),
          ]}
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
                <tr key={row.indicator_code}>
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
