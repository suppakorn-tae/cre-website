import { IconAlertCircle } from '@tabler/icons-react';
import { useId } from 'react';

import { Icon, type CheckboxOption } from '@/components/ui';

import styles from './LetterChoiceList.module.css';

type Props = {
  /** Name of the group for assistive technology (visually hidden). */
  legend: string;
  /** The letter of each option is its `value`; `label` is the text beside it. */
  options: CheckboxOption[];
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  /** Values whose line is shown as wrong, with `error` under the list. */
  invalid?: string[];
  error?: string;
  /** Id of text that also describes the group (a question, a helper). */
  describedBy?: string;
};

/**
 * One checkbox per line with the letter as a badge, for multi-select answers such as y3.
 * It never changes the choices by itself: a rule that breaks (A with another option) is
 * shown through `invalid` and `error`, and announced politely.
 */
export function LetterChoiceList({
  legend,
  options,
  value,
  onChange,
  disabled,
  invalid = [],
  error,
  describedBy,
}: Props) {
  const errorId = `${useId()}-error`;
  const described = [describedBy, error ? errorId : null].filter(Boolean).join(' ');
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <fieldset
      className={styles.group}
      disabled={disabled}
      aria-describedby={described || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.list}>
        {options.map((o) => (
          <label
            key={o.value}
            className={styles.line}
            data-checked={value.includes(o.value) || undefined}
            data-invalid={invalid.includes(o.value) || undefined}
          >
            <input
              type="checkbox"
              className={styles.input}
              value={o.value}
              checked={value.includes(o.value)}
              onChange={() => toggle(o.value)}
            />
            <span className={styles.badge}>{o.value}</span>
            <span className={styles.text}>{o.label}</span>
          </label>
        ))}
      </div>
      {/* Always in the page, so a screen reader announces the text when it appears. */}
      <p id={errorId} className={styles.error} aria-live="polite">
        {error && (
          <>
            <Icon icon={IconAlertCircle} size={16} />
            <span>{error}</span>
          </>
        )}
      </p>
    </fieldset>
  );
}
