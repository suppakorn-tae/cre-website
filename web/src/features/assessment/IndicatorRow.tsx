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
  /** Question shown above the field while it has focus. */
  hint?: Hint;
  /** Unit written under the input (X: it changes from indicator to indicator). */
  unit?: string;
  /** Unit written inside the input, after the number (y1, y2). */
  suffix?: string;
  onChange: (value: string) => void;
};

/** One number field of the row: its focus hint, unit and the error under the input. */
function NumberCell({
  label,
  inputLabel,
  value,
  disabled,
  error,
  hint,
  unit,
  suffix,
  onChange,
}: CellProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const described = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');
  return (
    <td className={styles.cell} data-label={label}>
      <FocusHint hint={hint} id={hintId}>
        <input
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
      </FocusHint>
      {unit && <span className={styles.unitText}>{unit}</span>}
      {error && (
        <p id={errorId} className={styles.cellError}>
          {error}
        </p>
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
  const ids = useId();
  const y3ErrorId = `${ids}-y3-error`;
  const y3HintId = `${ids}-y3-hint`;
  // A closing y3 panel hands focus back to its button; the hint should not pop up then.
  const quietRef = useRef(false);

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

  const y3Hint = hint('y3', indicator.question_y3);
  const y3Error = y3Conflict(draft.y3) ? t('y3.exclusiveError') : serverError('y3');

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
        unit={indicator.unit}
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
        <FocusHint hint={y3Hint} id={y3HintId} quietRef={quietRef}>
          <Y3Picker
            code={code}
            question={indicator.question_y3}
            options={y3Options}
            value={draft.y3}
            disabled={disabled}
            describedBy={[y3Hint ? y3HintId : null, y3Error ? y3ErrorId : null]
              .filter(Boolean)
              .join(' ')}
            quietRef={quietRef}
            onChange={(y3) => onChange({ ...draft, y3 })}
          />
        </FocusHint>
        {y3Error && (
          <p id={y3ErrorId} className={styles.cellError}>
            {y3Error}
          </p>
        )}
      </td>
      <td className={styles.statusCell} data-label={t('table.status')}>
        <span className={styles.badge} data-state={state}>
          {t(`indicator.${state}`)}
        </span>
      </td>
    </tr>
  );
}
