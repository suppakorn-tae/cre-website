/**
 * The three assessment dimensions and their colours (hi-fi 00 Foundations).
 * Colours are token variables from styles/tokens.css, never literals. The
 * dimension code is always printed next to the colour, so colour is never the
 * only cue.
 */
export const DIMENSIONS = ['EC', 'SO', 'EV'] as const;

export type DimensionCode = (typeof DIMENSIONS)[number];

export function isDimensionCode(value: string): value is DimensionCode {
  return (DIMENSIONS as readonly string[]).includes(value);
}

/**
 * The dimension of a factor code (`EC-MG` is `EC`, `EC-HS-2` is `EC`). A bare
 * dimension code maps to itself. Anything else, including lower case, is
 * `undefined`.
 */
export function dimensionOf(code: string): DimensionCode | undefined {
  const prefix = code.split('-', 1)[0] ?? '';
  return isDimensionCode(prefix) ? prefix : undefined;
}

/** CSS variable references for a dimension: the solid and its 10% tint. */
export function dimensionStyle(dimension: DimensionCode): { color: string; tint: string } {
  const key = dimension.toLowerCase();
  return { color: `var(--dim-${key})`, tint: `var(--dim-${key}-tint)` };
}
