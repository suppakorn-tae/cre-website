import { useCallback, useEffect, useRef, useState } from 'react';

import type { AnswerInput } from './api';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Collects answers and saves them in one batch after `delay` ms without a
 * change. Failed items stay queued for the next change or `flush`. Whatever
 * is queued is saved when the page unmounts, so the user can continue later.
 */
export function useAutosave(save: (items: AnswerInput[]) => Promise<void>, delay = 800) {
  const pending = useRef(new Map<string, AnswerInput>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveRef = useRef(save);
  const [status, setStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    saveRef.current = save;
  });

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const items = [...pending.current.values()];
    if (items.length === 0) return;
    pending.current.clear();
    setStatus('saving');
    try {
      await saveRef.current(items);
      setStatus(pending.current.size > 0 ? 'saving' : 'saved');
    } catch {
      for (const item of items) {
        if (!pending.current.has(item.indicator_code)) {
          pending.current.set(item.indicator_code, item);
        }
      }
      setStatus('error');
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
