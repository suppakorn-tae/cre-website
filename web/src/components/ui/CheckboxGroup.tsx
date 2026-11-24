import { useId, type ReactNode } from 'react';

import { cx } from './cx';
import { FieldMessage, LabelText, messageIds } from './Field';
import styles from './forms.module.css';

export type CheckboxOption = {
  value: string;
  label: string;
  /** Cannot be combined with any other option (e.g. "none of the above"). */
  exclusive?: boolean;
};

/**
 * Next selection after toggling `value`. Choosing an exclusive option clears
 * the rest; choosing any other option drops an exclusive one.
 */
export function toggleOption(
  options: CheckboxOption[],
  selected: string[],
  value: string,
): string[] {
  if (selected.includes(value)) return selected.filter((v) => v !== value);
  const exclusive = new Set(options.filter((o) => o.exclusive).map((o) => o.value));
  if (exclusive.has(value)) return [value];
  return [...selected.filter((v) => !exclusive.has(v)), value];
}

type Props = {
  legend: ReactNode;
  options: CheckboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  optionalLabel?: string;
  disabled?: boolean;
  name?: string;
};

export function CheckboxGroup({
  legend,
  options,
  value,
  onChange,
  helper,
  error,
  required,
  optionalLabel,
  disabled,
  name,
}: Props) {
  const id = useId();
  const { describedBy } = messageIds(id, { helper, error });
  return (
    <fieldset
      className={cx(styles.group, Boolean(error) && styles.invalid)}
      aria-describedby={describedBy}
      aria-invalid={error ? true : undefined}
      disabled={disabled}
    >
      <legend className={styles.label}>
        <LabelText required={required} optionalLabel={optionalLabel}>
          {legend}
        </LabelText>
      </legend>
      <div className={styles.chips}>
        {options.map((o) => (
          <label key={o.value} className={styles.chip}>
            <input
              type="checkbox"
              name={name}
              value={o.value}
              checked={value.includes(o.value)}
              onChange={() => onChange(toggleOption(options, value, o.value))}
            />
            <span className={styles.chipFace}>{o.label}</span>
          </label>
        ))}
      </div>
      <FieldMessage id={id} helper={helper} error={error} />
    </fieldset>
  );
}
