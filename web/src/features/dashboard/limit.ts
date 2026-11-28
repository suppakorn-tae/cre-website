/** How many of a limited thing the user has, and whether the next one would be refused. */
export type LimitState = {
  count: number;
  max: number;
  /** At or above the limit. Above it can happen when the limit was lowered after the fact. */
  atLimit: boolean;
};

export function limitState(count: number, max: number): LimitState {
  return { count, max, atLimit: count >= max };
}
