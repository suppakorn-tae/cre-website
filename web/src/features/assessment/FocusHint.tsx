'use client';

import * as Popover from '@radix-ui/react-popover';
import { useRef, useState, type ReactNode, type RefObject } from 'react';

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
  children: ReactNode;
};

/**
 * Shows the question of a field in a dark bubble above it while the field has focus.
 * Pointer hover never opens it. The same text is always in the page (visually hidden), so
 * a screen reader reads it through `aria-describedby`; the bubble is only the visual copy.
 * Esc or leaving the field closes it. It flips below the field when there is no room above.
 */
export function FocusHint({ hint, id, quietRef, children }: Props) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const anchor = useRef<HTMLDivElement>(null);

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
