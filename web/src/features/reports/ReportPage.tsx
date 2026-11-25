'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, EmptyState, Skeleton, Toast } from '@/components/ui';
import { ProjectSteps } from '@/features/shell/ProjectSteps';
import { ApiError } from '@/lib/api/errors';

import {
  downloadUrl,
  fetchJob,
  fetchReportContext,
  jobKey,
  reportContextKey,
  requestReport,
} from './api';
import { pollInterval } from './polling';
import { ReportStatus } from './ReportStatus';
import styles from './reports.module.css';

type Props = { projectId: string; versionId: string };

/** Report page of one version: request, poll the job, download (UC-11 to UC-13). */
export function ReportPage({ projectId, versionId }: Props) {
  const t = useTranslations('reports');
  const queryClient = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(null);
  const context = useQuery({
    queryKey: reportContextKey(projectId),
    queryFn: () => fetchReportContext(projectId),
  });
  const job = useQuery({
    queryKey: jobKey(jobId ?? ''),
    queryFn: () => fetchJob(jobId ?? ''),
    enabled: jobId !== null,
    // Backoff grows with each answer; polling stops once the job has finished.
    refetchInterval: (query) => pollInterval(query.state.data?.status, query.state.dataUpdateCount),
  });
  const request = useMutation({
    mutationFn: () => requestReport(projectId, versionId),
    onSuccess: (id) => {
      setJobId(id);
      // Re-requesting may return the same job id; read its status afresh.
      void queryClient.invalidateQueries({ queryKey: jobKey(id) });
    },
  });

  if (context.isError) {
    const missing = context.error instanceof ApiError && context.error.status === 404;
    return (
      <EmptyState
        title={missing ? t('notFound') : t('loadFailed')}
        action={
          missing ? (
            <Link className={styles.link} href="/dashboard">
              {t('breadcrumbRoot')}
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => void context.refetch()}>
              {t('retry')}
            </Button>
          )
        }
      />
    );
  }
  if (!context.data) {
    return (
      <div aria-busy="true" className={styles.page}>
        <Skeleton width="50%" height="2rem" />
        <Skeleton height="8rem" />
      </div>
    );
  }

  const { project, versions } = context.data;
  const version = versions.find((v) => v.id === versionId);
  if (!version) return <EmptyState title={t('notFound')} />;

  const tooMany = request.error instanceof ApiError && request.error.status === 429;
  const status = job.data?.status ?? (jobId ? 'queued' : undefined);

  return (
    <div className={styles.page}>
      <ProjectSteps current="report" />
      <header className={styles.header}>
        <nav aria-label={t('breadcrumbLabel')} className={styles.crumbs}>
          <Link href="/dashboard">{t('breadcrumbRoot')}</Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/projects/${projectId}`}>
            {project.nickname} {project.name}
          </Link>
        </nav>
        <h1 className={styles.title}>
          {t('title', { nickname: project.nickname, no: version.version_no })}
        </h1>
        <p className={styles.intro}>{t('intro', { no: version.version_no })}</p>
      </header>

      {version.status !== 'submitted' ? (
        <EmptyState
          title={t('notSubmitted')}
          action={
            <Link className={styles.link} href={`/projects/${projectId}`}>
              {t('backToProject')}
            </Link>
          }
        />
      ) : (
        <>
          {request.isError && (
            <Toast tone="error" title={tooMany ? t('tooMany') : t('requestFailed')} />
          )}
          {job.isError && <Toast tone="error" title={t('pollFailed')} />}
          {status ? (
            <ReportStatus
              status={status}
              downloadHref={downloadUrl(jobId ?? '')}
              onRetry={() => request.mutate()}
              retrying={request.isPending}
            />
          ) : (
            <Button onClick={() => request.mutate()} disabled={request.isPending || jobId !== null}>
              {request.isPending ? t('requesting') : t('request')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
