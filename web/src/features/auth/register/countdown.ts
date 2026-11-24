export const RESEND_SECONDS = 60;

export type Countdown = {
  /** Counts down from `seconds`, calling `onTick` with the whole seconds left. */
  start: (seconds: number) => void;
  stop: () => void;
};

/**
 * Wall-clock countdown. It reads the deadline from `Date.now()` on every
 * tick, so a throttled background tab catches up instead of drifting.
 */
export function createCountdown(onTick: (secondsLeft: number) => void): Countdown {
  let timer: ReturnType<typeof setInterval> | undefined;

  const stop = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  };

  const start = (seconds: number) => {
    stop();
    const deadline = Date.now() + seconds * 1000;
    onTick(Math.max(0, seconds));
    if (seconds <= 0) return;
    timer = setInterval(() => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      onTick(left);
      if (left === 0) stop();
    }, 250);
  };

  return { start, stop };
}
