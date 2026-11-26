import styles from './compare.module.css';

type Props<T extends string> = {
  /** Accessible name of the group. */
  label: string;
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * Two or three choices in one pill, one of them on. Native radio inputs sit
 * under the labels, so arrow keys, focus and the group role come from the browser.
 */
export function Segmented<T extends string>({ label, name, options, value, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className={styles.segmented}>
      {options.map((o) => (
        <label key={o.value} className={styles.segment}>
          <input
            type="radio"
            name={name}
            value={o.value}
            checked={o.value === value}
            onChange={() => onChange(o.value)}
            className={styles.segmentInput}
          />
          <span className={styles.segmentText}>{o.label}</span>
        </label>
      ))}
    </div>
  );
}
