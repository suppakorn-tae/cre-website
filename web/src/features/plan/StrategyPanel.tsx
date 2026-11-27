'use client';

import { IconCheck } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef } from 'react';

import { Icon, useToaster } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { ApiError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format/locale';

import { STRATEGIES, type Strategy } from './api';
import { strategyStyle } from './strategy';
import { STRATEGY_ICONS, StrategyChip } from './StrategyChip';
import { useStrategyChoice } from './useStrategyChoice';

type Props = {
  code: string;
  value?: Strategy;
  updatedAt?: string;
  /** False on an older version: the choice is shown as a chip and cannot change. */
  editable: boolean;
  onChange: (strategy: Strategy) => Promise<unknown>;
};

/**
 * Strategy of one H / VH indicator (BR-05): a radio group of four coloured
 * cards. A choice shows at once and is saved 400 ms after the last click (one
 * request for a burst of clicks); the cards are disabled while it saves and a
 * failure rolls the choice back with a toast. A read-only version shows the
 * choice only.
 */
export function StrategyPanel({ code, value, updatedAt, editable, onChange }: Props) {
  const t = useTranslations('plan.strategy');
  const headingId = useId();
  const toaster = useToaster();
  const group = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);

  const { shown, busy, choose } = useStrategyChoice(value, onChange, (e) => {
    const status = e instanceof ApiError ? e.status : 0;
    toaster.show({
      id: `strategy-error-${code}`,
      tone: 'error',
      title: status === 409 ? t('notLatest') : status === 422 ? t('notHigh') : t('saveFailed'),
      duration: 6000,
    });
  });

  // Disabling the radios while saving drops the keyboard focus; put it back on the choice.
  useEffect(() => {
    if (busy || !hadFocus.current) return;
    hadFocus.current = false;
    group.current?.querySelector<HTMLInputElement>('input:checked')?.focus();
  }, [busy]);

  return (
    <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
      <h4 id={headingId} className="m-0 text-small font-semibold text-text-secondary">
        {editable ? t('label') : t('chosenLabel')}
      </h4>

      {editable ? (
        <div
          role="radiogroup"
          aria-label={t('groupLabel', { code })}
          aria-busy={busy}
          ref={group}
          onFocus={() => (hadFocus.current = true)}
          onBlur={(e) => {
            if (!busy && !e.currentTarget.contains(e.relatedTarget)) hadFocus.current = false;
          }}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        >
          {STRATEGIES.map((s) => {
            const chosen = shown === s;
            return (
              <label
                key={s}
                style={strategyStyle(s)}
                data-chosen={chosen}
                className={cx(
                  'relative box-border flex min-w-0 flex-col gap-2 rounded-card border border-(--strategy-solid) p-3',
                  // Hover and keyboard focus grow the card; transform only, so nothing shifts.
                  'hover:z-10 hover:scale-[1.03] has-focus-visible:z-10 has-focus-visible:scale-[1.03]',
                  'transition-[color,background-color,scale] duration-(--motion-fast) ease-(--motion-ease) has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary',
                  busy ? 'cursor-wait' : 'cursor-pointer',
                  chosen
                    ? 'bg-(--strategy-solid) text-on-solid'
                    : 'bg-(--strategy-tint) text-(--strategy-solid)',
                )}
              >
                <span className="flex items-center justify-between gap-2 text-small font-semibold">
                  <span className="flex items-center gap-2">
                    <Icon icon={STRATEGY_ICONS[s]} size={18} className="shrink-0" />
                    {s}
                  </span>
                  {chosen && <Icon icon={IconCheck} size={18} className="shrink-0" />}
                  <input
                    type="radio"
                    name={`strategy-${code}`}
                    value={s}
                    checked={chosen}
                    disabled={busy}
                    onChange={() => choose(s)}
                    aria-label={`${s} ${t(`options.${s}`)}`}
                    className="sr-only"
                  />
                </span>
                <span className="text-small font-semibold">{t(`options.${s}`)}</span>
                <span
                  className={cx('text-caption', chosen ? 'text-on-solid' : 'text-text-secondary')}
                >
                  {t(`descriptions.${s}`)}
                </span>
              </label>
            );
          })}
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

      <div className="flex flex-col gap-1 text-caption text-text-secondary">
        {editable && (
          <p role="status" className="m-0 flex items-center gap-1">
            {busy || (shown && shown !== value) ? (
              t('saving')
            ) : value && updatedAt ? (
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
