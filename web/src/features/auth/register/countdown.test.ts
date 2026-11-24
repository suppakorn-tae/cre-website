import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCountdown, RESEND_SECONDS } from './countdown';

describe('createCountdown (OTP resend)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('allows a resend once per 60 s', () => {
    expect(RESEND_SECONDS).toBe(60);
  });

  it('reports 60 at once, then counts down to 0 and stops', () => {
    const ticks: number[] = [];
    const countdown = createCountdown((n) => ticks.push(n));
    countdown.start(60);
    expect(ticks).toEqual([60]);

    vi.advanceTimersByTime(1000);
    expect(ticks.at(-1)).toBe(59);

    vi.advanceTimersByTime(29_000);
    expect(ticks.at(-1)).toBe(30);

    vi.advanceTimersByTime(30_000);
    expect(ticks.at(-1)).toBe(0);

    const count = ticks.length;
    vi.advanceTimersByTime(10_000);
    expect(ticks).toHaveLength(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never goes below 0', () => {
    const ticks: number[] = [];
    createCountdown((n) => ticks.push(n)).start(2);
    vi.advanceTimersByTime(5000);
    expect(Math.min(...ticks)).toBe(0);
  });

  it('catches up after a long pause instead of drifting', () => {
    const ticks: number[] = [];
    createCountdown((n) => ticks.push(n)).start(60);
    vi.setSystemTime(Date.now() + 45_000);
    vi.advanceTimersByTime(250);
    expect(ticks.at(-1)).toBe(15);
  });

  it('restarts from the new value and keeps a single timer', () => {
    const ticks: number[] = [];
    const countdown = createCountdown((n) => ticks.push(n));
    countdown.start(60);
    vi.advanceTimersByTime(20_000);
    countdown.start(60);
    expect(ticks.at(-1)).toBe(60);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('stop cancels the timer', () => {
    const countdown = createCountdown(() => {});
    countdown.start(60);
    countdown.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});
