import styles from './display.module.css';
import { cx } from './cx';

export const LEVELS = ['VL', 'L', 'M', 'H', 'VH'] as const;
export type Level = (typeof LEVELS)[number];

type Props = {
  level: Level;
  /** Optional count after the code, e.g. "H 11". */
  count?: number;
  /** Tint for tables, solid for charts and heat maps. */
  variant?: 'tint' | 'solid';
  /** Spoken name, e.g. "ความเสี่ยงสูง". The code alone is not read well. */
  label?: string;
};

/** Always prints the level code, never colour alone. */
export function LevelBadge({ level, count, variant = 'tint', label }: Props) {
  return (
    <span
      className={cx(styles.badge, styles[level.toLowerCase()], styles[variant])}
      aria-label={label ? (count === undefined ? label : `${label} ${count}`) : undefined}
    >
      {level}
      {count !== undefined && <span>{count}</span>}
    </span>
  );
}
