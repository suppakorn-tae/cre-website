'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { createCountdown, type Countdown } from './countdown';

/** Seconds left until a resend is allowed; `start(n)` begins a new wait. */
export function useCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const countdown = useRef<Countdown | null>(null);

  useEffect(() => {
    const instance = createCountdown(setSecondsLeft);
    countdown.current = instance;
    return () => {
      instance.stop();
      countdown.current = null;
    };
  }, []);

  const start = useCallback((seconds: number) => countdown.current?.start(seconds), []);
  return { secondsLeft, start };
}
