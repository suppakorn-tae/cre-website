'use client';

import { IconInfoCircle } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';

import type { LimitState } from '@/features/dashboard/limit';
import { Icon } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import styles from './versions.module.css';

/** Id of the hint that tells why "new version" is off; the disabled actions point at it. */
export const VERSION_LIMIT_HINT_ID = 'version-limit-hint';

/**
 * Props that turn a "new version" control off at the limit without taking it out of the tab
 * order: `aria-disabled`, a description that names the reason, and no call to `onCreate`.
 */
export function createProps(
  limit: LimitState | undefined,
  onCreate: (trigger: HTMLElement | null) => void,
) {
  const off = limit?.atLimit === true;
  return {
    'aria-disabled': off || undefined,
    'aria-describedby': off ? VERSION_LIMIT_HINT_ID : undefined,
    onClick: (e: { currentTarget: HTMLElement }) => {
      if (!off) onCreate(e.currentTarget);
    },
  };
}

/** "n / max versions" chip; warning colour at the limit. Nothing until the limit is known. */
export function VersionCount({ limit }: { limit: LimitState | undefined }) {
  const t = useTranslations('versions.limit');
  if (!limit) return null;
  return (
    <span className={styles.limitCount} data-at-limit={limit.atLimit || undefined}>
      {t('count', { count: formatNumber(limit.count), max: formatNumber(limit.max) })}
    </span>
  );
}

/** Says why "new version" is off and how to get a slot back. Nothing below the limit. */
export function VersionLimitHint({ limit }: { limit: LimitState | undefined }) {
  const t = useTranslations('versions.limit');
  if (!limit?.atLimit) return null;
  return (
    <p id={VERSION_LIMIT_HINT_ID} className={styles.limitHint}>
      <Icon icon={IconInfoCircle} size={18} />
      <span>{t('hint', { max: formatNumber(limit.max) })}</span>
    </p>
  );
}
