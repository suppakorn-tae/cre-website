'use client';

import { IconEye, IconEyeOff, IconLock } from '@tabler/icons-react';
import { useState, type InputHTMLAttributes } from 'react';

import { cx } from './cx';
import styles from './forms.module.css';
import { Icon } from './Icon';
import { IconButton } from './IconButton';

type Labels = {
  /** Name of the toggle while the password is hidden, e.g. "แสดงรหัสผ่าน". */
  show: string;
  /** Name of the toggle while the password is shown, e.g. "ซ่อนรหัสผ่าน". */
  hide: string;
};

type ViewProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> & {
  visible: boolean;
  onToggle: () => void;
  labels: Labels;
  /** Green border: the value passed its check. */
  valid?: boolean;
};

/**
 * The control of a password field: leading lock icon and an eye toggle button.
 * The toggle is named for the action it does and says whether it is on with
 * `aria-pressed`. The label, hint and error text belong to the caller.
 */
export function PasswordInputView({
  visible,
  onToggle,
  labels,
  valid,
  className,
  ...rest
}: ViewProps) {
  return (
    <div className={styles.controlWrap}>
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        className={cx(styles.control, styles.hasLead, styles.hasTrail, className)}
        data-valid={valid ? 'true' : undefined}
      />
      <span className={styles.lead}>
        <Icon icon={IconLock} size={18} />
      </span>
      <span className={styles.toggleSlot}>
        <IconButton
          icon={visible ? IconEyeOff : IconEye}
          size={18}
          label={visible ? labels.hide : labels.show}
          aria-pressed={visible}
          onClick={onToggle}
        />
      </span>
    </div>
  );
}

/** Password control that owns the show/hide state. */
export function PasswordInput(props: Omit<ViewProps, 'visible' | 'onToggle'>) {
  const [visible, setVisible] = useState(false);
  return <PasswordInputView {...props} visible={visible} onToggle={() => setVisible((v) => !v)} />;
}
