'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { IconChevronDown } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { Icon, type CheckboxOption } from '@/components/ui';

import type { Catalogue } from './api';
import styles from './assessment.module.css';
import type { ServerErrors } from './fieldErrors';
import { codesOf, Progress } from './GroupProgress';
import { NumberField, Y3Field, useIndicatorFields, type Indicator } from './indicatorFields';
import { answeredFields, emptyDraft, type Draft } from './rules';

type Factor = Catalogue['dimensions'][number]['factors'][number];

type CardProps = {
  indicator: Indicator;
  draft: Draft;
  y3Options: CheckboxOption[];
  disabled: boolean;
  serverErrors?: ServerErrors[string];
  onChange: (draft: Draft) => void;
};

/**
 * One indicator as a card on a phone. Collapsed it is one tappable header (code, name,
 * status and "answered n/4"); open it stacks X, y1, y2 and y3, each with its label and unit.
 */
function IndicatorCard({
  indicator,
  draft,
  y3Options,
  disabled,
  serverErrors,
  onChange,
}: CardProps) {
  const t = useTranslations('assessment');
  const f = useIndicatorFields({ indicator, draft, serverErrors, onChange });
  return (
    <Accordion.Item value={f.code} className={styles.card} data-answer={f.state}>
      <Accordion.Header asChild>
        <h4 className={styles.cardHeading}>
          <Accordion.Trigger className={styles.cardTrigger}>
            <span className={styles.cardTop}>
              <span className={styles.cardCode}>{f.code}</span>
              <span className={styles.badge} data-state={f.state}>
                {t(`indicator.${f.state}`)}
              </span>
              <span className={styles.cardCount}>
                {t('card.answered', { count: answeredFields(draft) })}
              </span>
            </span>
            <span className={styles.cardName}>{indicator.name}</span>
            <Icon icon={IconChevronDown} size={20} className={styles.cardChevron} />
          </Accordion.Trigger>
        </h4>
      </Accordion.Header>
      <Accordion.Content className={styles.cardBody}>
        {f.codeError !== undefined && (
          <p role="alert" className={styles.cellError}>
            {f.codeError}
          </p>
        )}
        <NumberField {...f.x} disabled={disabled} />
        <NumberField {...f.y1} disabled={disabled} />
        <NumberField {...f.y2} disabled={disabled} />
        <Y3Field
          indicator={indicator}
          options={y3Options}
          value={f.y3.value}
          disabled={disabled}
          label={f.y3.label}
          hint={f.y3.hint}
          error={f.y3.error}
          onChange={f.y3.onChange}
        />
      </Accordion.Content>
    </Accordion.Item>
  );
}

type Props = {
  catalogue: Catalogue;
  drafts: Record<string, Draft | undefined>;
  y3Options: CheckboxOption[];
  disabled: boolean;
  /** Factor code to show alone; all factors when unset. */
  factor?: string;
  serverErrors?: ServerErrors;
  onChange: (code: string, draft: Draft) => void;
};

/**
 * A dimension header. The progress drops under the name when the line is too narrow (a small
 * screen or large text), so the header grows; its real height goes to `--dimension-height` on the
 * section so the factor header stays stuck right under it.
 */
function DimensionHead({
  name,
  codes,
  drafts,
}: {
  name: string;
  codes: string[];
  drafts: Record<string, Draft | undefined>;
}) {
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const el = head.current;
    const section = el?.parentElement;
    if (!el || !section || typeof ResizeObserver === 'undefined') return;
    const apply = () => section.style.setProperty('--dimension-height', `${el.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      section.style.removeProperty('--dimension-height');
    };
  }, []);
  return (
    <h2 ref={head} className={styles.dimensionHead}>
      <span className={styles.groupName}>{name}</span>
      <Progress codes={codes} drafts={drafts} />
    </h2>
  );
}

/**
 * All indicators as cards (under 768 px), collapsed by default, under sticky dimension and
 * factor headers. A card the server rejected opens by itself so its error is not hidden.
 */
export function CardList({
  catalogue,
  drafts,
  y3Options,
  disabled,
  factor,
  serverErrors,
  onChange,
}: Props) {
  const t = useTranslations('assessment');
  const [open, setOpen] = useState<string[]>([]);

  // Adjust state while rendering, not in an effect: open the cards the server rejected.
  const rejected = Object.keys(serverErrors ?? {});
  const [seen, setSeen] = useState('');
  const key = rejected.join('|');
  if (key !== seen) {
    setSeen(key);
    const fresh = rejected.filter((code) => !open.includes(code));
    if (fresh.length > 0) setOpen([...open, ...fresh]);
  }

  const dimensions = catalogue.dimensions
    .map((d) => ({
      ...d,
      factors: d.factors.filter((f: Factor) => factor === undefined || f.code === factor),
    }))
    .filter((d) => d.factors.length > 0);

  return (
    <Accordion.Root
      type="multiple"
      value={open}
      onValueChange={setOpen}
      className={styles.cards}
      role="region"
      aria-label={t('table.label')}
    >
      {dimensions.map((dimension) => (
        <section key={dimension.code} className={styles.dimension}>
          <DimensionHead name={dimension.name} codes={codesOf(dimension.factors)} drafts={drafts} />
          {dimension.factors.map((f: Factor) => (
            <div key={f.code} className={styles.factor}>
              <h3 className={styles.factorHead}>
                <span className={styles.groupName}>
                  {f.code} {f.name}
                </span>
                <Progress codes={codesOf([f])} drafts={drafts} />
              </h3>
              {f.indicators.map((indicator) => (
                <IndicatorCard
                  key={indicator.code}
                  indicator={indicator}
                  draft={drafts[indicator.code] ?? emptyDraft()}
                  y3Options={y3Options}
                  disabled={disabled}
                  serverErrors={serverErrors?.[indicator.code]}
                  onChange={(draft) => onChange(indicator.code, draft)}
                />
              ))}
            </div>
          ))}
        </section>
      ))}
    </Accordion.Root>
  );
}
