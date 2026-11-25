import { useCallback, useEffect, useRef, useState } from 'react';

import type { AnswerInput } from './api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Collects answers and saves them in one batch after `delay` ms without a
 * change. Failed items stay queued for the next change or `flush`. Whatever
 * is queued is saved when the page unmounts, so the user can continue later.
 * `rejected` names the indicators the server refused for good (422); they are
 * not queued again, so one bad answer cannot block the rest of the batch.
 * `flush` resolves to true when everything queued was saved.
 */
export function useAutosave(
  save: (items: AnswerInput[]) => Promise<void>,
  delay = 800,
  rejected?: (error: unknown, items: AnswerInput[]) => ReadonlySet<string>,
) {
  const pending = useRef(new Map<string, AnswerInput>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  const [status, setStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    saveRef.current = save;
  });

  const rejectedRef = useRef(rejected);

  useEffect(() => {
    rejectedRef.current = rejected;
  });

  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current);
    const items = [...pending.current.values()];
    if (items.length === 0) return true;
    pending.current.clear();
    setStatus('saving');
    try {
      await saveRef.current(items);
      setStatus(pending.current.size > 0 ? 'saving' : 'saved');
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

  return { status, queue, flush };
}
