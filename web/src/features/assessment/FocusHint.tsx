'use client';

import * as Popover from '@radix-ui/react-popover';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

import styles from './assessment.module.css';

export type Hint = { title: string; lines: string[] };

/**
 * Space a floating layer must keep clear at the top of the screen: the app header and the
 * sticky table header above `el`. Read when a layer opens, so it follows the real layout.
 */
export function stickyTop(el: Element | null): number {
  const nav = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--nav-height'),
  );
  const head = el?.closest('table')?.tHead;
  return (Number.isNaN(nav) ? 0 : nav) + (head?.offsetHeight ?? 0);
}

type Props = {
  hint?: Hint;
  /** Id of the hint text; the field points at it with `aria-describedby`. */
  id: string;
  /**
   * Set to true by a neighbour that is about to hand focus back to this field
   * (for example a closing picker), so the hint does not pop up again.
   */
  quietRef?: RefObject<boolean>;
  /** On a phone: the question shows in the page, above the field, instead of a bubble. */
  inline?: boolean;
  children: ReactNode;
};

/**
 * Shows the question of a field in a dark bubble above it while the field has focus.
 * Pointer hover never opens it. The same text is always in the page (visually hidden), so
 * a screen reader reads it through `aria-describedby`; the bubble is only the visual copy.
 * Esc or leaving the field closes it. It flips below the field when there is no room above.
 */
export function FocusHint({ hint, id, quietRef, inline, children }: Props) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);

  if (inline) {
    return (
      <InlineHint hint={hint} id={id} quietRef={quietRef}>
        {children}
      </InlineHint>
    );
  }

  return (
    <Popover.Root
      open={open && hint !== undefined}
      onOpenChange={(next) => !next && setOpen(false)}
    >
      <Popover.Anchor asChild>
        <div
          ref={anchor}
          className={styles.fieldBox}
          onFocus={(e) => {
            // Events from a portal (the y3 panel) bubble here too; only the field itself counts.
            if (!e.currentTarget.contains(e.target as Node) || quietRef?.current) return;
            setTop(stickyTop(anchor.current));
            setOpen(true);
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.target as Node)) return;
            if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
          }}
        >
          {children}
          {hint && (
            <span id={id} className={styles.srOnly}>
              {[hint.title, ...hint.lines].join('. ')}
            </span>
          )}
        </div>
      </Popover.Anchor>
      {hint && (
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="start"
            sideOffset={8}
            collisionPadding={{ top, right: 16, bottom: 16, left: 16 }}
            className={styles.hint}
            role="presentation"
            aria-hidden="true"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
            // Focus never leaves the field; only blur or Esc closes the bubble.
            onInteractOutside={(e) => e.preventDefault()}
          >
            <strong>{hint.title}</strong>
            {hint.lines.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
            <Popover.Arrow className={styles.hintArrow} width={16} height={8} />
          </Popover.Content>
        </Popover.Portal>
      )}
    </Popover.Root>
  );
}

/** How long the inline hint stays after the field loses focus, so a tap that blurred it lands. */
const HIDE_DELAY_MS = 250;

/**
 * Phone version of the hint: the question is a block in the page, above the focused field. The
 * text is one element that is visually hidden until focus, so `aria-describedby` always reads it.
 * It pushes the field down, so it must not move things between the press and the release of a tap:
 * a button (y3) shows it for keyboard focus only, and it leaves a moment after the blur.
 */
function InlineHint({
  hint,
  id,
  quietRef,
  children,
}: Pick<Props, 'hint' | 'id' | 'quietRef' | 'children'>) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const shown = open && hint !== undefined;

  return (
    <div
      className={styles.fieldBox}
      onFocus={(e) => {
        // Events from a portal (the y3 sheet) bubble here too; only the field itself counts.
        if (!e.currentTarget.contains(e.target as Node) || quietRef?.current) return;
        if (!(e.target as Element).matches(':focus-visible')) return;
        clearTimeout(timer.current);
        setOpen(true);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.target as Node)) return;
        if (e.currentTarget.contains(e.relatedTarget)) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setOpen(false), HIDE_DELAY_MS);
      }}
      onKeyDown={(e) => {
        if (e.key !== 'Escape') return;
        clearTimeout(timer.current);
        setOpen(false);
      }}
    >
      {hint && (
        <div id={id} className={shown ? styles.inlineHint : styles.srOnly}>
          <strong>{hint.title}</strong>{' '}
          {hint.lines.map((line, i) => (
            <span key={i}>{line} </span>
          ))}
        </div>
      )}
      {children}
    </div>
  );
}
