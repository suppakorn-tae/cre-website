import type { components } from '@/lib/api/generated/schema';

export type JobStatus = components['schemas']['JobStatus'];

/** The fields of a job that decide how it is polled. */
export type PollJob = {
  status: JobStatus;
  created_at: string;
  started_at: string | null;
};

/** Longest wait between two polls: reports are short, export files can take long. */
export const REPORT_CAP_MS = 10_000;
export const EXPORT_CAP_MS = 30_000;
/** A job still queued this long after it was created is not being picked up. */
export const QUEUED_STALL_MS = 2 * 60_000;
/** A job running this long gets a calm note; polling goes on regardless. */
export const LONG_RUNNING_MS = 10 * 60_000;

const FIRST_DELAY_MS = 1000;

/** Done, failed and expired jobs never change again, so polling stops. */
export function isFinished(status: JobStatus | undefined): boolean {
  return status === 'done' || status === 'failed' || status === 'expired';
}

/** Delay before poll number `polls` (0-based): 1 s, growing by half each time, up to `capMs`. */
export function backoffDelay(polls: number, capMs: number): number {
  return Math.min(capMs, Math.round(FIRST_DELAY_MS * 1.5 ** Math.max(0, polls)));
}

/**
 * Where a job stands, from its own fields.
 * - `finished`: done, failed or expired.
 * - `stalled`: queued for 2 minutes with no start; polling stops until the user asks again.
 * - `longRunning`: running for 10 minutes; polling goes on with no limit.
 * - `active`: anything else, still worth polling.
 * The 2 minutes count from the latest of `created_at` (server clock), `firstPollAt` (when this
 * tab first got an answer for the job, client clock) and `resumedAt` (the last "check again").
 * So a job stalls only when it was queued that long on both clocks, whatever their skew.
 */
export type JobPhase = 'finished' | 'stalled' | 'longRunning' | 'active';

export function jobPhase(
  job: PollJob | undefined,
  now: number,
  resumedAt = 0,
  firstPollAt = 0,
): JobPhase {
  if (!job) return 'active';
  if (isFinished(job.status)) return 'finished';
  const created = Date.parse(job.created_at);
  if (job.status === 'queued') {
    const since = Math.max(Number.isNaN(created) ? 0 : created, resumedAt, firstPollAt);
    return now - since >= QUEUED_STALL_MS ? 'stalled' : 'active';
  }
  const started = job.started_at === null ? created : Date.parse(job.started_at);
  return !Number.isNaN(started) && now - started >= LONG_RUNNING_MS ? 'longRunning' : 'active';
}

/**
 * `refetchInterval` for a job query: `false` when it has finished or is stalled in the queue,
 * otherwise the back-off delay. A running job is polled with no time limit.
 */
export function pollInterval(
  job: PollJob | undefined,
  polls: number,
  capMs: number,
  now: number,
  resumedAt = 0,
  firstPollAt = 0,
): number | false {
  const phase = jobPhase(job, now, resumedAt, firstPollAt);
  return phase === 'finished' || phase === 'stalled' ? false : backoffDelay(polls, capMs);
}
