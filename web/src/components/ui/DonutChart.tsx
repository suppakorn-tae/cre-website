'use client';

import { useId, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

import { formatNumber } from '@/lib/format/locale';

import styles from './display.module.css';

export type DonutSegment = {
  key: string;
  value: number;
  /** Any CSS colour, normally a token such as `var(--level-h)`. */
  color: string;
};

export type DonutArc = DonutSegment & { length: number; offset: number };

/** The ring has a circumference of 100, so a segment's length is its share in percent. */
const RADIUS = 15.9155;
const STROKE = 6;
/** Gap between neighbouring segments: about 2 degrees of the ring (100 = 360 degrees). */
export const GAP = (2 / 360) * 100;
/** Same as `--motion-chart` (IO-192); the CSS reads the token and falls back to this. */
const DURATION_MS = 700;

/** Arcs on the ring, one per non-empty segment, in the order given. Empty when the total is 0. */
export function donutArcs(segments: DonutSegment[]): DonutArc[] {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total === 0) return [];
  let offset = 0;
  const arcs: DonutArc[] = [];
  for (const s of segments) {
    if (s.value <= 0) continue;
    const length = (s.value / total) * 100;
    arcs.push({ ...s, length, offset });
    offset += length;
  }
  return arcs;
}

/**
 * The dash that is drawn for an arc: the arc less a gap, centred on its slot, so neighbours
 * are GAP apart. A lone segment is a full ring and keeps no gap. Never shorter than a sliver.
 */
export function drawnArc(arc: DonutArc, count: number): { length: number; offset: number } {
  if (count < 2) return { length: arc.length, offset: arc.offset };
  const length = Math.max(arc.length - GAP, 0.01);
  return { length, offset: arc.offset + (arc.length - length) / 2 };
}

/** Motion runs only when asked for and not switched off in the system settings. */
export function shouldAnimate(animate: boolean, reducedMotion: boolean): boolean {
  return animate && !reducedMotion;
}

/** Whole number shown in the hole, or null when the centre is not a plain count. */
export function centreCount(centre: ReactNode): number | null {
  if (typeof centre === 'number') return Number.isInteger(centre) ? centre : null;
  if (typeof centre === 'string' && /^\d{1,3}(,\d{3})*$|^\d+$/.test(centre)) {
    return Number(centre.replace(/,/g, ''));
  }
  return null;
}

const REDUCED = '(prefers-reduced-motion: reduce)';

function subscribeReduced(onChange: () => void) {
  const list = window.matchMedia(REDUCED);
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
}

/** 0 to 1 over the chart duration with ease-out, once on mount. Stays at 1 when off. */
function useSweep(on: boolean): number {
  // Starts at 1 so the server markup and the no-script page show the real number; the first
  // animation frame, queued from a layout effect so it runs before paint, drops it to 0.
  const [progress, setProgress] = useState(1);
  useLayoutEffect(() => {
    if (!on) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / DURATION_MS, 1);
      setProgress(1 - (1 - t) ** 3);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [on]);
  return on ? progress : 1;
}

type Props = {
  segments: DonutSegment[];
  /** Text alternative of the ring. The numbers should also be in text next to it (a legend). */
  label: string;
  /** Big text in the hole, e.g. the total. */
  centre: ReactNode;
  /** Small text under it, e.g. the unit. */
  caption?: ReactNode;
  /** Id of an element that describes the chart, such as its legend. */
  describedBy?: string;
  /** Sweep the ring in and count the centre up on mount. No motion under reduced motion. */
  animate?: boolean;
};

/**
 * Generic donut. It draws the ring only: colour never carries the meaning alone, so the
 * caller prints each segment's name and value as text (the legend).
 */
export function DonutChart({
  segments,
  label,
  centre,
  caption,
  describedBy,
  animate = true,
}: Props) {
  const maskId = useId();
  const moving = shouldAnimate(animate, useReducedMotion());
  const progress = useSweep(moving);
  const count = centreCount(centre);
  const shownCentre =
    moving && count !== null ? formatNumber(Math.round(count * progress)) : centre;
  const arcs = donutArcs(segments);
  return (
    <div
      className="relative mx-auto w-full shrink-0"
      style={{ maxWidth: '11rem', aspectRatio: '1 / 1' }}
    >
      <svg
        viewBox="0 0 40 40"
        role="img"
        aria-label={label}
        aria-describedby={describedBy}
        className="block h-full w-full"
      >
        <circle
          cx="20"
          cy="20"
          r={RADIUS}
          fill="none"
          stroke="var(--color-subtle)"
          strokeWidth={STROKE}
        />
        <mask id={maskId}>
          <circle
            cx="20"
            cy="20"
            r={RADIUS}
            fill="none"
            stroke="white"
            strokeWidth={STROKE + 2}
            strokeDasharray="100 100"
            transform="rotate(-90 20 20)"
            className={moving ? styles.donutSweep : undefined}
          />
        </mask>
        <g mask={`url(#${maskId})`}>
          {arcs.map((arc) => {
            const d = drawnArc(arc, arcs.length);
            return (
              <circle
                key={arc.key}
                cx="20"
                cy="20"
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeDasharray={`${d.length} ${100 - d.length}`}
                strokeDashoffset={25 - d.offset}
              />
            );
          })}
        </g>
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <span className="text-kpi font-semibold leading-none text-navy-900">{shownCentre}</span>
        {caption !== undefined && (
          <span className="mt-1 text-caption text-text-secondary">{caption}</span>
        )}
      </span>
    </div>
  );
}
