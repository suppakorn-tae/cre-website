import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';

import { cx } from './cx';
import { FieldMessage, LabelText, messageIds } from './Field';
import styles from './forms.module.css';

type FieldProps = {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  /** Text for the optional tag. Leave unset for required fields. */
  optionalLabel?: string;
};

export type InputProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>;

export function Input({
  label,
  helper,
  error,
  optionalLabel,
  id,
  className,
  required,
  ...rest
}: InputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const { describedBy } = messageIds(inputId, { helper, error });
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={inputId} className={styles.label}>
        <LabelText required={required} optionalLabel={optionalLabel}>
          {label}
        </LabelText>
      </label>
      <input
        id={inputId}
        className={styles.control}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      />
      <FieldMessage id={inputId} helper={helper} error={error} />
    </div>
  );
}

export type NumberInputProps = Omit<InputProps, 'type' | 'value' | 'onChange'> & {
  /** Kept as text so the user's typing is never rewritten. */
  value: string;
  onChange: (value: string) => void;
  /** Unit shown after the field, e.g. "ครั้ง/ช่วงเวลา". */
  suffix?: ReactNode;
};

export function NumberInput({
  label,
  helper,
  error,
  optionalLabel,
  suffix,
  value,
  onChange,
  id,
  className,
  required,
  ...rest
}: NumberInputProps) {
  const generated = useId();
  const inputId = id ?? generated;
  const { describedBy } = messageIds(inputId, { helper, error });
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={inputId} className={styles.label}>
        <LabelText required={required} optionalLabel={optionalLabel}>
          {label}
        </LabelText>
      </label>
      <div className={styles.withSuffix}>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          className={cx(styles.control, styles.numeric)}
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {suffix && <span className={styles.suffix}>{suffix}</span>}
      </div>
      <FieldMessage id={inputId} helper={helper} error={error} />
    </div>
  );
}

export type SelectOption = { value: string; label: string };

export type SelectProps = FieldProps &
  Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> & {
    options: SelectOption[];
    /** Text of the empty first option. */
    placeholder?: string;
  };

export function Select({
  label,
  helper,
  error,
  optionalLabel,
  options,
  placeholder,
  id,
  className,
  required,
  ...rest
}: SelectProps) {
  const generated = useId();
  const selectId = id ?? generated;
  const { describedBy } = messageIds(selectId, { helper, error });
  return (
    <div className={cx(styles.field, className)}>
      <label htmlFor={selectId} className={styles.label}>
        <LabelText required={required} optionalLabel={optionalLabel}>
          {label}
        </LabelText>
      </label>
      <select
        id={selectId}
        className={styles.control}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldMessage id={selectId} helper={helper} error={error} />
    </div>
  );
}
