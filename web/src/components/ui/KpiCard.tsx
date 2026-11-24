import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './display.module.css';

type Props = {
  label: string;
  value: ReactNode;
  /** Unit after the value, e.g. "ตัวชี้วัด". */
  unit?: string;
  note?: ReactNode;
  /** Makes the card a filter button. Omit for a display-only card. */
  onSelect?: () => void;
  selected?: boolean;
  /** Tag on the selected card, e.g. "กำลังแสดง". */
  selectedLabel?: string;
};

export function KpiCard({ label, value, unit, note, onSelect, selected, selectedLabel }: Props) {
  const content = (
    <>
      <span className={styles.kpiHead}>
        {label}
        {selected && selectedLabel && <span className={styles.kpiTag}>{selectedLabel}</span>}
      </span>
      <span className={styles.kpiValue}>
        {value}
        {unit && <span className={styles.kpiUnit}>{unit}</span>}
      </span>
      {note && <span className={styles.kpiNote}>{note}</span>}
    </>
  );
  const className = cx(styles.kpi, selected && styles.kpiSelected);
  if (!onSelect) return <div className={className}>{content}</div>;
  return (
    <button type="button" className={className} aria-pressed={Boolean(selected)} onClick={onSelect}>
      {content}
    </button>
  );
}
