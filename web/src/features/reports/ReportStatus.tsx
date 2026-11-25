import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui';

import type { JobStatus } from './polling';
import styles from './reports.module.css';

type Props = {
  status: JobStatus;
  downloadHref: string;
  onRetry: () => void;
  retrying: boolean;
};

/** Progress, download link or retry for one report job (UC-11 to UC-13). */
export function ReportStatus({ status, downloadHref, onRetry, retrying }: Props) {
  const t = useTranslations('reports');
  const failed = status === 'failed' || status === 'expired';
  const busy = status === 'queued' || status === 'running';
  return (
    <section className={styles.card} aria-labelledby="report-status-title">
      <h2 id="report-status-title" className={styles.cardTitle}>
        {t('statusTitle')}
      </h2>
      <p
        className={failed ? styles.statusFailed : styles.status}
        role={failed ? 'alert' : 'status'}
        aria-busy={busy}
        data-status={status}
      >
        {t(`status.${status}`)}
      </p>
      {busy && <p className={styles.hint}>{t('leaveHint')}</p>}
      {status === 'done' && (
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
  );
}
