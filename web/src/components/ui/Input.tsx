import { IconSearch, type Icon as TablerIcon } from '@tabler/icons-react';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

import { cx } from './cx';
import { FieldMessage, LabelText, messageIds } from './Field';
import styles from './forms.module.css';
import { Icon } from './Icon';

type FieldProps = {
  label: ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  /** Text for the optional tag. Leave unset for required fields. */
  optionalLabel?: string;
};

export type InputProps = FieldProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    /** Leading icon (18px), e.g. IconMail. Decorative: the label names the field. */
    icon?: TablerIcon;
  };

export function Input({
  label,
  helper,
  error,
  optionalLabel,
  icon,
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
      <div className={styles.controlWrap}>
        <input
          id={inputId}
          className={cx(styles.control, icon && styles.hasLead)}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        />
        {icon && (
          <span className={styles.lead}>
            <Icon icon={icon} size={18} />
          </span>
        )}
      </div>
      <FieldMessage id={inputId} helper={helper} error={error} />
    </div>
  );
}

/** Text input with a leading search icon. */
export function SearchInput(props: Omit<InputProps, 'icon' | 'type'>) {
  return <Input {...props} type="search" icon={IconSearch} />;
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
