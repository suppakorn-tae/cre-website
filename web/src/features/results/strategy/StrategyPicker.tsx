'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Toast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format/locale';

import { STRATEGIES, type Strategy } from './api';
import styles from './strategy.module.css';

type Props = {
  code: string;
  value?: Strategy;
  updatedAt?: string;
  /** False on an older version: the choice is shown but cannot change. */
  editable: boolean;
  saving?: boolean;
  onChange: (strategy: Strategy) => Promise<unknown>;
};

/** Strategy of one H / VH indicator (BR-05): one choice, saved as soon as it is picked. */
export function StrategyPicker({ code, value, updatedAt, editable, saving, onChange }: Props) {
  const t = useTranslations('advice.strategy');
  const [error, setError] = useState<string | null>(null);

  async function pick(strategy: Strategy) {
    if (!editable || strategy === value) return;
    setError(null);
    try {
      await onChange(strategy);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      setError(status === 409 ? t('notLatest') : status === 422 ? t('notHigh') : t('saveFailed'));
    }
  }

  return (
    <fieldset className={styles.picker} disabled={!editable} aria-busy={saving}>
      <legend className={styles.legend}>{t('label')}</legend>
      <div className={styles.options}>
        {STRATEGIES.map((s) => (
          <label key={s} className={styles.option} data-checked={value === s}>
            <input
              type="radio"
              name={`strategy-${code}`}
              value={s}
              checked={value === s}
              onChange={() => void pick(s)}
            />
            {t(`options.${s}`)}
          </label>
        ))}
      </div>
      <p className={styles.note}>
        {!editable
          ? t('readOnly')
          : value && updatedAt
            ? t('savedAt', { at: formatDateTime(updatedAt) })
            : t('unset')}
      </p>
      {error && (
        <Toast tone="error" title={error} closeLabel={t('close')} onClose={() => setError(null)} />
      )}
    </fieldset>
  );
}
