import type { components } from '@/lib/api/generated/schema';

export type JobStatus = components['schemas']['JobStatus'];

const FIRST_DELAY_MS = 1000;
const MAX_DELAY_MS = 10_000;

/** Done, failed and expired jobs never change again, so polling stops. */
export function isFinished(status: JobStatus | undefined): boolean {
  return status === 'done' || status === 'failed' || status === 'expired';
}

/** Delay before poll number `polls` (0-based): 1 s, growing by half each time, capped at 10 s. */
export function backoffDelay(polls: number): number {
  return Math.min(MAX_DELAY_MS, Math.round(FIRST_DELAY_MS * 1.5 ** Math.max(0, polls)));
}

/** `refetchInterval` for the job query: `false` once the job has finished. */
export function pollInterval(status: JobStatus | undefined, polls: number): number | false {
  return isFinished(status) ? false : backoffDelay(polls);
}
