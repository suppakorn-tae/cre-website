import { IconPlus } from '@tabler/icons-react';
import Link from 'next/link';

import { Icon } from '@/components/ui';

import styles from './dashboard.module.css';

/**
 * Primary "add project" link. With `compactOnPhone` it shrinks to a 44px icon
 * button below 600px; the label stays in the page for screen readers.
 */
export function AddProjectLink({
  label,
  compactOnPhone,
}: {
  label: string;
  compactOnPhone?: boolean;
}) {
  return (
    <Link
      href="/projects/new"
      className={compactOnPhone ? `${styles.addLink} ${styles.addCompact}` : styles.addLink}
    >
      <Icon icon={IconPlus} size={20} />
      <span className={compactOnPhone ? styles.addText : undefined}>{label}</span>
    </Link>
  );
}
