// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHANGE_MS, CHART_MS, useSweep, useTween } from './chartMotion';

function stubMotion(reduced: boolean) {
  vi.stubGlobal('matchMedia', () => ({
    matches: reduced,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  stubMotion(false);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// A frame is 16 ms, so leave one spare to be sure the last one has run.
const advance = (ms: number) => act(() => void vi.advanceTimersByTime(ms + 20));

describe('useTween', () => {
  it('plays the entrance from zero over the chart duration, then rests on the targets', () => {
    const { result } = renderHook(() => useTween({ a: 10 }, { enter: 'zero' }));
    expect(result.current.a).toBe(0);
    advance(CHART_MS / 2);
    expect(result.current.a).toBeGreaterThan(0);
    expect(result.current.a).toBeLessThan(10);
    advance(CHART_MS);
    expect(result.current.a).toBe(10);
  });

  it('moves from the value on screen to the new one in the change time, not from zero', () => {
    const { result, rerender } = renderHook(({ v }) => useTween({ a: v }), {
      initialProps: { v: 10 },
    });
    expect(result.current.a).toBe(10);
    rerender({ v: 20 });
    expect(result.current.a).toBe(10);
    advance(CHANGE_MS / 2);
    expect(result.current.a).toBeGreaterThan(10);
    expect(result.current.a).toBeLessThan(20);
    advance(CHANGE_MS);
    expect(result.current.a).toBe(20);
  });

  it('retargets from the current value when a change comes mid-flight', () => {
    const { result, rerender } = renderHook(({ v }) => useTween({ a: v }), {
      initialProps: { v: 0 },
    });
    rerender({ v: 100 });
    advance(CHANGE_MS / 2);
    const mid = result.current.a;
    rerender({ v: 0 });
    expect(result.current.a).toBeCloseTo(mid, 5);
    advance(CHANGE_MS * 2);
    expect(result.current.a).toBe(0);
  });

  it('does not move when the same values come again (a refetch)', () => {
    const { result, rerender } = renderHook(({ v }) => useTween({ a: v }), {
      initialProps: { v: 10 },
    });
    rerender({ v: 10 });
    expect(result.current.a).toBe(10);
    advance(CHANGE_MS);
    expect(result.current.a).toBe(10);
  });

  it('lets a new item enter from zero and drops one that is gone', () => {
    const { result, rerender } = renderHook(
      ({ t }: { t: Record<string, number> }) => useTween(t, { enter: 'zero' }),
      { initialProps: { t: { a: 10 } as Record<string, number> } },
    );
    advance(CHART_MS);
    rerender({ t: { a: 10, b: 8 } });
    expect(result.current.b).toBe(0);
    advance(CHANGE_MS);
    expect(result.current).toEqual({ a: 10, b: 8 });
    rerender({ t: { b: 8 } });
    expect(result.current).toEqual({ b: 8 });
  });

  it('shows the targets at once under reduced motion', () => {
    stubMotion(true);
    const { result, rerender } = renderHook(({ v }) => useTween({ a: v }, { enter: 'zero' }), {
      initialProps: { v: 10 },
    });
    expect(result.current.a).toBe(10);
    rerender({ v: 20 });
    expect(result.current.a).toBe(20);
  });

  it('shows the targets at once when disabled', () => {
    const { result } = renderHook(() => useTween({ a: 10 }, { enter: 'zero', enabled: false }));
    expect(result.current.a).toBe(10);
  });
});

describe('useSweep', () => {
  it('runs 0 to 1 once, and stays at 1 under reduced motion', () => {
    const { result } = renderHook(() => useSweep());
    advance(0);
    expect(result.current).toBeLessThan(0.1);
    advance(CHART_MS);
    expect(result.current).toBe(1);
    cleanup();
    stubMotion(true);
    expect(renderHook(() => useSweep()).result.current).toBe(1);
  });
});

describe('stylesheets', () => {
  const css = (file: string) => readFileSync(path.resolve(__dirname, '../..', file), 'utf8');

  // Every transition and animation added for a change sits in a no-preference block, so reduced
  // motion shows the new values at once.
  it.each([
    ['features/dashboard/dashboard.module.css', 'transition-property: width'],
    ['features/results/overview/results.module.css', 'height calc(var(--motion-chart'],
    ['features/compare/compare.module.css', 'transition: flex-grow'],
  ])('%s moves bars only when motion is allowed', (file, rule) => {
    const text = css(file);
    const at = text.indexOf(rule);
    expect(at).toBeGreaterThan(-1);
    const open = text.lastIndexOf('@media', at);
    expect(text.slice(open, at)).toContain('prefers-reduced-motion: no-preference');
  });
});
