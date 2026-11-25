import { IconChevronRight } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './display.module.css';
import { Icon } from './Icon';

type Props = {
  label: string;
  value: ReactNode;
  /** Unit after the value, e.g. "ตัวชี้วัด". */
  unit?: string;
  note?: ReactNode;
  /** Icon tile before the label: an `<Icon />` of size 20. */
  icon?: ReactNode;
  /** Colour of the icon tile. Defaults to blue. */
  tone?: 'blue' | 'red' | 'orange';
  /** Makes the card a filter button. Omit for a display-only card. */
  onSelect?: () => void;
  selected?: boolean;
  /** Tag on the selected card, e.g. "กำลังแสดง". */
  selectedLabel?: string;
};

export function KpiCard({
  label,
  value,
  unit,
  note,
  icon,
  tone = 'blue',
  onSelect,
  selected,
  selectedLabel,
}: Props) {
  const content = (
    <>
      <span className={cx(styles.kpiHead, Boolean(icon) && styles.kpiHeadIcon)}>
        {icon && (
          <span className={cx(styles.kpiIcon, styles[`kpiTone-${tone}`])} aria-hidden="true">
            {icon}
          </span>
        )}
        <span className={styles.kpiLabel}>{label}</span>
        {selected && selectedLabel && <span className={styles.kpiTag}>{selectedLabel}</span>}
        {onSelect && !selected && (
          <span className={styles.kpiChevron}>
            <Icon icon={IconChevronRight} size={16} />
          </span>
        )}
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
