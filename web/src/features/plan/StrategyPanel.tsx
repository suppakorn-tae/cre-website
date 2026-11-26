'use client';

import { IconCheck } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Alert, Icon } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { ApiError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format/locale';

import { STRATEGIES, type Strategy } from './api';
import { STRATEGY_ICONS, StrategyChip } from './StrategyChip';

type Props = {
  code: string;
  value?: Strategy;
  updatedAt?: string;
  /** False on an older version: the choice is shown as a chip and cannot change. */
  editable: boolean;
  onChange: (strategy: Strategy) => Promise<unknown>;
};

/**
 * Strategy of one H / VH indicator (BR-05): a radio group of four cards,
 * saved as soon as one is picked. A read-only version shows the choice only.
 */
export function StrategyPanel({ code, value, updatedAt, editable, onChange }: Props) {
  const t = useTranslations('plan.strategy');
  const headingId = useId();
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
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <h4 id={headingId} className="m-0 text-small font-semibold text-text-secondary">
        {editable ? t('label') : t('chosenLabel')}
      </h4>

      {editable ? (
        <div
          role="radiogroup"
          aria-label={t('groupLabel', { code })}
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          {STRATEGIES.map((s) => (
            <label
              key={s}
              className={cx(
                'box-border flex min-w-0 cursor-pointer flex-col gap-2 rounded-card border border-border bg-surface p-3',
                'has-checked:border-primary has-checked:bg-blue-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
              )}
            >
              <span className="flex items-center justify-between gap-2 text-small font-semibold text-navy-900">
                <span className="flex items-center gap-2">
                  <Icon icon={STRATEGY_ICONS[s]} size={18} className="shrink-0 text-blue-700" />
                  {s}
                </span>
                <input
                  type="radio"
                  name={`strategy-${code}`}
                  value={s}
                  checked={value === s}
                  onChange={() => void pick(s)}
                  aria-label={`${s} ${t(`options.${s}`)}`}
                  className="m-0 size-5 shrink-0 accent-primary"
                />
              </span>
              <span className="text-small font-semibold text-text">{t(`options.${s}`)}</span>
              <span className="text-caption text-text-secondary">{t(`descriptions.${s}`)}</span>
            </label>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <StrategyChip value={value} unsetLabel={t('unset')} />
          {value && (
            <p className="m-0 text-small text-text-secondary">
              {t(`options.${value}`)} · {t(`descriptions.${value}`)}
            </p>
          )}
        </div>
      )}

      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-col gap-1 text-caption text-text-secondary">
        {editable && (
          <p role="status" className="m-0 flex items-center gap-1">
            {value && updatedAt ? (
              <>
                <Icon icon={IconCheck} size={16} className="text-success" />
                {t('savedAt', { at: formatDateTime(updatedAt) })}
              </>
            ) : (
              t('unset')
            )}
          </p>
        )}
        <p className="m-0">{t('shownIn')}</p>
      </div>
    </section>
  );
}
