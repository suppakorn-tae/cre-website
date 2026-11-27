import { describe, expect, it } from 'vitest';

import {
  EXPORT_CAP_MS,
  LONG_RUNNING_MS,
  QUEUED_STALL_MS,
  REPORT_CAP_MS,
  backoffDelay,
  isFinished,
  jobPhase,
  pollInterval,
  type JobStatus,
  type PollJob,
} from './polling';

const T0 = Date.parse('2026-11-27T10:00:00Z');
const MIN = 60_000;

const job = (status: JobStatus, startedAfter: number | null = null): PollJob => ({
  status,
  created_at: new Date(T0).toISOString(),
  started_at: startedAfter === null ? null : new Date(T0 + startedAfter).toISOString(),
});

describe('backoff', () => {
  it('grows by half each time up to the cap', () => {
    expect([0, 1, 2, 3].map((n) => backoffDelay(n, REPORT_CAP_MS))).toEqual([
      1000, 1500, 2250, 3375,
    ]);
    expect(backoffDelay(20, REPORT_CAP_MS)).toBe(10_000);
    expect(backoffDelay(20, EXPORT_CAP_MS)).toBe(30_000);
  });
});

describe('poll decision', () => {
  it('polls a queued job until 2 minutes after it was created, then stops', () => {
    expect(pollInterval(job('queued'), 3, REPORT_CAP_MS, T0 + 119_000)).toBe(3375);
    expect(pollInterval(job('queued'), 3, REPORT_CAP_MS, T0 + QUEUED_STALL_MS)).toBe(false);
    expect(jobPhase(job('queued'), T0 + 5 * MIN)).toBe('stalled');
  });

  it('counts the 2 minutes again from a check-again click', () => {
    const resumed = T0 + 5 * MIN;
    expect(pollInterval(job('queued'), 0, REPORT_CAP_MS, resumed + MIN, resumed)).toBe(1000);
    expect(pollInterval(job('queued'), 0, REPORT_CAP_MS, resumed + 2 * MIN, resumed)).toBe(false);
  });

  it('does not stall a fresh job when the client clock is 5 minutes ahead of the server', () => {
    const skewed = { ...job('queued'), created_at: new Date(T0 - 5 * MIN).toISOString() };
    const firstPollAt = T0; // the client's own clock, when it first saw the job
    expect(jobPhase(skewed, T0 + 1000, 0, firstPollAt)).toBe('active');
    expect(pollInterval(skewed, 0, REPORT_CAP_MS, T0 + 119_000, 0, firstPollAt)).toBe(1000);
    expect(jobPhase(skewed, T0 + QUEUED_STALL_MS, 0, firstPollAt)).toBe('stalled');
  });

  it.each([2 * MIN, 10 * MIN, 60 * MIN])('keeps polling a running job at %i ms', (age) => {
    const running = job('running', 1000);
    expect(pollInterval(running, 50, REPORT_CAP_MS, T0 + age)).toBe(10_000);
    expect(pollInterval(running, 50, EXPORT_CAP_MS, T0 + age)).toBe(30_000);
  });

  it('flags a note after 10 minutes of running, without stopping', () => {
    expect(jobPhase(job('running', 0), T0 + LONG_RUNNING_MS - 1)).toBe('active');
    expect(jobPhase(job('running', 0), T0 + LONG_RUNNING_MS)).toBe('longRunning');
  });

  it('stops on done, failed and expired', () => {
    for (const s of ['done', 'failed', 'expired'] as const) {
      expect(isFinished(s)).toBe(true);
      expect(pollInterval(job(s), 3, REPORT_CAP_MS, T0 + 99 * MIN)).toBe(false);
    }
  });

  it('polls before the first answer', () => {
    expect(pollInterval(undefined, 0, REPORT_CAP_MS, T0)).toBe(1000);
  });
});
