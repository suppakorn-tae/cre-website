'use client';

import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Icon } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import { useProjectLimit } from './api';
import styles from './dashboard.module.css';

/** Id of the hint that tells why "add project" is off; the disabled link points at it. */
export const PROJECT_LIMIT_HINT_ID = 'project-limit-hint';

/**
 * Primary "add project" link. With `compactOnPhone` it shrinks to a 44px icon
 * button below 600px; the label stays in the page for screen readers. With
 * `withLimit` it also shows "n / max" and, at the limit, turns off: the link
 * stays in the tab order (`aria-disabled`), does not navigate, and is described
 * by `ProjectLimitHint`, which the page puts below its header.
 */
export function AddProjectLink({
  label,
  compactOnPhone,
  withLimit,
}: {
  label: string;
  compactOnPhone?: boolean;
  withLimit?: boolean;
}) {
  const t = useTranslations('projects.limit');
  const limit = useProjectLimit(withLimit);
  const off = limit?.atLimit === true;
  const link = (
    <Link
      href="/projects/new"
      className={compactOnPhone ? `${styles.addLink} ${styles.addCompact}` : styles.addLink}
      aria-disabled={off || undefined}
      aria-describedby={off ? PROJECT_LIMIT_HINT_ID : undefined}
      onClick={off ? (e) => e.preventDefault() : undefined}
    >
      <Icon icon={IconPlus} size={20} />
      <span className={compactOnPhone ? styles.addText : undefined}>{label}</span>
    </Link>
  );
  if (!withLimit) return link;
  return (
    <div className={styles.addGroup}>
      {/* The box keeps its width while the count loads, so the header does not move. */}
      <span className={styles.limitCount} data-at-limit={off || undefined}>
        {limit && t('count', { count: formatNumber(limit.count), max: formatNumber(limit.max) })}
      </span>
      {link}
    </div>
  );
}

/** Says why "add project" is off and how to get a slot back. Nothing below the limit. */
export function ProjectLimitHint() {
  const t = useTranslations('projects.limit');
  const limit = useProjectLimit();
  if (!limit?.atLimit) return null;
  return (
    <p id={PROJECT_LIMIT_HINT_ID} className={styles.limitHint}>
      <Icon icon={IconInfoCircle} size={18} />
      <span>{t('hint', { max: formatNumber(limit.max) })}</span>
    </p>
  );
}
