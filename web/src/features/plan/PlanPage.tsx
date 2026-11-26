'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { IconShieldCheck } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Alert, Button, EmptyState, Icon, Skeleton } from '@/components/ui';
import { ReportButton } from '@/features/reports/ReportButton';
import { useIndicatorNames, useResults, useVersion } from '@/features/results/overview/api';
import { ProjectSteps } from '@/features/shell/ProjectSteps';
import { fetchProject, projectKey } from '@/features/versions/api';
import { projectPaths } from '@/features/versions/rules';
import { ApiError } from '@/lib/api/errors';

import { useSetStrategy } from './api';
import { PlanItem } from './PlanItem';
import { chosenCount, highRisks, PLAN_VISIBLE } from './rules';

/** The report button is the primary action; a failed build turns it to a tint so the red text stays legible. */
const REPORT_BUTTON =
  'focus-ring min-h-10 rounded-control border border-primary bg-primary px-4 text-body font-medium text-white no-underline hover:bg-primary-hover data-[report=failed]:bg-error-bg';
const LINK = 'text-blue-700 no-underline hover:underline';

/**
 * Risk plan of one version (step 4, UC-10): every H / VH indicator as an
 * accordion item with its advice lists and a strategy choice. Strategies can
 * change only while the version is the latest.
 */
export function PlanPage({ projectId, versionId }: { projectId: string; versionId: string }) {
  const t = useTranslations('plan');
  const [showAll, setShowAll] = useState(false);
  const project = useQuery({
    queryKey: projectKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const version = useVersion(projectId, versionId);
  const submitted = version.data?.status === 'submitted';
  const results = useResults(projectId, versionId, submitted);
  const names = useIndicatorNames();
  const setStrategy = useSetStrategy(projectId, versionId);

  if (version.isError) {
    const missing = version.error instanceof ApiError && version.error.status === 404;
    return (
      <EmptyState
        title={missing ? t('page.notFound') : t('page.loadFailed')}
        action={
          missing ? (
            <Link className={LINK} href={`/projects/${projectId}`}>
              {t('page.backToProject')}
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => void version.refetch()}>
              {t('page.retry')}
            </Button>
          )
        }
      />
    );
  }
  if (version.data && !submitted) {
    return (
      <EmptyState
        title={t('draft.title')}
        description={t('draft.text')}
        action={
          <Link className={LINK} href={projectPaths.assessment(projectId, versionId)}>
            {t('draft.action')}
          </Link>
        }
      />
    );
  }
  if (results.isError || names.isError) {
    return (
      <EmptyState
        title={t('page.loadFailed')}
        action={
          <Button
            variant="secondary"
            onClick={() => void (results.isError ? results.refetch() : names.refetch())}
          >
            {t('page.retry')}
          </Button>
        }
      />
    );
  }
  if (!version.data || !results.data || !names.data) {
    return (
      <div role="status" aria-label={t('page.loading')} className="flex flex-col gap-4">
        <Skeleton height="2rem" width="50%" />
        <Skeleton height="4rem" />
        <Skeleton height="12rem" />
      </div>
    );
  }

  const rows = highRisks(results.data.items);
  const { VH, H } = results.data.summary.level_counts;
  const editable = results.data.editable;
  const visible = showAll ? rows : rows.slice(0, PLAN_VISIBLE);
  const hidden = rows.length - PLAN_VISIBLE;

  return (
    <div className="flex flex-col gap-4">
      <ProjectSteps current="strategy" />
      <header className="flex flex-col gap-2">
        <nav aria-label={t('page.breadcrumbLabel')} className="text-small text-text-muted">
          <Link className={LINK} href="/dashboard">
            {t('page.breadcrumbRoot')}
          </Link>
          <span aria-hidden="true"> / </span>
          <Link className={LINK} href={`/projects/${projectId}`}>
            {project.data?.nickname ?? '…'}
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page" className="font-semibold text-navy-900">
            {t('page.crumb', { no: version.data.version_no })}
          </span>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="m-0 text-h1 font-bold text-navy-900">
            {t('page.title', { no: version.data.version_no })}
          </h1>
          <ReportButton
            projectId={projectId}
            versionId={versionId}
            submitted
            toast
            className={REPORT_BUTTON}
          />
        </div>
        <p className="m-0 text-small text-text-secondary">
          {t('page.summary', { count: rows.length, vh: VH, h: H, chosen: chosenCount(rows) })}
        </p>
      </header>

      {!editable && rows.length > 0 && (
        <Alert tone="warning" title={t('readOnly.title')}>
          {t('readOnly.text')}
        </Alert>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Icon icon={IconShieldCheck} size={24} />}
          title={t('empty.title')}
          description={t('empty.text')}
          action={
            <Link className={LINK} href={`/projects/${projectId}/versions/${versionId}/results`}>
              {t('empty.action')}
            </Link>
          }
        />
      ) : (
        <>
          <Accordion.Root
            type="multiple"
            defaultValue={[rows[0].indicator_code]}
            aria-label={t('page.listLabel')}
            className="flex flex-col gap-3"
          >
            {visible.map((row) => (
              <PlanItem
                key={row.indicator_code}
                row={row}
                meta={names.data.get(row.indicator_code)}
                editable={editable}
                onStrategy={(code, strategy) => setStrategy.save(code, strategy)}
              />
            ))}
          </Accordion.Root>
          {hidden > 0 && (
            <button
              type="button"
              aria-expanded={showAll}
              onClick={() => setShowAll((v) => !v)}
              className="focus-ring cursor-pointer self-center border-0 bg-transparent px-3 py-2 font-sans text-body font-semibold text-blue-700"
            >
              {showAll
                ? t('page.lessItems', { count: PLAN_VISIBLE })
                : t('page.moreItems', { count: hidden })}
            </button>
          )}
        </>
      )}
    </div>
  );
}
