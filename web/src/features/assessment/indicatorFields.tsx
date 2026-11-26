'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef } from 'react';

import type { CheckboxOption } from '@/components/ui';

import type { Catalogue } from './api';
import styles from './assessment.module.css';
import { fieldMessageKey, type FieldKey } from './fieldErrors';
import { FocusHint, type Hint } from './FocusHint';
import { isAnswered, isComplete, parseAmount, y3Conflict, type Draft } from './rules';
import { Y3Picker } from './Y3Picker';

export type Indicator = Catalogue['dimensions'][number]['factors'][number]['indicators'][number];

type FieldProps = {
  /** Accessible name of the input. */
  inputLabel: string;
  value: string;
  disabled: boolean;
  error?: string;
  /** Question shown above the field while it has focus. */
  hint?: Hint;
  /** Unit written under the input (X: it changes from indicator to indicator). */
  unit?: string;
  /** Unit written inside the input, after the number (y1, y2). */
  suffix?: string;
  /** Set in a card: a visible label above the field and the question inline, not a bubble. */
  label?: string;
  onChange: (value: string) => void;
};

/** One number field: its focus hint, unit and the error under the input. */
export function NumberField({
  inputLabel,
  value,
  disabled,
  error,
  hint,
  unit,
  suffix,
  label,
  onChange,
}: FieldProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  const stacked = label !== undefined;
  return (
    <div className={stacked ? styles.stackField : undefined}>
      {stacked && (
        <label htmlFor={inputId} className={styles.fieldLabel}>
          {label}
        </label>
      )}
      <FocusHint hint={hint} id={hintId} inline={stacked}>
        <div className={styles.inputWrap}>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            className={styles.input}
            data-suffix={suffix ? '' : undefined}
            aria-label={inputLabel}
            aria-invalid={error ? true : undefined}
            aria-describedby={described || undefined}
            value={value}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
          {suffix && <span className={styles.suffix}>{suffix}</span>}
        </div>
      </FocusHint>
      {unit && <span className={styles.unitText}>{unit}</span>}
      {error && (
        <p id={errorId} className={styles.cellError}>
          {error}
        </p>
      )}
    </div>
  );
}

type Y3FieldProps = {
  indicator: Indicator;
  options: CheckboxOption[];
  value: string[];
  disabled: boolean;
  hint?: Hint;
  error?: string;
  /** Set in a card: a visible label above and the question inline, not a bubble. */
  label?: string;
  onChange: (value: string[]) => void;
};

/** The y3 field: a focus hint around the picker, and the error under it. */
export function Y3Field({
  indicator,
  options,
  value,
  disabled,
  hint,
  error,
  label,
  onChange,
}: Y3FieldProps) {
  const ids = useId();
  const errorId = `${ids}-y3-error`;
  const hintId = `${ids}-y3-hint`;
  // A closing y3 panel hands focus back to its button; the hint should not pop up then.
  const quietRef = useRef(false);
  const stacked = label !== undefined;
  return (
    <div className={stacked ? styles.stackField : undefined}>
      {stacked && (
        <span className={styles.fieldLabel} aria-hidden="true">
          {label}
        </span>
      )}
      <FocusHint hint={hint} id={hintId} quietRef={quietRef} inline={stacked}>
        <Y3Picker
          code={indicator.code}
          question={indicator.question_y3}
          options={options}
          value={value}
          disabled={disabled}
          describedBy={[hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ')}
          quietRef={quietRef}
          onChange={onChange}
        />
      </FocusHint>
      {error && (
        <p id={errorId} className={styles.cellError}>
          {error}
        </p>
      )}
    </div>
  );
}

type Params = {
  indicator: Indicator;
  draft: Draft;
  /** Error codes the server answered with, per field. */
  serverErrors?: Partial<Record<FieldKey, string>>;
  onChange: (draft: Draft) => void;
};

/**
 * Everything a row or a card shows for one indicator: its state, and per field the hint,
 * error and change handler. The table row and the phone card share it, so the rules live once.
 */
export function useIndicatorFields({ indicator, draft, serverErrors, onChange }: Params) {
  const t = useTranslations('assessment');
  const tUnits = useTranslations('assessment.units');
  const code = indicator.code;
  const state = isComplete(draft) ? 'complete' : isAnswered(draft) ? 'partial' : 'empty';

  const numberError = (text: string, max?: number): string | undefined =>
    text.trim() !== '' && parseAmount(text, max) === null
      ? t(max === undefined ? 'errors.number' : 'errors.percent')
      : undefined;
  const serverError = (key: FieldKey): string | undefined => {
    const found = serverErrors?.[key];
    return found === undefined ? undefined : t(fieldMessageKey(found));
  };
  const maxFor = (unit: string) => (unit === 'percent' ? 100 : undefined);
  const hint = (
    field: 'x' | 'y1' | 'y2' | 'y3',
    question: string | null,
    extra?: string,
  ): Hint | undefined => {
    const lines = [question, extra].filter((l): l is string => Boolean(l));
    return lines.length === 0
      ? undefined
      : { title: t('table.hintTitle', { code, field: t(`fields.${field}`) }), lines };
  };

  return {
    code,
    state,
    codeError: serverErrors?.code === undefined ? undefined : t(fieldMessageKey(serverErrors.code)),
    x: {
      label: t('fields.x'),
      inputLabel: `${t('fields.x')} ${code}`,
      value: draft.x,
      unit: indicator.unit,
      error: numberError(draft.x) ?? serverError('x'),
      hint: hint('x', indicator.question_x, t('fields.xUnit', { unit: indicator.unit })),
      onChange: (x: string) => onChange({ ...draft, x }),
    },
    y1: {
      label: t('fields.y1'),
      inputLabel: `${t('fields.y1')} ${code}`,
      value: draft.y1.amount,
      suffix: tUnits(draft.y1.unit),
      error: numberError(draft.y1.amount, maxFor(draft.y1.unit)) ?? serverError('y1'),
      hint: hint('y1', indicator.question_y1),
      onChange: (amount: string) => onChange({ ...draft, y1: { ...draft.y1, amount } }),
    },
    y2: {
      label: t('fields.y2'),
      inputLabel: `${t('fields.y2')} ${code}`,
      value: draft.y2.amount,
      suffix: tUnits(draft.y2.unit),
      error: numberError(draft.y2.amount, maxFor(draft.y2.unit)) ?? serverError('y2'),
      hint: hint('y2', indicator.question_y2),
      onChange: (amount: string) => onChange({ ...draft, y2: { ...draft.y2, amount } }),
    },
    y3: {
      label: t('fields.y3'),
      value: draft.y3,
      hint: hint('y3', indicator.question_y3),
      error: y3Conflict(draft.y3) ? t('y3.exclusiveError') : serverError('y3'),
      onChange: (y3: string[]) => onChange({ ...draft, y3 }),
    },
  };
}
