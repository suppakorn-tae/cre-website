'use client';

import { useId, type ReactNode } from 'react';

import { cx } from './cx';
import { FieldMessage, LabelText, messageIds } from './Field';
import styles from './forms.module.css';
import { SelectListbox, type SelectOption } from './SelectListbox';

export type MultiSelectProps = {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  optionalLabel?: string;
  options: SelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** Label of the top row that selects or clears everything, e.g. "ทั้งหมด". */
  allLabel: string;
  /** Trigger text for several (not all) values, e.g. a function returning "3 รายการ". */
  countLabel: (count: number) => string;
  /** Trigger text when nothing is selected. */
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

/** Labelled multi-value picker with a checkbox per option and a select-all row. */
export function MultiSelect({
  label,
  helper,
  error,
  optionalLabel,
  id,
  className,
  required,
  ...rest
}: MultiSelectProps) {
  const generated = useId();
  const selectId = id ?? generated;
  const { describedBy } = messageIds(selectId, { helper, error });
  return (
    <div className={cx(styles.field, className)}>
      <label id={`${selectId}-label`} htmlFor={selectId} className={styles.label}>
        <LabelText required={required} optionalLabel={optionalLabel}>
          {label}
        </LabelText>
      </label>
      <SelectListbox
        {...rest}
        multiple
        id={selectId}
        labelId={`${selectId}-label`}
        required={required}
        invalid={Boolean(error)}
        describedBy={describedBy}
      />
      <FieldMessage id={selectId} helper={helper} error={error} />
    </div>
  );
}
