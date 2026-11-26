'use client';

import { IconChevronDown } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Icon } from '@/components/ui';

import styles from './assessment.module.css';
import { countGroup, type Draft } from './rules';

/** Codes of every indicator of some factors. */
export const codesOf = (factors: { indicators: { code: string }[] }[]) =>
  factors.flatMap((f) => f.indicators.map((i) => i.code));

/** "ตอบครบ 3/5 · ตอบแล้ว 4" of a group header. */
export function Progress({
  codes,
  drafts,
}: {
  codes: string[];
  drafts: Record<string, Draft | undefined>;
}) {
  const t = useTranslations('assessment.progress');
  const { total, answered, complete } = countGroup(codes, drafts);
  return (
    <span className={styles.progress}>
      {t('group', { complete, total })} · {t('answered', { answered })}
    </span>
  );
}

/** Name of a dimension or factor as the button that folds and opens its rows. */
export function GroupToggle({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className={styles.groupToggle} aria-expanded={open} onClick={onToggle}>
      <Icon icon={IconChevronDown} size={18} className={styles.groupChevron} />
      <span className={styles.groupName}>{children}</span>
    </button>
  );
}
