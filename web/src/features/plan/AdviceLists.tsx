'use client';

import { useTranslations } from 'next-intl';

import type { IndicatorResult } from '@/features/results/overview/api';
import { subscript } from '@/features/results/overview/format';

type Advice = NonNullable<IndicatorResult['advice']>;

/**
 * The advice lists of one indicator. A list may hold 1 to 5 items and an
 * indicator 1 to 3 lists (ties show every tied list), so nothing here
 * assumes a count. Order is as the api returns it.
 */
export function AdviceLists({ advice }: { advice?: Advice }) {
  const t = useTranslations('plan');
  if (!advice || advice.length === 0) {
    return <p className="m-0 text-small text-text-muted">{t('noAdvice')}</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {advice.map((list) => {
        const heading = t.rich(`lists.${list.list}`, { ...subscript, count: list.items.length });
        return (
          <section key={list.list} className="flex flex-col gap-2">
            <h4 className="m-0 text-body font-semibold text-navy-900">{heading}</h4>
            <ol className="m-0 flex list-none flex-col gap-2 p-0">
              {list.items.map((text, i) => (
                <li
                  key={i}
                  className="box-border flex items-start gap-3 rounded-control border border-border bg-surface p-3 text-small text-text"
                >
                  <span
                    aria-hidden="true"
                    className="box-border grid size-6 shrink-0 place-items-center rounded-pill bg-blue-50 text-caption font-semibold text-blue-700"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 break-words">{text}</span>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
