import type { CSSProperties } from 'react';

import type { Strategy } from './api';

/**
 * The colour of each strategy, as names of tokens from styles/tokens.css:
 * a solid (idle text and border, chosen fill) and a tint (idle fill).
 * The strategy code is always printed next to the colour, so colour is never
 * the only cue. There are no dedicated strategy tokens yet, so the hues come
 * from the nearest ones: AVOID reuses the violet of the EC dimension.
 */
export const STRATEGY_COLOURS: Record<Strategy, { solid: string; tint: string }> = {
  REDUCE: { solid: 'color-blue-700', tint: 'color-blue-50' },
  AVOID: { solid: 'dim-ec', tint: 'dim-ec-tint' },
  TRANSFER: { solid: 'color-warning', tint: 'color-warning-bg' },
  ACCEPT: { solid: 'color-text-secondary', tint: 'color-subtle' },
};

/** Sets `--strategy-solid` and `--strategy-tint` for the element and its children. */
export function strategyStyle(strategy: Strategy): CSSProperties {
  const { solid, tint } = STRATEGY_COLOURS[strategy];
  return {
    '--strategy-solid': `var(--${solid})`,
    '--strategy-tint': `var(--${tint})`,
  } as CSSProperties;
}
