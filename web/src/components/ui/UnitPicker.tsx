import { useId, type ReactNode } from 'react';

import { cx } from './cx';
import { FieldMessage, LabelText, messageIds } from './Field';
import styles from './forms.module.css';

export type UnitOption = { value: string; label: string };
export type UnitValue = { amount: string; unit: string };

/** Switching unit keeps what the user typed. */
export function withUnit(value: UnitValue, unit: string): UnitValue {
  return { ...value, unit };
}

type Props = {
  label: ReactNode;
  /** Two or more units, e.g. baht / %, or days / %. */
  units: UnitOption[];
  value: UnitValue;
  onChange: (value: UnitValue) => void;
  /** Accessible name of the unit switch, e.g. "หน่วย". */
  unitsLabel?: string;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optionalLabel?: string;
  disabled?: boolean;
  id?: string;
};

export function UnitPicker({
  label,
  units,
  value,
  onChange,
  unitsLabel,
  helper,
  error,
  required,
  optionalLabel,
  disabled,
  id,
}: Props) {
  const generated = useId();
  const inputId = id ?? generated;
  const { describedBy } = messageIds(inputId, { helper, error });
  return (
    <div className={styles.field}>
      <label htmlFor={inputId} className={styles.label}>
        <LabelText required={required} optionalLabel={optionalLabel}>
          {label}
        </LabelText>
      </label>
      <div className={styles.unitRow}>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          className={cx(styles.control, styles.numeric)}
          value={value.amount}
          disabled={disabled}
          required={required}
          onChange={(e) => onChange({ ...value, amount: e.target.value })}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        <div role="radiogroup" aria-label={unitsLabel} className={styles.segmented}>
          {units.map((u) => (
            <button
              key={u.value}
              type="button"
              role="radio"
              aria-checked={u.value === value.unit}
              disabled={disabled}
              className={styles.segment}
              onClick={() => onChange(withUnit(value, u.value))}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>
      <FieldMessage id={inputId} helper={helper} error={error} />
    </div>
  );
}
