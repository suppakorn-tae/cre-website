'use client';

import { IconDownload, IconRefresh } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, Icon } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { formatDateTime } from '@/lib/format/locale';

import { downloadExport, useJob, type ExportRequest, type Job } from './api';
import styles from './export.module.css';

export type ExportEntry = { id: string; requestedAt: string; request: ExportRequest };

type Props = { entry: ExportEntry; onAgain: (request: ExportRequest) => void };

/** One requested export: polls its job and offers download, or request-again. */
export function ExportRow({ entry, onAgain }: Props) {
  const t = useTranslations('admin-export.history');
  const job = useJob(entry.id);
  const [phase, setPhase] = useState<'idle' | 'downloading' | 'failed' | 'expired'>('idle');

  // 410 from the download means the file lapsed before the job status caught up.
  const status: Job['status'] | 'loading' =
    phase === 'expired' ? 'expired' : (job.data?.status ?? 'loading');

  async function download() {
    setPhase('downloading');
    try {
      await downloadExport(entry.id);
      setPhase('idle');
    } catch (error) {
      setPhase(error instanceof ApiError && error.status === 410 ? 'expired' : 'failed');
    }
  }

  const { request } = entry;
  const scope =
    request.scope === 'all'
      ? t('scopeAll')
      : t('scopeSelected', { count: request.user_ids?.length ?? 0 });

  return (
    <li className={styles.row}>
      <span data-label={t('requestedAt')}>{formatDateTime(entry.requestedAt)}</span>
      <span data-label={t('scope')}>{scope}</span>
      <span data-label={t('includeDeleted')}>{request.include_deleted ? t('yes') : t('no')}</span>
      <span data-label={t('status')} className={styles.statusCell}>
        <span className={styles.status} data-status={status}>
          {job.isError && status === 'loading' ? t('loadFailed') : null}
          {status === 'loading' ? null : t(status)}
        </span>
        {job.phase === 'stalled' && (
          <span className={styles.muted}>
            {t('stalled')}{' '}
            <Button size="sm" variant="secondary" onClick={job.checkAgain}>
              {t('checkAgain')}
            </Button>
          </span>
        )}
        {job.phase === 'longRunning' && <span className={styles.muted}>{t('longRunning')}</span>}
        {status === 'expired' && <span className={styles.muted}>{t('expiredHelp')}</span>}
        {phase === 'failed' && (
          <span role="alert" className={styles.statusError}>
            {t('downloadFailed')}
          </span>
        )}
      </span>
      <span className={styles.actions}>
        {status === 'done' && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Icon icon={IconDownload} size={18} />}
            onClick={download}
            disabled={phase === 'downloading'}
          >
            {phase === 'downloading' ? t('downloading') : t('download')}
          </Button>
        )}
        {(status === 'expired' || status === 'failed') && (
          <Button
            size="sm"
            variant="secondary"
            icon={<Icon icon={IconRefresh} size={18} />}
            onClick={() => onAgain(request)}
          >
            {t('again')}
          </Button>
        )}
      </span>
    </li>
  );
}
