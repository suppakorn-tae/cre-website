import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from './cx';
import styles from './forms.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';
export type ButtonSize = 'sm' | 'md' | 'lg';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Leading icon. Icon-only buttons must also pass `aria-label`. */
  icon?: ReactNode;
  /** Trailing icon, e.g. an arrow on the primary action of a form. */
  trailingIcon?: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  icon,
  trailingIcon,
  className,
  type = 'button',
  children,
  ...rest
}: Props) {
  return (
    <button
      type={type}
      className={cx(
        styles.btn,
        styles[variant],
        size !== 'md' && styles[size],
        fullWidth && styles.fullWidth,
        !children && styles.iconOnly,
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
      {trailingIcon}
    </button>
  );
}
