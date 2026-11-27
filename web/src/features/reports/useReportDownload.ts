'use client';

import {
  skipToken,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchProject, fetchVersions, projectKey, versionsKey } from '@/features/versions/api';
import { ApiError } from '@/lib/api/errors';

import {
  downloadUrl,
  fetchJob,
  jobKey,
  jobWaitKey,
  reportJobKey,
  requestReport,
  resultsKey,
  versionKey,
  type Job,
} from './api';
import { jobPhase, pollInterval, REPORT_CAP_MS, type JobPhase } from './polling';
import {
  inputsChangedSince,
  reportFileName,
  reportState,
  triggerDownload,
  type ReportState,
} from './state';

const downloaded = new WeakMap<QueryClient, Set<string>>();

/** True for the first caller per job and client; the automatic download runs only then. */
function claimDownload(client: QueryClient, jobId: string): boolean {
  const ids = downloaded.get(client) ?? new Set<string>();
  downloaded.set(client, ids);
  if (ids.has(jobId)) return false;
  ids.add(jobId);
  return true;
}

/** The newest of some server times; null when none is known. */
function latest(times: readonly (string | null | undefined)[]): string | null {
  let best: string | null = null;
  for (const at of times) {
    if (at && (best === null || Date.parse(at) > Date.parse(best))) best = at;
  }
  return best;
}

type Submitted = { id?: string; submitted_at?: string | null };
type Results = { submitted_at?: string; items?: { strategy_updated_at?: string }[] };

/**
 * The latest change to what this version's PDF shows, as far as the cache knows: the last
 * submission (version, version list or results), the chosen strategies (results) and the
 * project fields. The pages that change them update or invalidate these entries (a submit, a
 * strategy save, a project edit), so this follows them without asking the server; nothing here
 * is fetched.
 */
function useInputTimes(projectId: string, versionId: string): (string | null | undefined)[] {
  const version = useQuery<Submitted, Error, string | null>({
    queryKey: versionKey(projectId, versionId),
    queryFn: skipToken,
    select: (v) => v.submitted_at ?? null,
  });
  const list = useQuery<Submitted[], Error, string | null>({
    queryKey: versionsKey(projectId),
    queryFn: skipToken,
    select: (vs) => vs.find((v) => v.id === versionId)?.submitted_at ?? null,
  });
  const results = useQuery<Results, Error, string | null>({
    queryKey: resultsKey(projectId, versionId),
    queryFn: skipToken,
    select: (r) => latest([r.submitted_at, ...(r.items ?? []).map((i) => i.strategy_updated_at)]),
  });
  const project = useQuery<{ updated_at?: string }, Error, string | null>({
    queryKey: projectKey(projectId),
    queryFn: skipToken,
    select: (p) => p.updated_at ?? null,
  });
  return [version.data, list.data, results.data, project.data];
}

/**
 * When this tab started waiting for a job: its first answer, and the last "check again".
 * Kept in the query cache, not in a component, so every view of the job (the report button,
 * step 5 of the step bar, a version menu) judges a stall from the same moments, and stops
 * polling together.
 */
type JobWait = { firstPollAt: number; resumedAt: number };
const NO_WAIT: JobWait = { firstPollAt: 0, resumedAt: 0 };

function readWait(client: QueryClient, jobId: string | null): JobWait {
  return jobId === null ? NO_WAIT : (client.getQueryData<JobWait>(jobWaitKey(jobId)) ?? NO_WAIT);
}

function updateWait(client: QueryClient, jobId: string, change: (wait: JobWait) => JobWait) {
  client.setQueryData<JobWait>(jobWaitKey(jobId), (wait) => change(wait ?? NO_WAIT));
}

export type ReportDownload = {
  state: ReportState;
  /** Job of the last request for this version; kept while moving between pages. */
  jobId: string | null;
  /** The file of the finished job, for a link; null until a job exists. */
  downloadUrl: string | null;
  /** The request was refused because reports were asked for too often. */
  tooMany: boolean;
  /** This component has seen a report being built, so a result is news worth announcing. */
  observed: boolean;
  /**
   * Asks for the report and downloads the PDF when it is done. Every click asks the server:
   * the same job (nothing changed) is saved at once, a new one is polled and saved once.
   * Does nothing while building.
   */
  start: () => void;
  /** The job has sat in the queue too long: polling has stopped until `start` is called. */
  stalled: boolean;
  /** The job has been running a long time; it is still polled, with no limit. */
  longRunning: boolean;
  /** Same as `start`: a failed report is asked for again. */
  retry: () => void;
  /** Saves the finished PDF again, e.g. when the browser blocked the first download. */
  download: () => Promise<void>;
};

