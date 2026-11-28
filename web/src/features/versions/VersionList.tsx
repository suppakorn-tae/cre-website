'use client';

import { IconPlus } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { forwardRef } from 'react';

import { Button, EmptyState, Icon, LevelBadge } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import type { LimitState } from '@/features/dashboard/limit';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format/locale';

import type { VersionSummary } from './api';
import { newestFirst } from './rules';
import styles from './versions.module.css';
import { createProps, VersionCount, VersionLimitHint } from './VersionLimit';
import { VersionMenu } from './VersionMenu';

type Props = {
  projectId: string;
  versions: VersionSummary[];
  /** Versions out of the most the project may have; undefined until known. */
  limit?: LimitState;
  /** The card of the version being compared. */
  selectedId: string | undefined;
  onSelect: (version: VersionSummary) => void;
  onCreate: (trigger: HTMLElement | null) => void;
  onDelete: (version: VersionSummary, trigger: HTMLElement | null) => void;
};

/**
 * The "เวอร์ชัน" card of the versions tab (hi-fi 2.4): one card per version, newest
 * first. A click selects the version for the comparison; it does not navigate.
 */
export const VersionList = forwardRef<HTMLHeadingElement, Props>(function VersionList(
  { projectId, versions, limit, selectedId, onSelect, onCreate, onDelete },
  titleRef,
) {
  const t = useTranslations('versions.list');
  const rows = newestFirst(versions);

  return (
    <section className={styles.listCard} aria-labelledby="versions-title">
      <div className={styles.listHead}>
        <div className={styles.listHeading}>
          <h2 id="versions-title" ref={titleRef} tabIndex={-1} className={styles.listTitle}>
            {t('title')}
          </h2>
          <VersionCount limit={limit} />
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<Icon icon={IconPlus} size={16} />}
          className={styles.createButton}
          {...createProps(limit, onCreate)}
        >
          {t('createShort')}
        </Button>
      </div>
      <VersionLimitHint limit={limit} />
      {rows.length === 0 ? (
        <EmptyState
          title={t('empty.title')}
          description={t('empty.description')}
          action={<Button onClick={(e) => onCreate(e.currentTarget)}>{t('create')}</Button>}
        />
      ) : (
        <ul className={styles.versionCards}>
          {rows.map((v) => (
            <li key={v.id} className={styles.versionCardItem}>
              <VersionCard
                version={v}
                selected={v.id === selectedId}
                onSelect={() => onSelect(v)}
              />
              <div className={styles.versionCardMenu}>
                <VersionMenu projectId={projectId} version={v} onDelete={onDelete} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
});

function VersionCard({
  version: v,
  selected,
  onSelect,
}: {
  version: VersionSummary;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations('versions.list');
  const tUi = useTranslations('ui');
  const submitted = v.status === 'submitted';
  const hasLevels = v.very_high_count !== null && v.high_count !== null;

  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(styles.versionCard, selected && styles.versionCardSelected)}
      onClick={onSelect}
    >
      <span className={styles.versionCardHead}>
        <strong>{t('versionNo', { no: v.version_no })}</strong>
        <span aria-hidden="true">·</span>
        <span className={styles.versionCardCreated}>
          {t('createdOn', { date: formatDate(v.created_at) })}
        </span>
      </span>
      <span className={styles.badges}>
        <span className={submitted ? styles.badgeOk : styles.badgeMuted}>
          {t(`status.${v.status}`)}
        </span>
        <span className={v.editable ? styles.badgeInfo : styles.badgeWarn}>
          {v.editable ? t('status.latest') : t('status.readOnly')}
        </span>
      </span>
      {submitted && v.submitted_at ? (
        <span className={styles.versionCardLine}>
          {v.progress_at_submit === null
            ? t('submittedAt', { at: formatDateTime(v.submitted_at) })
            : t('submittedWithProgress', {
                at: formatDateTime(v.submitted_at),
                value: formatNumber(v.progress_at_submit),
              })}
        </span>
      ) : (
        <span className={styles.versionCardLine}>
          {v.editable ? t('notSubmittedYet') : t('neverSubmitted')}
        </span>
      )}
      {hasLevels && (
        <span className={styles.versionCardLevels}>
          <LevelBadge level="VH" count={v.very_high_count ?? 0} label={tUi('levels.VH')} />
          <LevelBadge level="H" count={v.high_count ?? 0} label={tUi('levels.H')} />
          {v.average_rm !== null && (
            <span className={styles.versionCardRm}>
              {t('averageRm', {
                value: formatNumber(v.average_rm, undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
              })}
            </span>
          )}
        </span>
      )}
    </button>
  );
}
