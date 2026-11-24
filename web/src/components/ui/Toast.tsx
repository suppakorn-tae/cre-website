import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './feedback.module.css';

type Props = {
  title: string;
  description?: ReactNode;
  tone?: 'success' | 'error' | 'info';
  /** Shows a close button when set, with this accessible name. */
  closeLabel?: string;
  onClose?: () => void;
};

/** One toast. Errors interrupt screen readers, the rest are announced politely. */
export function Toast({ title, description, tone = 'success', closeLabel, onClose }: Props) {
  return (
    <div className={cx(styles.toast, styles[tone])} role={tone === 'error' ? 'alert' : 'status'}>
      <div className={styles.toastText}>
        <p className={styles.toastTitle}>{title}</p>
        {description && <p className={styles.toastDesc}>{description}</p>}
      </div>
      {onClose && closeLabel && (
        <button type="button" className={styles.close} aria-label={closeLabel} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  );
}
