'use client';

import { IconAlertTriangle, IconInfoCircle, IconX } from '@tabler/icons-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

import { Button } from './Button';
import { cx } from './cx';
import styles from './feedback.module.css';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

type Props = {
  open: boolean;
  title: string;
  /** What will happen, e.g. a list of paragraphs. */
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** Red confirm button for deletes. Focus starts on cancel. */
  destructive?: boolean;
  /** Content of the 40px tile before the title. Default: a warning triangle (destructive) or info. */
  icon?: ReactNode;
  /** Icon before the confirm label, e.g. a trash can. */
  confirmIcon?: ReactNode;
  /** Shows a close (X) button at the top right, with this accessible name. */
  closeLabel?: string;
};

/**
 * Modal confirmation built on the native dialog element, so focus is trapped,
 * Esc cancels and the page behind is inert.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive,
  icon,
  confirmIcon,
  closeLabel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }
    if (!dialog.open) dialog.showModal();
    // Close on unmount and when the page is hidden but kept: after a client-side
    // navigation Next.js keeps the old page in a hidden <Activity>, and a modal
    // dialog left open there stays in the top layer and makes the new page inert.
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <div className={styles.head}>
        <span
          className={cx(
            'flex size-10 shrink-0 items-center justify-center rounded-pill',
            destructive ? 'bg-error-bg text-error' : 'bg-info-bg text-info',
          )}
        >
          {icon ?? <Icon icon={destructive ? IconAlertTriangle : IconInfoCircle} size={20} />}
        </span>
        <div className={cx(styles.headText, closeLabel && 'pe-8')}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <div id={bodyId} className={styles.body}>
            {children}
          </div>
        </div>
      </div>
      {closeLabel && (
        <IconButton
          icon={IconX}
          label={closeLabel}
          onClick={onCancel}
          className="absolute end-3 top-3"
        />
      )}
      <div className={styles.actions}>
        {/* Cancel always takes first focus: the close X has a tooltip that would swallow Esc. */}
        <Button variant="secondary" onClick={onCancel} autoFocus>
          {cancelLabel}
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'primary'}
          icon={confirmIcon}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
