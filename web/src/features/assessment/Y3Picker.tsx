'use client';

import * as Popover from '@radix-ui/react-popover';
import { IconChevronDown } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useId, useRef, useState, type RefObject } from 'react';

import { Button, Icon, type CheckboxOption } from '@/components/ui';

import styles from './assessment.module.css';
import { stickyTop } from './FocusHint';
import { LetterChoiceList } from './LetterChoiceList';
import { EXCLUSIVE_Y3, y3Conflict } from './rules';

type Props = {
  /** Indicator code, part of the accessible name. */
  code: string;
  /** The y3 question of the indicator, shown first in the panel. */
  question: string | null;
  options: CheckboxOption[];
  value: string[];
  disabled: boolean;
  /** Ids of other text that describes the trigger (the focus hint). */
  describedBy?: string;
  /** Set to true just before focus returns to the trigger, so the focus hint stays quiet. */
  quietRef?: RefObject<boolean>;
  onChange: (value: string[]) => void;
};

/**
 * The y3 cell: the chosen letters as chips and a "choose" button that opens a panel with the
 * question first, then one checkbox per option. A exclusive: choosing it with another option
 * shows the error at once and keeps the user's choices.
 */
export function Y3Picker({
  code,
  question,
  options,
  value,
  disabled,
  describedBy,
  quietRef,
  onChange,
}: Props) {
  const t = useTranslations('assessment');
  const id = useId();
  const questionId = `${id}-question`;
  const helperId = `${id}-helper`;
  const trigger = useRef<HTMLButtonElement>(null);
  const name = `${t('fields.y3')} ${code}`;
  const conflict = y3Conflict(value);
  const [top, setTop] = useState(0);
  const [side, setSide] = useState<'left' | 'bottom'>('left');

  return (
    <Popover.Root
      onOpenChange={(open) => {
        if (!open) return;
        setTop(stickyTop(trigger.current));
        // The panel is tall (nine lines): beside the cell it can slide up or down to fit the
        // screen. On a narrow screen there is no room beside the cell, so it opens below.
        setSide(window.matchMedia('(min-width: 768px)').matches ? 'left' : 'bottom');
      }}
    >
      <Popover.Trigger
        ref={trigger}
        className={styles.pickerHead}
        aria-describedby={describedBy || undefined}
      >
        <span className={styles.srOnly}>{name}</span>
        {value.map((v) => (
          <span key={v} className={styles.y3Chip}>
            {v}
          </span>
        ))}
        {value.length > 0 && (
          <span className={styles.srOnly}>{t('table.picked', { count: value.length })}</span>
        )}
        <span className={styles.pick}>{t('table.pick')}</span>
        <Icon icon={IconChevronDown} size={16} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={side === 'left' ? 'center' : 'end'}
          sideOffset={8}
          collisionPadding={{ top, right: 16, bottom: 16, left: 16 }}
          aria-label={name}
          className="z-50 box-border max-h-[var(--radix-popover-content-available-height)] w-88 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-card border border-border bg-white p-4 shadow-floating"
          onCloseAutoFocus={() => {
            // Radix puts focus back on the trigger right after this; keep the hint closed.
            if (quietRef) {
              quietRef.current = true;
              setTimeout(() => (quietRef.current = false), 0);
            }
          }}
        >
          {question && (
            <p id={questionId} className="m-0 text-body text-text">
              {question}
            </p>
          )}
          <p id={helperId} className="m-0 mt-1 text-caption text-text-muted">
            {t('fields.y3Helper')}
          </p>
          <div className="mt-3">
            <LetterChoiceList
              legend={name}
              options={options}
              value={value}
              disabled={disabled}
              invalid={conflict ? [EXCLUSIVE_Y3] : []}
              error={conflict ? t('y3.exclusiveError') : undefined}
              describedBy={question ? `${questionId} ${helperId}` : helperId}
              onChange={onChange}
            />
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 border-t border-border pt-3">
            <Button
              variant="ghost"
              disabled={disabled || value.length === 0}
              onClick={() => onChange([])}
            >
              {t('y3.clear')}
            </Button>
            <Popover.Close asChild>
              <Button>{t('y3.done')}</Button>
            </Popover.Close>
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
