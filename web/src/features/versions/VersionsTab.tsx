'use client';

import { IconFileOff } from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { forwardRef, useState } from 'react';

import { Alert, EmptyState, Icon } from '@/components/ui';
import { ComparePanel, type CompareViewName } from '@/features/compare/ComparePanel';
import { formatDate } from '@/lib/format/locale';

import type { VersionSummary } from './api';
import { latestVersion, newestFirst, progressByVersion, projectPaths } from './rules';
import styles from './versions.module.css';
import { VersionList } from './VersionList';

type Props = {
  projectId: string;
  versions: VersionSummary[];
  view: CompareViewName;
  onViewChange: (view: CompareViewName) => void;
  onCreate: (trigger: HTMLElement | null) => void;
  onDelete: (version: VersionSummary, trigger: HTMLElement | null) => void;
};

/**
 * The version shown first: the newest one that was submitted, because only
 * submitted versions have figures to compare. Without one, the newest version.
 */
export function defaultSelection(versions: VersionSummary[]): VersionSummary | undefined {
  const rows = newestFirst(versions);
  return rows.find((v) => v.status === 'submitted') ?? rows[0];
}

/** Versions tab (hi-fi 2.4, 2.5, 2.8): the version cards on the left, the comparison on the right. */
export const VersionsTab = forwardRef<HTMLHeadingElement, Props>(function VersionsTab(
  { projectId, versions, view, onViewChange, onCreate, onDelete },
  titleRef,
) {
  const [pickedId, setPickedId] = useState<string | null>(null);
  // A deleted version drops out of `versions`, and the default takes over.
  const selected = versions.find((v) => v.id === pickedId) ?? defaultSelection(versions);

  return (
    <div className={styles.tabLayout}>
      <VersionList
        ref={titleRef}
        projectId={projectId}
        versions={versions}
        selectedId={selected?.id}
        onSelect={(v) => setPickedId(v.id)}
        onCreate={onCreate}
        onDelete={onDelete}
      />
      <div className={styles.compareColumn}>
        {selected &&
          (selected.status === 'submitted' ? (
            <ComparePanel
              projectId={projectId}
              versionId={selected.id}
              versionNo={selected.version_no}
              view={view}
              onViewChange={onViewChange}
              progress={progressByVersion(versions)}
            />
          ) : (
            <NeverSubmitted projectId={projectId} version={selected} versions={versions} />
          ))}
      </div>
    </div>
  );
});

/** A version that was never submitted has no figures: say why, and where to go (hi-fi 2.8). */
function NeverSubmitted({
  projectId,
  version,
  versions,
}: {
  projectId: string;
  version: VersionSummary;
  versions: VersionSummary[];
}) {
  const t = useTranslations('versions.never');
  const tList = useTranslations('versions.list');
  const latest = latestVersion(versions);
  const readOnly = !version.editable;

  return (
    <div className={styles.neverStack}>
      <div className={styles.neverHead}>
        <h2 className={styles.neverTitle}>
          <strong>{tList('versionNo', { no: version.version_no })}</strong>
          <span aria-hidden="true"> · </span>
          <span className={styles.cardCreated}>
            {tList('createdOn', { date: formatDate(version.created_at) })}
          </span>
        </h2>
        <span className={styles.badges}>
          <span className={styles.badgeMuted}>{tList('status.draft')}</span>
          <span className={readOnly ? styles.badgeWarn : styles.badgeInfo}>
            {readOnly ? tList('status.readOnly') : tList('status.latest')}
          </span>
        </span>
      </div>
      {readOnly && latest && (
        <Alert tone="warning" title={t('readOnlyTitle', { no: version.version_no })} role="status">
          {t('readOnlyBody', { no: latest.version_no })}
        </Alert>
      )}
      <div className={styles.neverCard}>
        <EmptyState
          icon={<Icon icon={IconFileOff} size={24} />}
          title={t('title')}
          description={readOnly ? t('descriptionNever') : t('descriptionDraft')}
          action={
            <div className={styles.neverActions}>
              <Link
                className={readOnly ? styles.secondaryLink : styles.primaryLink}
                href={projectPaths.assessment(projectId, version.id)}
              >
                {readOnly ? t('viewAnswers') : t('answer')}
              </Link>
              {readOnly && latest && (
                <Link
                  className={styles.primaryLink}
                  href={projectPaths.assessment(projectId, latest.id)}
                >
                  {t('openLatest', { no: latest.version_no })}
                </Link>
              )}
            </div>
          }
        />
      </div>
    </div>
  );
}
