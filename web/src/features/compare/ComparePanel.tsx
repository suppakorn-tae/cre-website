'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Alert, Button, Skeleton } from '@/components/ui';
import { formatDate } from '@/lib/format/locale';

import { fetchTrend, trendKey } from './api';
import styles from './compare.module.css';
import { InlineSelect } from './InlineSelect';
import { RmView } from './RmView';
import { defaultBase, submittedVersions } from './rules';
import { Segmented } from './Segmented';
import { SummaryView } from './SummaryView';

export type CompareViewName = 'summary' | 'rm';

type Props = {
  projectId: string;
  /** The version in focus: the "v3" of "v3 เทียบกับ". */
  versionId: string;
  versionNo: number;
  view: CompareViewName;
  onViewChange: (view: CompareViewName) => void;
  /** Progress at submit per version id, shown under the version on the charts. */
  progress: Record<string, number>;
};

/** The comparison of the versions tab (hi-fi 2.4 and 2.5): who against whom, and which view. */
export function ComparePanel({
  projectId,
  versionId,
  versionNo,
  view,
  onViewChange,
  progress,
}: Props) {
  const t = useTranslations('compare');
  const trend = useQuery({ queryKey: trendKey(projectId), queryFn: () => fetchTrend(projectId) });
  const [override, setOverride] = useState<{ version: string; base: string } | null>(null);

  if (trend.isError) {
    return (
      <Alert
        tone="error"
        action={
          <Button variant="ghost" size="sm" onClick={() => void trend.refetch()}>
            {t('retry')}
          </Button>
        }
      >
        {t('loadFailed')}
      </Alert>
    );
  }
  if (!trend.data) {
    return (
      <div aria-busy="true" className={styles.stack}>
        <Skeleton height="2.5rem" />
        <Skeleton height="8rem" />
        <Skeleton height="16rem" />
      </div>
    );
  }

  const points = trend.data;
  const others = submittedVersions(points).filter((p) => p.version_id !== versionId);
  const picked =
    override?.version === versionId && others.some((p) => p.version_id === override.base)
      ? override.base
      : null;
  const baseId = picked ?? defaultBase(points, versionId);

  return (
    <div className={styles.stack}>
      <div className={styles.compareHead}>
        <InlineSelect
          label={t('head.versus', { no: versionNo })}
          value={baseId ?? ''}
          options={others.map((p) => ({
            value: p.version_id,
            label: t('head.option', {
              no: p.version_no,
              date: p.submitted_at ? formatDate(p.submitted_at) : '',
            }),
          }))}
          emptyLabel={t('head.noOther')}
          onChange={(base) => setOverride({ version: versionId, base })}
        />
        <Segmented
          label={t('head.view')}
          name="compare-view"
          value={view}
          onChange={onViewChange}
          options={[
            { value: 'summary', label: t('head.summary') },
            { value: 'rm', label: t('head.rm') },
          ]}
        />
      </div>
      {view === 'summary' ? (
        <SummaryView
          projectId={projectId}
          points={points}
          baseId={baseId}
          targetId={versionId}
          progress={progress}
        />
      ) : (
        <RmView projectId={projectId} baseId={baseId} targetId={versionId} progress={progress} />
      )}
    </div>
  );
}
