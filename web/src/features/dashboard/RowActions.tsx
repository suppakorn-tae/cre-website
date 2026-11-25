import Link from 'next/link';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

import styles from './dashboard.module.css';

type Tone = 'default' | 'danger';

/** A small text link in a project row, for actions beyond the three standard ones. */
export function RowLink({
  href,
  children,
  ...rest
}: { href: string; children: ReactNode } & Omit<React.ComponentProps<'a'>, 'href'>) {
  return (
    <Link href={href} className={styles.rowAction} {...rest}>
      {children}
    </Link>
  );
}

/** A small text button in a project row. */
export function RowButton({
  tone = 'default',
  children,
  ...rest
}: { tone?: Tone; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={styles.rowAction} data-tone={tone} {...rest}>
      {children}
    </button>
  );
}
