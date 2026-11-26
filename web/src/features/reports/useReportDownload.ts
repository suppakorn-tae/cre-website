'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchProject, fetchVersions, projectKey, versionsKey } from '@/features/versions/api';
import { ApiError } from '@/lib/api/errors';

import { downloadUrl, fetchJob, jobKey, reportJobKey, requestReport } from './api';
import { pollInterval } from './polling';
import { reportFileName, reportState, triggerDownload, type ReportState } from './state';

export type ReportDownload = {
  state: ReportState;
  /** Job of the last request for this version; kept while moving between pages. */
  jobId: string | null;
  /** The file of the finished job, for a link; null until a job exists. */
  downloadUrl: string | null;
  /** The request was refused because reports were asked for too often. */
  tooMany: boolean;
  /** This component has seen the report being built, so a result is news worth announcing. */
  observed: boolean;
  /**
   * Asks for the report, polls the job and downloads the PDF once when it is
   * done. Does nothing while building; downloads again when it is ready.
   */
  start: () => void;
  /** Same as `start`: a failed report is asked for again. */
  retry: () => void;
  /** Saves the finished PDF again, e.g. when the browser blocked the first download. */
  download: () => Promise<void>;
};

/**
 * The report of one submitted version, built in place: request it (the server
 * returns the existing job for the same submission), poll the job with the
 * usual back-off, then click a hidden download link once. The page does not
 * change. The caller decides whether the version may have a report.
 */
export function useReportDownload(projectId: string, versionId: string): ReportDownload {
  const queryClient = useQueryClient();
  const storedKey = reportJobKey(projectId, versionId);
  // The job id lives in the query cache, so it outlives this component.
  const stored = useQuery<string | null>({
    queryKey: storedKey,
    queryFn: () => null,
    enabled: false,
    gcTime: Infinity,
  });
  const jobId = stored.data ?? null;

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
      queryClient.setQueryData(storedKey, id);
      // The same id can come back after a failure; read its status afresh.
      void queryClient.invalidateQueries({ queryKey: jobKey(id) });
    },
  });

  const state = reportState({
    requesting: request.isPending,
    requestFailed: request.isError,
    jobId,
    jobStatus: job.data?.status,
    pollFailed: job.isError,
  });
  const tooMany = request.error instanceof ApiError && request.error.status === 429;
  // Once this component has seen a build, its result is news (a toast, a spoken update);
  // a job that was finished before the page opened is not.
  const [observed, setObserved] = useState(false);
  if (state === 'building' && !observed) setObserved(true);

  const download = useCallback(async () => {
    if (jobId === null) return;
    // Both are usually cached already; a failure only costs the nice file name.
    const [project, versions] = await Promise.all([
      queryClient
        .ensureQueryData({
          queryKey: projectKey(projectId),
          queryFn: () => fetchProject(projectId),
        })
        .catch(() => undefined),
      queryClient
        .ensureQueryData({
          queryKey: versionsKey(projectId),
          queryFn: () => fetchVersions(projectId),
        })
        .catch(() => undefined),
    ]);
    const version = versions?.find((v) => v.id === versionId);
    triggerDownload(downloadUrl(jobId), reportFileName(project?.nickname, version?.version_no));
  }, [jobId, projectId, versionId, queryClient]);

  // True from a click (or from finding a job still being built) until the download.
  const awaiting = useRef(false);
  // True between a click and the first render that shows it, so two clicks in a row start one job.
  const starting = useRef(false);
  useEffect(() => {
    if (state !== 'idle') starting.current = false;
    if (state === 'building') {
      awaiting.current = true;
    } else if (state === 'ready' && awaiting.current) {
      awaiting.current = false;
      void download();
    } else if (state === 'failed') {
      awaiting.current = false;
    }
  }, [state, download]);

  const { mutate, reset } = request;
  const start = useCallback(() => {
    if (state === 'building' || starting.current) return;
    if (state === 'ready') {
      void download();
      return;
    }
    awaiting.current = true;
    starting.current = true;
    reset();
    if (jobId !== null) {
      queryClient.setQueryData(storedKey, null);
      queryClient.removeQueries({ queryKey: jobKey(jobId) });
    }
    mutate();
  }, [state, download, reset, mutate, jobId, queryClient, storedKey]);

  return {
    state,
    jobId,
    downloadUrl: jobId === null ? null : downloadUrl(jobId),
    tooMany,
    observed,
    start,
    retry: start,
    download,
  };
}
