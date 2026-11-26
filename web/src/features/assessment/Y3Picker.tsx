'use client';

import * as Popover from '@radix-ui/react-popover';
import { IconChevronDown } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

import { Button, Icon, type CheckboxOption } from '@/components/ui';

import styles from './assessment.module.css';
import { stickyTop } from './FocusHint';
import { LetterChoiceList } from './LetterChoiceList';
import { EXCLUSIVE_Y3, y3Conflict } from './rules';
import { useNarrow } from './useNarrow';

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

/** The chosen letters as chips and a "choose" label: the inside of the trigger button. */
function TriggerContent({ name, value }: { name: string; value: string[] }) {
  const t = useTranslations('assessment');
  return (
    <>
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
    </>
  );
}

/** The question, the helper, the nine choices and the clear and done buttons. */
function Panel({
  name,
  question,
  options,
  value,
  disabled,
  done,
  footerClass,
  onChange,
}: Pick<Props, 'question' | 'options' | 'value' | 'disabled' | 'onChange'> & {
  name: string;
  /** The "done" button, wrapped by whatever closes the panel. */
  done: ReactNode;
  /** Extra class of the button row (the sheet keeps it in view while the choices scroll). */
  footerClass?: string;
}) {
  const t = useTranslations('assessment');
  const id = useId();
  const questionId = `${id}-question`;
  const helperId = `${id}-helper`;
  const conflict = y3Conflict(value);
  return (
    <>
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
      <div
        className={[
          'mt-4 flex items-center justify-end gap-2 border-t border-border pt-3',
          footerClass,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <Button
          variant="ghost"
          disabled={disabled || value.length === 0}
          onClick={() => onChange([])}
        >
          {t('y3.clear')}
        </Button>
        {done}
      </div>
    </>
  );
}

/**
 * The y3 cell: the chosen letters as chips and a "choose" button that opens a panel with the
 * question first, then one checkbox per option. A exclusive: choosing it with another option
 * shows the error at once and keeps the user's choices. On a phone the panel is a bottom sheet.
 */
export function Y3Picker(props: Props) {
  return useNarrow() ? <Y3Sheet {...props} /> : <Y3Popover {...props} />;
}

function Y3Popover({
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
  const trigger = useRef<HTMLButtonElement>(null);
  const name = `${t('fields.y3')} ${code}`;
  const [top, setTop] = useState(0);

  return (
    <Popover.Root onOpenChange={(open) => open && setTop(stickyTop(trigger.current))}>
      <Popover.Trigger
        ref={trigger}
        className={styles.pickerHead}
        aria-describedby={describedBy || undefined}
      >
        <TriggerContent name={name} value={value} />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          // The panel is tall (nine lines): beside the cell it can slide up or down to fit.
          side="left"
          align="center"
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
          <Panel
            name={name}
            question={question}
            options={options}
            value={value}
            disabled={disabled}
            onChange={onChange}
            done={
              <Popover.Close asChild>
                <Button>{t('y3.done')}</Button>
              </Popover.Close>
            }
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/**
 * Phone version: the same panel in a bottom sheet (full width, at most 80% of the screen
 * high, scrolling inside). It is the native dialog element, so focus is trapped, Esc closes
 * and the page behind is inert, like the confirm dialog.
 */
function Y3Sheet({
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
  const name = `${t('fields.y3')} ${code}`;
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = sheet.current;
    if (open && dialog && !dialog.open) dialog.showModal();
  }, [open]);

  // The browser hands focus back to the button as the sheet closes; keep the hint closed.
  const quiet = () => {
    if (!quietRef) return;
    quietRef.current = true;
    setTimeout(() => (quietRef.current = false), 0);
  };
  const close = () => {
    quiet();
    sheet.current?.close();
  };

  return (
    <>
      <button
        type="button"
        className={styles.pickerHead}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-describedby={describedBy || undefined}
        onClick={() => setOpen(true)}
      >
        <TriggerContent name={name} value={value} />
      </button>
      {open &&
        createPortal(
          // A tap on the dimmed area (the dialog element itself) closes the sheet.
          <dialog
            ref={sheet}
            className={styles.sheet}
            aria-label={name}
            onCancel={quiet}
            onClose={() => setOpen(false)}
            onClick={(e) => e.target === e.currentTarget && close()}
          >
            <div className={styles.sheetBody}>
              <Panel
                name={name}
                question={question}
                options={options}
                value={value}
                disabled={disabled}
                onChange={onChange}
                footerClass={styles.sheetFooter}
                done={<Button onClick={close}>{t('y3.done')}</Button>}
              />
            </div>
          </dialog>,
          document.body,
        )}
    </>
  );
}
