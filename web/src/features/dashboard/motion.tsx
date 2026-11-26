'use client';

import { useLayoutEffect, useState, useSyncExternalStore } from 'react';

import { formatNumber } from '@/lib/format/locale';

/** Same as `--motion-chart`; the stylesheet reads the token with this as its fallback. */
const DURATION_MS = 700;
const REDUCED = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const list = window.matchMedia(REDUCED);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

/** True when the system asks for no motion. The server render is "motion allowed". */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/** 0 to 1 over the chart duration with ease-out, once on mount. Always 1 under reduced motion. */
export function useSweep(): number {
  const reduced = useReducedMotion();
  // Starts at 1 so the server markup and the no-script page show the real number; the first
  // animation frame, queued from a layout effect so it runs before paint, drops it to 0.
  const [progress, setProgress] = useState(1);
  useLayoutEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION_MS, 1);
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced]);
  return reduced ? 1 : progress;
}

/** A whole number that counts up from 0 on mount. The final text is the stored value. */
export function CountUp({ value }: { value: number }) {
  const progress = useSweep();
  return <>{formatNumber(Math.round(value * progress))}</>;
}
