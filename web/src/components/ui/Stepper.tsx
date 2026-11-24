import { cx } from './cx';
import styles from './display.module.css';

export type StepItem = { id: string; label: string };

type Props = {
  steps: StepItem[];
  /** Index of the current step. Earlier steps count as done. */
  current: number;
  /** Accessible name, e.g. "ขั้นตอนการประเมิน". */
  label: string;
  /** Hidden text after a finished step, e.g. "เสร็จแล้ว". */
  doneLabel: string;
};

/**
 * Flow bar: project, assessment, results, advice and strategy, report.
 * Also used for the two-step forgot-password flow.
 */
export function Stepper({ steps, current, label, doneLabel }: Props) {
  return (
    <nav aria-label={label}>
      <ol className={styles.steps}>
        {steps.map((s, i) => {
          const done = i < current;
          return (
            <li
              key={s.id}
              className={cx(styles.step, done && styles.stepDone)}
              aria-current={i === current ? 'step' : undefined}
            >
              <span className={styles.stepNum} aria-hidden="true">
                {done ? '✓' : i + 1}
              </span>
              <span>{s.label}</span>
              {done && <span className={styles.srOnly}>{doneLabel}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
