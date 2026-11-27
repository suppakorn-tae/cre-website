import styles from './display.module.css';
import { cx } from './cx';

export const LEVELS = ['VL', 'L', 'M', 'H', 'VH'] as const;
export type Level = (typeof LEVELS)[number];

type Props = {
  level: Level;
  /** Optional count after the code, e.g. "H 11". */
  count?: number;
  /** Spoken name, e.g. "ความเสี่ยงสูง". The name starts with the printed code (WCAG 2.5.3). */
  label?: string;
};

/** Always prints the level code, never colour alone. */
export function LevelBadge({ level, count, label }: Props) {
  return (
    <span
      className={cx(styles.badge, styles[level.toLowerCase()], styles.tint)}
      aria-label={
        label ? [level, label, count].filter((x) => x !== undefined).join(' ') : undefined
      }
    >
      {level}
      {count !== undefined && <span>{count}</span>}
    </span>
  );
}
