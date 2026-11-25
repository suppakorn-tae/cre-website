import { IconX } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { TONE_ICONS, type AlertTone } from './Alert';
import { cx } from './cx';
import styles from './feedback.module.css';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

type Props = {
  title: string;
  description?: ReactNode;
  tone?: AlertTone;
  /** Shows a close button when set, with this accessible name, e.g. "ปิดการแจ้งเตือน". */
  closeLabel?: string;
  onClose?: () => void;
};

/** One toast. Errors interrupt screen readers, the rest are announced politely. */
export function Toast({ title, description, tone = 'success', closeLabel, onClose }: Props) {
  return (
    <div className={cx(styles.toast, styles[tone])} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon
        icon={TONE_ICONS[tone]}
        size={20}
        className={cx(styles.toastIcon, styles[`${tone}Icon`])}
      />
      <div className={styles.toastText}>
        <p className={styles.toastTitle}>{title}</p>
        {description && <p className={styles.toastDesc}>{description}</p>}
      </div>
      {onClose && closeLabel && (
        <IconButton icon={IconX} size={18} label={closeLabel} onClick={onClose} />
      )}
    </div>
  );
}
