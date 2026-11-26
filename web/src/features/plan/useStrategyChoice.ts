import { useCallback, useEffect, useRef, useState } from 'react';

import type { Strategy } from './api';

/** Quiet time after the last click before a choice is sent. */
export const STRATEGY_DELAY_MS = 400;

/**
 * Turns fast clicks on the strategy buttons of one card into one request.
 * A click shows at once (`shown`); the newest choice is sent when no further
 * click came within `delay`, so ten quick clicks send one request and end on
 * the last choice. While the request is in flight `busy` is true and the card
 * disables its buttons. If the request fails, `shown` falls back to the stored
 * `value` and `onError` is called. A choice still waiting when the card closes
 * is sent at once.
 */
export function useStrategyChoice(
  value: Strategy | undefined,
  send: (strategy: Strategy) => Promise<unknown>,
  onError: (error: unknown) => void,
  delay = STRATEGY_DELAY_MS,
) {
  const [pending, setPending] = useState<Strategy>();
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const waiting = useRef<Strategy>(undefined);
  const latest = useRef({ value, send, onError });
  useEffect(() => {
    latest.current = { value, send, onError };
  });

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const strategy = waiting.current;
    waiting.current = undefined;
    if (!strategy) return;
    if (strategy === latest.current.value) {
      setPending(undefined);
      return;
    }
    setBusy(true);
    try {
      await latest.current.send(strategy);
    } catch (e) {
      latest.current.onError(e);
    } finally {
      setBusy(false);
      setPending(undefined);
    }
  }, []);

  const choose = useCallback(
    (strategy: Strategy) => {
      if (busy) return;
      waiting.current = strategy;
      setPending(strategy);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [busy, delay, flush],
  );

  // Send a choice that is still waiting when the card unmounts.
  useEffect(
    () => () => {
      if (timer.current) void flush();
    },
    [flush],
  );

  return { shown: pending ?? value, busy, choose };
}
