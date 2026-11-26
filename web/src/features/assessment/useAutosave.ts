import { useCallback, useEffect, useRef, useState } from 'react';

import type { AnswerInput } from './api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Saves answers as soon as they are queued (the fields queue on blur or Enter, never per
 * keystroke). Answers queued in the same tick leave in one batch. Only one request is in
 * flight at a time: what is queued meanwhile is sent, latest value per indicator, right
 * after it returns. Failed items stay queued for the next change or `flush`, and whatever
 * is queued is saved when the page unmounts. `rejected` names the indicators the server
 * refused for good (422); they are not queued again, so one bad answer cannot block the
 * rest. `flush` resolves to true when everything queued was saved; `savedAt` is the time of
 * the last successful save.
 */
export function useAutosave(
  save: (items: AnswerInput[]) => Promise<void>,
  delay = 0,
  rejected?: (error: unknown, items: AnswerInput[]) => ReadonlySet<string>,
) {
  const pending = useRef(new Map<string, AnswerInput>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const saveRef = useRef(save);
  const rejectedRef = useRef(rejected);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    saveRef.current = save;
    rejectedRef.current = rejected;
  });

  const send = useCallback(async (): Promise<boolean> => {
    const items = [...pending.current.values()];
    if (items.length === 0) return true;
    pending.current.clear();
    setStatus('saving');
    try {
      await saveRef.current(items);
      if (pending.current.size === 0) setStatus('saved');
      setSavedAt(new Date());
      return true;
    } catch (error) {
      const dropped = rejectedRef.current?.(error, items) ?? new Set<string>();
      for (const item of items) {
        if (!dropped.has(item.indicator_code) && !pending.current.has(item.indicator_code)) {
          pending.current.set(item.indicator_code, item);
        }
      }
      setStatus('error');
      return false;
    }
  }, []);

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    // Wait for the request in flight; what was queued meanwhile goes next.
    while (inFlight.current) await inFlight.current;
    const run = send();
    inFlight.current = run;
    try {
      return await run;
    } finally {
      if (inFlight.current === run) inFlight.current = null;
    }
  }, [send]);

  const queue = useCallback(
    (input: AnswerInput) => {
      pending.current.set(input.indicator_code, input);
      setStatus('saving');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), delay);
    },
    [delay, flush],
  );

  useEffect(() => () => void flush(), [flush]);

  return { status, savedAt, queue, flush };
}
