'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { CheckboxGroup, type CheckboxOption } from '@/components/ui';

import type { Catalogue } from './api';
import styles from './assessment.module.css';
import { fieldMessageKey, type FieldKey } from './fieldErrors';
import { isAnswered, isComplete, parseAmount, type Draft } from './rules';

type Indicator = Catalogue['dimensions'][number]['factors'][number]['indicators'][number];

type Props = {
  indicator: Indicator;
  draft: Draft;
  y3Options: CheckboxOption[];
  disabled: boolean;
  /** Error codes the server answered with, per field. */
  serverErrors?: Partial<Record<FieldKey, string>>;
  onChange: (draft: Draft) => void;
};

type CellProps = {
  /** Column name, shown as a label on narrow screens only. */
  label: string;
  /** Accessible name of the input in this cell. */
  inputLabel: string;
  value: string;
  disabled: boolean;
  error?: string;
  hint?: { title: string; lines: string[] };
  placeholder?: string;
  suffix?: string;
  onChange: (value: string) => void;
};

/** One number field of the row, with its hover hint card and its error under the input. */
function NumberCell({
  label,
  inputLabel,
  value,
  disabled,
  error,
  hint,
  placeholder,
  suffix,
  onChange,
}: CellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <td className={styles.cell} data-label={label}>
      <input
        type="text"
        inputMode="decimal"
        className={styles.input}
        aria-label={inputLabel}
        aria-invalid={error ? true : undefined}
        aria-describedby={described || undefined}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {suffix && <span className={styles.suffix}>{suffix}</span>}
      {error && (
        <p id={errorId} className={styles.cellError}>
          {error}
        </p>
      )}
      {hint && (
        <div id={hintId} role="tooltip" className={styles.hint}>
          <strong>{hint.title}</strong>
          {hint.lines.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
    </td>
  );
}

/** One indicator as a table row (a card on narrow screens): X, y1, y2 and y3. */
export function IndicatorRow({
  indicator,
  draft,
  y3Options,
  disabled,
  serverErrors,
  onChange,
}: Props) {
  const t = useTranslations('assessment');
  const tUnits = useTranslations('assessment.units');
  const done = isComplete(draft);
  const state = done ? 'complete' : isAnswered(draft) ? 'partial' : 'empty';
  const code = indicator.code;

  const numberError = (text: string, max?: number): string | undefined =>
    text.trim() !== '' && parseAmount(text, max) === null
      ? t(max === undefined ? 'errors.number' : 'errors.percent')
      : undefined;
  const serverError = (key: FieldKey): string | undefined => {
    const found = serverErrors?.[key];
    return found === undefined ? undefined : t(fieldMessageKey(found));
  };
  const maxFor = (unit: string) => (unit === 'percent' ? 100 : undefined);
  const hint = (field: 'x' | 'y1' | 'y2', question: string | null, extra?: string) => {
    const lines = [question, extra].filter((l): l is string => Boolean(l));
    return lines.length === 0
      ? undefined
      : { title: t('table.hintTitle', { code, field: t(`fields.${field}`) }), lines };
  };

  return (
    <tr className={styles.row} data-state={state}>
      <th scope="row" className={styles.codeCell} data-label={t('table.code')}>
        {code}
      </th>
      <td className={styles.nameCell} data-label={t('table.indicator')}>
        <span className={styles.name}>{indicator.name}</span>
        {serverErrors?.code !== undefined && (
          <p role="alert" className={styles.cellError}>
            {t(fieldMessageKey(serverErrors.code))}
          </p>
        )}
      </td>
      <NumberCell
        label={t('fields.x')}
        inputLabel={`${t('fields.x')} ${code}`}
        value={draft.x}
        disabled={disabled}
        placeholder={indicator.unit}
        error={numberError(draft.x) ?? serverError('x')}
        hint={hint('x', indicator.question_x, t('fields.xUnit', { unit: indicator.unit }))}
        onChange={(x) => onChange({ ...draft, x })}
      />
      <NumberCell
        label={t('fields.y1')}
        inputLabel={`${t('fields.y1')} ${code}`}
        value={draft.y1.amount}
        disabled={disabled}
        suffix={tUnits(draft.y1.unit)}
        error={numberError(draft.y1.amount, maxFor(draft.y1.unit)) ?? serverError('y1')}
        hint={hint('y1', indicator.question_y1)}
        onChange={(amount) => onChange({ ...draft, y1: { ...draft.y1, amount } })}
      />
      <NumberCell
        label={t('fields.y2')}
        inputLabel={`${t('fields.y2')} ${code}`}
        value={draft.y2.amount}
        disabled={disabled}
        suffix={tUnits(draft.y2.unit)}
        error={numberError(draft.y2.amount, maxFor(draft.y2.unit)) ?? serverError('y2')}
        hint={hint('y2', indicator.question_y2)}
        onChange={(amount) => onChange({ ...draft, y2: { ...draft.y2, amount } })}
      />
      <td className={styles.cell} data-label={t('fields.y3')}>
        <details
          className={styles.picker}
          onBlur={(e) => {
            // Close when focus leaves the picker, so the panel never covers other rows.
            if (!e.currentTarget.contains(e.relatedTarget)) e.currentTarget.open = false;
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') e.currentTarget.open = false;
          }}
        >
          <summary className={styles.pickerHead}>
            <span className={styles.srOnly}>{`${t('fields.y3')} ${code}`}</span>
            {draft.y3.length === 0 ? (
              <span className={styles.pick}>{t('table.pick')}</span>
            ) : (
              <>
                {draft.y3.map((v) => (
                  <span key={v} className={styles.y3Chip}>
                    {v}
                  </span>
                ))}
                <span className={styles.srOnly}>
                  {t('table.picked', { count: draft.y3.length })}
                </span>
              </>
            )}
          </summary>
          <div className={styles.pickerPanel}>
            <CheckboxGroup
              legend={`${t('fields.y3')} ${code}`}
              options={y3Options}
              value={draft.y3}
              disabled={disabled}
              helper={indicator.question_y3 ?? t('fields.y3Helper')}
              error={serverError('y3')}
              onChange={(y3) => onChange({ ...draft, y3 })}
            />
          </div>
        </details>
        {serverError('y3') && <p className={styles.cellError}>{serverError('y3')}</p>}
      </td>
      <td className={styles.statusCell} data-label={t('table.status')}>
        <span className={styles.badge} data-state={state}>
          {t(`indicator.${state}`)}
        </span>
      </td>
    </tr>
  );
}
