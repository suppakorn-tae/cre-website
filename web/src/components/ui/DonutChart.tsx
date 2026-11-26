import type { ReactNode } from 'react';

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
};

/**
 * Generic donut. It draws the ring only: colour never carries the meaning alone, so the
 * caller prints each segment's name and value as text (the legend).
 */
export function DonutChart({ segments, label, centre, caption, describedBy }: Props) {
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
        {donutArcs(segments).map((arc) => (
          <circle
            key={arc.key}
            cx="20"
            cy="20"
            r={RADIUS}
            fill="none"
            stroke={arc.color}
            strokeWidth={STROKE}
            strokeDasharray={`${arc.length} ${100 - arc.length}`}
            strokeDashoffset={25 - arc.offset}
          />
        ))}
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <span className="text-kpi font-semibold leading-none text-navy-900">{centre}</span>
        {caption !== undefined && (
          <span className="mt-1 text-caption text-text-secondary">{caption}</span>
        )}
      </span>
    </div>
  );
}
