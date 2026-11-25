import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
  IconX,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';

import { cx } from './cx';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

/** The icon of each tone. The toast uses the same set. */
export const TONE_ICONS: Record<AlertTone, TablerIcon> = {
  info: IconInfoCircle,
  success: IconCircleCheck,
  warning: IconAlertTriangle,
  error: IconAlertCircle,
};

const BOX: Record<AlertTone, string> = {
  info: 'border-info-border bg-info-bg',
  success: 'border-success-border bg-success-bg',
  warning: 'border-warning-border bg-warning-bg',
  error: 'border-error-border bg-error-bg',
};

const ICON_COLOR: Record<AlertTone, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
};

type Props = {
  tone?: AlertTone;
  /** Bold first line. Without it the children are the message. */
  title?: ReactNode;
  children?: ReactNode;
  /** A link or button at the end of the banner, e.g. "สมัครสมาชิก". */
  action?: ReactNode;
  /** Shows a close button when both are set. */
  onClose?: () => void;
  closeLabel?: string;
  /** Errors interrupt screen readers (alert); the rest are polite (status). */
  role?: 'alert' | 'status';
  className?: string;
};

/** Inline banner above the content it describes (hi-fi "Alerts and feedback"). */
export function Alert({
  tone = 'info',
  title,
  children,
  action,
  onClose,
  closeLabel,
  role,
  className,
}: Props) {
  return (
    <div
      role={role ?? (tone === 'error' ? 'alert' : 'status')}
      className={cx(
        'box-border flex min-w-0 items-start gap-3 rounded-card border px-4 py-3 text-body text-text',
        BOX[tone],
        className,
      )}
    >
      <Icon icon={TONE_ICONS[tone]} size={20} className={cx('mt-px shrink-0', ICON_COLOR[tone])} />
      <div className="min-w-0 flex-1 break-words">
        {title ? (
          <>
            <p className="m-0 font-semibold">{title}</p>
            {children && <div className="text-small text-text-secondary">{children}</div>}
          </>
        ) : (
          children
        )}
      </div>
      {action && <div className="shrink-0 text-small font-semibold">{action}</div>}
      {onClose && closeLabel && (
        <IconButton
          icon={IconX}
          size={18}
          label={closeLabel}
          onClick={onClose}
          className="-my-1 -me-2"
        />
      )}
    </div>
  );
}
