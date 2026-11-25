'use client';

import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Input, Select } from '@/components/ui';
import type { components } from '@/lib/api/generated/schema';

import styles from './advice.module.css';
import { filterIndicators, type FlatIndicator } from './rules';

type Catalogue = components['schemas']['Catalogue'];

type Props = {
  catalogue: Catalogue;
  indicators: FlatIndicator[];
  value: string | null;
  onChange: (code: string) => void;
};

/** Picks one indicator: narrow by dimension, factor or search text, then choose. */
export function IndicatorPicker({ catalogue, indicators, value, onChange }: Props) {
  const t = useTranslations('admin-advice.picker');
  const [dimension, setDimension] = useState('');
  const [factor, setFactor] = useState('');
  const [q, setQ] = useState('');

  const factors = useMemo(
    () =>
      catalogue.dimensions
        .filter((d) => !dimension || d.code === dimension)
        .flatMap((d) => d.factors),
    [catalogue, dimension],
  );
  const matches = filterIndicators(indicators, { dimension, factor, q });
  // Keep the open indicator selectable even when the filters would hide it.
  const current = indicators.find((i) => i.code === value);
  const shown = current && !matches.includes(current) ? [current, ...matches] : matches;

  return (
    <fieldset className={styles.picker}>
      <legend className={styles.pickerLegend}>{t('legend')}</legend>
      <Select
        label={t('dimension')}
        value={dimension}
        options={catalogue.dimensions.map((d) => ({
          value: d.code,
          label: `${d.code} · ${d.name}`,
        }))}
        placeholder={t('all')}
        onChange={(e) => {
          setDimension(e.target.value);
          setFactor('');
        }}
      />
      <Select
        label={t('factor')}
        value={factor}
        options={factors.map((f) => ({ value: f.code, label: `${f.code} · ${f.name}` }))}
        placeholder={t('all')}
        onChange={(e) => setFactor(e.target.value)}
      />
      <Input
        label={t('search')}
        type="search"
        value={q}
        placeholder={t('searchPlaceholder')}
        onChange={(e) => setQ(e.target.value)}
        helper={matches.length === 0 ? t('noMatch') : t('matches', { n: matches.length })}
      />
      <Select
        className={styles.pickerWide}
        label={t('indicator')}
        value={value ?? ''}
        options={shown.map((i) => ({ value: i.code, label: `${i.code} · ${i.name}` }))}
        placeholder={t('indicator')}
        onChange={(e) => e.target.value && onChange(e.target.value)}
      />
    </fieldset>
  );
}
