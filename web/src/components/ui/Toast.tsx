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
  /** Replaces the icon of the tone, e.g. a spinner while work is in progress. */
  icon?: ReactNode;
  /** A link or button under the text, e.g. "ลองอีกครั้ง". */
  action?: ReactNode;
  /** Set inside a Toaster, which already announces the toast: the box then has no live role. */
  bare?: boolean;
  /** Shows a close button when set, with this accessible name, e.g. "ปิดการแจ้งเตือน". */
  closeLabel?: string;
  onClose?: () => void;
};

/** One toast. Errors interrupt screen readers, the rest are announced politely. */
export function Toast({
  title,
  description,
  tone = 'success',
  icon,
  action,
  bare,
  closeLabel,
  onClose,
}: Props) {
  const role = bare ? undefined : tone === 'error' ? 'alert' : 'status';
  const iconClass = cx(styles.toastIcon, styles[`${tone}Icon`]);
  return (
    <div className={cx(styles.toast, styles[tone])} role={role}>
      {icon ? (
        <span className={iconClass}>{icon}</span>
      ) : (
        <Icon icon={TONE_ICONS[tone]} size={20} className={iconClass} />
      )}
      <div className={styles.toastText}>
        <p className={styles.toastTitle}>{title}</p>
        {description && <p className={styles.toastDesc}>{description}</p>}
        {action && <div className={styles.toastAction}>{action}</div>}
      </div>
      {onClose && closeLabel && (
        <IconButton icon={IconX} size={18} label={closeLabel} onClick={onClose} />
      )}
    </div>
  );
}

/** Class of a link-like button or anchor inside a toast, next to `Toast`'s `action` slot. */
export const TOAST_ACTION_CLASS = styles.toastActionLink;
