'use client';

import { useId, type ReactNode } from 'react';

import { cx } from './cx';
import { FieldMessage, LabelText, messageIds } from './Field';
import styles from './forms.module.css';
import { SelectListbox, type SelectOption } from './SelectListbox';

export type { SelectOption } from './SelectListbox';

export type SelectProps = {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  /** Text for the optional tag. Leave unset for required fields. */
  optionalLabel?: string;
  options: SelectOption[];
  value?: string;
  /** Called with the new value. */
  onValueChange?: (value: string) => void;
  /**
   * Same call shape as a native select (`e.target.value`), so forms written for the
   * old select keep working. Prefer `onValueChange` in new code.
   */
  onChange?: (event: { target: { value: string; name?: string } }) => void;
  /** Text of the trigger (and the empty first row) when nothing is chosen. */
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

/** Labelled single-value picker. The list is our own popover, not the browser's select. */
export function Select({
  label,
  helper,
  error,
  optionalLabel,
  options,
  value = '',
  onValueChange,
  onChange,
  placeholder,
  id,
  name,
  disabled,
  required,
  className,
}: SelectProps) {
  const generated = useId();
  const selectId = id ?? generated;
  const { describedBy } = messageIds(selectId, { helper, error });
  const rows =
    placeholder !== undefined ? [{ value: '', label: placeholder }, ...options] : options;
  return (
    <div className={cx(styles.field, className)}>
      <label id={`${selectId}-label`} htmlFor={selectId} className={styles.label}>
        <LabelText required={required} optionalLabel={optionalLabel}>
          {label}
        </LabelText>
      </label>
      <SelectListbox
        id={selectId}
        labelId={`${selectId}-label`}
        required={required}
        name={name}
        options={rows}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        invalid={Boolean(error)}
        describedBy={describedBy}
        onChange={(v) => {
          onValueChange?.(v);
          onChange?.({ target: { value: v, name } });
        }}
      />
      <FieldMessage id={selectId} helper={helper} error={error} />
    </div>
  );
}
