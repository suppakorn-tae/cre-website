import { IconChevronDown } from '@tabler/icons-react';
import { useId, type ReactNode } from 'react';

import { Icon } from '@/components/ui';

import styles from './compare.module.css';

type Option = { value: string; label: string };

type Props = {
  /** Text before the select; it is also the accessible name. */
  label: ReactNode;
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shown when there is nothing to pick. */
  emptyLabel?: string;
};

/** A native select with its label on the same line (the "v3 เทียบกับ [v2]" row of the hi-fi). */
export function InlineSelect({ label, options, value, onChange, disabled, emptyLabel }: Props) {
  const id = useId();
  return (
    <div className={styles.inlineSelect}>
      <label htmlFor={id} className={styles.inlineLabel}>
        {label}
      </label>
      <span className={styles.selectWrap}>
        <select
          id={id}
          className={styles.select}
          value={value}
          disabled={disabled || options.length === 0}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.length === 0 && <option value="">{emptyLabel}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className={styles.selectChevron}>
          <Icon icon={IconChevronDown} size={18} />
        </span>
      </span>
    </div>
  );
}
