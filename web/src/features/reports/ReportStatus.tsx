import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui';
import { formatDateTime } from '@/lib/format/locale';

import type { JobStatus } from './polling';
import styles from './reports.module.css';

type Props = {
  status: JobStatus;
  /** When the job finished; shown as the ready time. */
  finishedAt: string | null;
  title: string;
  downloadHref: string;
  /** Download URL with `disposition=inline`, framed as the preview. */
  previewHref: string;
  onRetry: () => void;
  retrying: boolean;
};

const STEPS = ['queued', 'running', 'done', 'failed'] as const;
type Step = (typeof STEPS)[number];

/** Expired jobs read as failed: the only way forward is to ask again. */
const stepOf = (status: JobStatus): Step => (status === 'expired' ? 'failed' : status);

/** Report card, status list, content note and the first-page preview (UC-11 to UC-13). */
export function ReportStatus({
  status,
  finishedAt,
  title,
  downloadHref,
  previewHref,
  onRetry,
  retrying,
}: Props) {
  const t = useTranslations('reports');
  const current = stepOf(status);
  const failed = current === 'failed';
  const done = current === 'done';
  const busy = current === 'queued' || current === 'running';
  const ready = finishedAt ? formatDateTime(finishedAt) : null;
  const chip = failed ? styles.chipFailed : done ? styles.chipDone : styles.chip;

  return (
    <div className={styles.columns}>
      <div className={styles.side}>
        <section className={styles.card} aria-labelledby="report-status-title">
          <h2 id="report-status-title" className={styles.cardTitle}>
            {title}
          </h2>
          <p
            className={chip}
            role={failed ? 'alert' : 'status'}
            aria-busy={busy}
            data-status={status}
          >
            {t(`status.${status}`)}
          </p>
          {done && ready && <p className={styles.meta}>{ready}</p>}
          {busy && <p className={styles.hint}>{t('leaveHint')}</p>}
          {done && (
            <a className={styles.download} href={downloadHref} download>
              {t('download')}
            </a>
          )}
          {failed && (
            <Button variant="secondary" onClick={onRetry} disabled={retrying}>
              {t('retryRequest')}
            </Button>
          )}
        </section>

        <section className={styles.card} aria-labelledby="report-steps-title">
          <h2 id="report-steps-title" className={styles.cardTitle}>
            {t('statusTitle')}
          </h2>
          <ol className={styles.steps}>
            {STEPS.map((step) => (
              <li
                key={step}
                className={step === current ? styles.stepCurrent : styles.step}
                aria-current={step === current ? 'step' : undefined}
              >
                <span className={styles.stepName}>{t(`stepName.${step}`)}</span>
                <span className={styles.stepDetail}>
                  {step === 'done' && done && ready ? ready : t(`stepDetail.${step}`)}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.note} aria-labelledby="report-content-title">
          <h2 id="report-content-title" className={styles.noteTitle}>
            {t('contentTitle')}
          </h2>
          <p className={styles.noteText}>{t('contentText')}</p>
        </section>
      </div>

      <section className={styles.preview} aria-labelledby="report-preview-title">
        <h2 id="report-preview-title" className={styles.previewCaption}>
          {t('previewCaption')}
        </h2>
        {done ? (
          <iframe
            className={styles.previewFrame}
            src={previewHref}
            title={t('previewTitle')}
            loading="lazy"
          />
        ) : (
          <div className={styles.previewEmpty}>
            <p className={styles.previewText}>{t('previewWaiting')}</p>
          </div>
        )}
      </section>
    </div>
  );
}
