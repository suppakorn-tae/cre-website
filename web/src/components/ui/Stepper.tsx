'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import { IconCheck, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import Link from 'next/link';
import { useId, type ReactNode } from 'react';

import styles from './display.module.css';
import { Icon } from './Icon';
import { TooltipContent } from './TooltipContent';

export type StepItem = {
  id: string;
  label: string;
  /** Opens the page of the step. A step with neither `href` nor `onClick` is plain text. */
  href?: string;
  /** An in-place action instead of a page: the step is a button. */
  onClick?: () => void;
  /** Finished, shown with a check. Defaults to "before the current step". */
  done?: boolean;
  /** Not reachable yet: plain text (or a disabled button) that says why. */
  disabled?: boolean;
  /** The reason, shown as a tooltip and read as the description. */
  reason?: string;
  /** Replaces the number or check, e.g. a spinner while the step works. */
  icon?: ReactNode;
  /** The step is working (`aria-busy`). */
  busy?: boolean;
  /** Error colour, e.g. after the action failed. */
  failed?: boolean;
  /** Success colour, e.g. once the report is downloaded. */
  success?: boolean;
};

type Props = {
  steps: StepItem[];
  /** Index of the current step. */
  current: number;
  /** Accessible name, e.g. "ขั้นตอนการประเมิน". */
  label: string;
  /** Hidden text after a finished step, e.g. "เสร็จแล้ว". */
  doneLabel: string;
  /** "ขั้นที่ 3 จาก 5 · ผลการประเมิน", shown on phones in place of the bar. */
  position?: (info: { no: number; total: number; label: string }) => string;
  /** Spoken (and kept out of sight) when an in-place step changes, e.g. "กำลังสร้าง…". */
  status?: string;
};

type Pos = 'prev' | 'current' | 'next' | 'far';

function posOf(i: number, current: number): Pos {
  if (i === current) return 'current';
  if (i === current - 1) return 'prev';
  if (i === current + 1) return 'next';
  return 'far';
}

/**
 * Flow bar: project, assessment, results, plan and report. A card with
 * one segment per step and chevrons between them (hi-fi). Steps can link to
 * their page, act in place, or be unreachable text with a reason. Phones show
 * one row: previous, "step n of m · name", next, and a thin progress line.
 */
export function Stepper({ steps, current, label, doneLabel, position, status }: Props) {
  const total = steps.length;
  const isDone = (s: StepItem, i: number) => s.done ?? i < current;
  return (
    <nav aria-label={label} className={styles.stepper}>
      <Tooltip.Provider delayDuration={200} skipDelayDuration={100}>
        <ol className={styles.steps}>
          {steps.map((s, i) => (
            <li key={s.id} className={styles.step} data-pos={posOf(i, current)}>
              <StepBody
                step={s}
                no={i + 1}
                total={total}
                pos={posOf(i, current)}
                done={isDone(s, i)}
                doneLabel={doneLabel}
                position={position}
              />
            </li>
          ))}
        </ol>
      </Tooltip.Provider>
      <div className={styles.progress} aria-hidden="true">
        {steps.map((s, i) => (
          <span
            key={s.id}
            className={styles.progressSeg}
            data-state={i === current ? 'current' : isDone(s, i) ? 'done' : 'todo'}
          />
        ))}
      </div>
      <span className={styles.srOnly} role="status">
        {status}
      </span>
    </nav>
  );
}

type BodyProps = {
  step: StepItem;
  no: number;
  total: number;
  pos: Pos;
  done: boolean;
  doneLabel: string;
  position: Props['position'];
};

function StepBody({ step, no, total, pos, done, doneLabel, position }: BodyProps) {
  const reasonId = useId();
  const isCurrent = pos === 'current';
  const isAction = step.onClick !== undefined;
  const unreachable = !isCurrent && (step.disabled || (!step.href && !isAction));

  const circle = step.icon ?? (done && !isCurrent ? <Icon icon={IconCheck} size={16} /> : no);
  // On phones the neighbours of the current step show a chevron (an action shows its own icon).
  let side: ReactNode = null;
  if (pos === 'prev') side = <Icon icon={IconChevronLeft} size={20} />;
  if (pos === 'next') {
    side = (isAction && step.icon) || <Icon icon={IconChevronRight} size={20} />;
  }

  const content = (
    <>
      <span className={styles.stepNum} aria-hidden="true">
        {circle}
      </span>
      {side && (
        <span className={styles.stepSide} aria-hidden="true">
          {side}
        </span>
      )}
      <span className={styles.stepLabel}>{step.label}</span>
      {isCurrent && position && (
        <span className={styles.stepSummary}>{position({ no, total, label: step.label })}</span>
      )}
      {done && !isCurrent && <span className={styles.srOnly}>{doneLabel}</span>}
    </>
  );
  const common = {
    className: styles.stepInner,
    'data-done': (done && !isCurrent) || undefined,
    'data-failed': step.failed || undefined,
    'data-success': step.success || undefined,
  };

  if (isCurrent) {
    return (
      <span {...common} aria-current="step">
        {content}
      </span>
    );
  }
  if (unreachable) {
    const props = {
      ...common,
      'aria-disabled': true as const,
      'aria-describedby': step.reason ? reasonId : undefined,
      'data-disabled': true,
    };
    const node = isAction ? (
      <button type="button" {...props} onClick={(event) => event.preventDefault()}>
        {content}
      </button>
    ) : (
      // A disabled link: focusable, so the reason reaches keyboard users too.
      <span role="link" tabIndex={0} {...props}>
        {content}
      </span>
    );
    if (!step.reason) return node;
    return (
      <>
        <Tooltip.Root>
          <Tooltip.Trigger asChild>{node}</Tooltip.Trigger>
          <TooltipContent>{step.reason}</TooltipContent>
        </Tooltip.Root>
        {/* Outside the control, so it describes it without becoming part of its name. */}
        <span id={reasonId} className={styles.srOnly}>
          {step.reason}
        </span>
      </>
    );
  }
  if (isAction) {
    return (
      <button type="button" {...common} aria-busy={step.busy || undefined} onClick={step.onClick}>
        {content}
      </button>
    );
  }
  return (
    <Link href={step.href!} {...common}>
      {content}
    </Link>
  );
}