/**
 * The report of one submitted version, built in place: request it (the server
 * returns its current job when nothing the PDF shows has changed), poll the job with the
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

  // When this tab first got an answer for the job (the queue wait is also measured on our
  // clock) and when the user last asked to check a stalled job again; shared by every view.
  const waitQuery = useQuery<JobWait>({
    queryKey: jobWaitKey(jobId ?? ''),
    queryFn: () => NO_WAIT,
    enabled: false,
    gcTime: Infinity,
  });
  const wait = jobId === null ? NO_WAIT : (waitQuery.data ?? NO_WAIT);
  const job = useQuery({
    queryKey: jobKey(jobId ?? ''),
    queryFn: async () => {
      const answer = await fetchJob(jobId ?? '');
      if (jobId !== null) {
        const at = Date.now();
        updateWait(queryClient, jobId, (w) => (w.firstPollAt ? w : { ...w, firstPollAt: at }));
      }
      return answer;
    },
    enabled: jobId !== null,
    // Backoff grows with each answer; polling stops once the job has finished, and
    // on an error too: the state is then "failed" and a retry starts it again.
    // The wait is read from the cache here, not from this render, so it is never stale.
    refetchInterval: (query) => {
      if (query.state.status === 'error') return false;
      const { resumedAt, firstPollAt } = readWait(queryClient, jobId);
      return pollInterval(
        query.state.data,
        query.state.dataUpdateCount,
        REPORT_CAP_MS,
        query.state.dataUpdatedAt,
        resumedAt,
        firstPollAt,
      );
    },
  });
  // Judged at the time of the last answer, which also makes this component render on each one.
  const phase: JobPhase = job.isError
    ? 'finished'
    : jobPhase(job.data, job.dataUpdatedAt, wait.resumedAt, wait.firstPollAt);
  // True from a click (or a build seen below) until the download.
  const awaiting = useRef(false);
  // True from a click until the server answers, so two clicks in a row start one request.
  const starting = useRef(false);

  const saveFile = useCallback(
    async (id: string) => {
      // Usually cached already; a failure only costs the nice file name.
      const project = await queryClient
        .ensureQueryData({
          queryKey: projectKey(projectId),
          queryFn: () => fetchProject(projectId),
        })
        .catch(() => undefined);
      // The results page holds this one version; any other page holds the list.
      const cached = queryClient.getQueryData<{ version_no: number }>(
        versionKey(projectId, versionId),
      );
      const versionNo =
        cached?.version_no ??
        (
          await queryClient
            .ensureQueryData({
              queryKey: versionsKey(projectId),
              queryFn: () => fetchVersions(projectId),
            })
            .catch(() => undefined)
        )?.find((v) => v.id === versionId)?.version_no;
      triggerDownload(downloadUrl(id), reportFileName(project?.nickname, versionNo));
    },
    [projectId, versionId, queryClient],
  );

  // Every click asks the server, which compares the last submission, the chosen strategies and
  // the project fields with its current job: the same id means that PDF is still current.
  const request = useMutation({
    mutationFn: () => requestReport(projectId, versionId),
    onSuccess: (id) => {
      queryClient.setQueryData(storedKey, id);
      if (queryClient.getQueryData<Job>(jobKey(id))?.status === 'done') {
        // A job we know is done (done never changes): save it for this click now, even when it
        // was saved before. The server only returns a live job, so it was not replaced since.
        awaiting.current = false;
        claimDownload(queryClient, id);
        void saveFile(id);
        return;
      }
      // Not known to be done: poll it and save it once it is, for this click too.
      downloaded.get(queryClient)?.delete(id);
      void queryClient.invalidateQueries({ queryKey: jobKey(id) });
    },
    onSettled: () => {
      starting.current = false;
    },
  });

  // A finished job made before the version last changed is not this version's report any more.
  const inputTimes = useInputTimes(projectId, versionId);
  const outdated = inputsChangedSince(job.data?.created_at, inputTimes);

  const state = reportState({
    requesting: request.isPending,
    requestFailed: request.isError,
    jobId,
    jobStatus: job.data?.status,
    pollFailed: job.isError,
    outdated,
  });
  const tooMany = request.error instanceof ApiError && request.error.status === 429;
  // A build this tab is waiting for: the request is on its way, or a fresh answer (not data left
  // in the cache from before) says the job is queued or running. Missing or old data never counts,
  // so a page that opens on a cached job does not download on its own.
  const building =
    request.isPending ||
    (job.isFetchedAfterMount && (job.data?.status === 'queued' || job.data?.status === 'running'));
  // Once this component has seen such a build, its result is news (a toast, a spoken update).
  const [observed, setObserved] = useState(false);
  if (building && !observed) setObserved(true);

  const download = useCallback(async () => {
    if (jobId !== null) await saveFile(jobId);
  }, [jobId, saveFile]);

  useEffect(() => {
    if (building) awaiting.current = true;
    if (state === 'ready' && awaiting.current) {
      awaiting.current = false;
      // Once per job in this client, even when two components wait for the same one.
      if (jobId !== null && claimDownload(queryClient, jobId)) void download();
    } else if (state === 'failed') {
      awaiting.current = false;
    }
  }, [state, building, download, jobId, queryClient]);

  const { mutate, reset } = request;
  const { refetch } = job;
  const start = useCallback(() => {
    if (phase === 'stalled' && jobId !== null) {
      const at = Date.now();
      updateWait(queryClient, jobId, (w) => ({ ...w, resumedAt: at }));
      void refetch();
      return;
    }
    if (state === 'building' || starting.current) return;
    // Ready or not, ask again: the answer says whether the cached job is still current.
    awaiting.current = true;
    starting.current = true;
    reset();
    mutate();
  }, [phase, refetch, state, reset, mutate, jobId, queryClient]);

  return {
    state,
    jobId,
    downloadUrl: jobId === null ? null : downloadUrl(jobId),
    tooMany,
    observed,
    stalled: phase === 'stalled',
    longRunning: phase === 'longRunning',
    start,
    retry: start,
    download,
  };
}
