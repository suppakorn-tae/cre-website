'use client';

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';

/** Same as `--motion-chart` (700 ms): a chart's entrance. The stylesheets read the token. */
export const CHART_MS = 700;
/** A change inside one view: 0.4 of the chart duration, which is also what the CSS uses. */
export const CHANGE_MS = 280;

const REDUCED = '(prefers-reduced-motion: reduce)';

/** An environment without `matchMedia` (a test DOM) is treated as "motion allowed". */
function reducedList(): MediaQueryList | null {
  return typeof window.matchMedia === 'function' ? window.matchMedia(REDUCED) : null;
}

function subscribeReduced(onChange: () => void) {
  const list = reducedList();
  list?.addEventListener('change', onChange);
  return () => list?.removeEventListener('change', onChange);
}

/** True when the system asks for no motion. The server render is "motion allowed". */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => reducedList()?.matches ?? false,
    () => false,
  );
}

export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** Runs `onFrame(eased 0..1)` over `ms`, ends on exactly 1. Returns a cancel function. */
function run(ms: number, onFrame: (eased: number) => void): () => void {
  let frame = 0;
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min((now - start) / ms, 1);
    onFrame(t === 1 ? 1 : easeOut(t));
    if (t < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(frame);
}

/** 0 to 1 over the chart duration with ease-out, once on mount. Stays at 1 when off. */
export function useSweep(on = true): number {
  const reduced = useReducedMotion();
  const active = on && !reduced;
  // Starts at 1 so the server markup and the no-script page show the real number; the first
  // animation frame, queued from a layout effect so it runs before paint, drops it to 0.
  const [progress, setProgress] = useState(1);
  useLayoutEffect(() => {
    if (!active) return;
    return run(CHART_MS, setProgress);
  }, [active]);
  return active ? progress : 1;
}

type Values = Record<string, number>;

type TweenOptions = {
  /** Where a value starts when it first appears: from 0 (grow in) or at once (default). */
  enter?: 'zero' | 'target';
  /** False draws the targets as they are. */
  enabled?: boolean;
};

/**
 * Numbers that glide to their targets, for a chart that draws from values (SVG bars, points,
 * donut slices). The first draw plays the entrance over the chart duration; a later change of
 * the targets moves what is on screen to the new values in `CHANGE_MS`, with no restart from
 * zero; the same targets again (a refetch) cause no motion. An item that is new in a later draw
 * enters (from 0 or at once, see `enter`); one that is gone is dropped from the result. A new
 * view mounts a new chart, so it gets a fresh entrance. Always the targets under reduced motion
 * and in the server render.
 */
export function useTween(target: Values, { enter = 'target', enabled = true }: TweenOptions = {}) {
  const reduced = useReducedMotion();
  const on = enabled && !reduced;
  const [shown, setShown] = useState<Values>(target);
  const shownRef = useRef<Values>(target);
  const entered = useRef(false);
  // The targets whose entrance was cut short, to tell a remount from a real change of data.
  const cutShort = useRef<string | null>(null);
  const sig = JSON.stringify(Object.entries(target).sort(([a], [b]) => (a < b ? -1 : 1)));

  useLayoutEffect(() => {
    const to = JSON.parse(sig) as [string, number][];
    const goal = Object.fromEntries(to);
    // A change of data during the entrance moves on from where the bars are; the same data again
    // (Strict Mode in development mounts twice) plays the entrance in full.
    const first = !entered.current && (cutShort.current === null || cutShort.current === sig);
    cutShort.current = null;
    entered.current = true;
    const put = (values: Values) => {
      shownRef.current = values;
      setShown(values);
    };
    if (!on) {
      put(goal);
      return;
    }
    const start: Values = {};
    let moves = false;
    for (const [key, value] of to) {
      const prev = shownRef.current[key];
      start[key] = first || prev === undefined ? (enter === 'zero' ? 0 : value) : prev;
      if (start[key] !== value) moves = true;
    }
    if (!moves) {
      put(goal);
      return;
    }
    put(start);
    let done = false;
    const stop = run(first ? CHART_MS : CHANGE_MS, (eased) => {
      done = eased === 1;
      put(
        Object.fromEntries(
          to.map(([key, value]) => [key, start[key] + (value - start[key]) * eased]),
        ),
      );
    });
    return () => {
      stop();
      if (first && !done) {
        entered.current = false;
        cutShort.current = sig;
      }
    };
  }, [sig, on, enter]);

  return Object.fromEntries(
    Object.entries(target).map(([key, value]) => [
      key,
      on ? (shown[key] ?? (enter === 'zero' ? 0 : value)) : value,
    ]),
  ) as Values;
}

export type Leaving<T> = { item: T; leaving: boolean };

/**
 * `items` with the ones that were just removed kept for `CHANGE_MS`, flagged `leaving`, at the
 * place they had; the caller fades them out (and hides them from assistive technology). Under
 * reduced motion, and on the first draw, nothing is kept.
 */
export function useLeaving<T>(items: T[], keyOf: (item: T) => string): Leaving<T>[] {
  const reduced = useReducedMotion();
  const previous = useRef<T[]>(items);
  const [ghosts, setGhosts] = useState<{ item: T; at: number; key: string }[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const keys = items.map(keyOf);
  const sig = keys.join('\u0000');

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = items;
    if (reduced) return; // nothing is kept; the render below ignores any leftovers
    const present = new Set(keys);
    // A key that comes back is no longer leaving: its pending removal must not run.
    for (const key of present) {
      clearTimeout(timers.current.get(key));
      timers.current.delete(key);
    }
    const gone = before
      .map((item, at) => ({ item, at, key: keyOf(item) }))
      .filter((g) => !present.has(g.key));
    setGhosts((now) => [
      ...now.filter((g) => !present.has(g.key)),
      ...gone.filter((g) => !now.some((n) => n.key === g.key)),
    ]);
    // One timer per key, so a key removed again gets a full fade and no old timer cuts it short.
    for (const { key } of gone) {
      clearTimeout(timers.current.get(key));
      timers.current.set(
        key,
        setTimeout(() => {
          timers.current.delete(key);
          setGhosts((now) => now.filter((g) => g.key !== key));
        }, CHANGE_MS),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, reduced]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending.values()) clearTimeout(id);
      pending.clear();
    };
  }, []);

  const present = new Set(keys);
  const out: Leaving<T>[] = items.map((item) => ({ item, leaving: false }));
  const left = reduced ? [] : ghosts.filter((g) => !present.has(g.key));
  for (const g of [...left].sort((a, b) => a.at - b.at)) {
    out.splice(Math.min(g.at, out.length), 0, { item: g.item, leaving: true });
  }
  return out;
}
