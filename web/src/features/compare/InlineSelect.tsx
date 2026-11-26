import { useId, type ReactNode } from 'react';

import { SelectListbox } from '@/components/ui/SelectListbox';

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

/** A select with its label on the same line (the "v3 เทียบกับ [v2]" row of the hi-fi). */
export function InlineSelect({ label, options, value, onChange, disabled, emptyLabel }: Props) {
  const id = useId();
  return (
    <div className={styles.inlineSelect}>
      <label htmlFor={id} className={styles.inlineLabel}>
        {label}
      </label>
      <SelectListbox
        id={id}
        compact
        className={styles.selectWrap}
        options={options}
        value={value}
        placeholder={emptyLabel}
        disabled={disabled || options.length === 0}
        onChange={onChange}
      />
    </div>
  );
}
