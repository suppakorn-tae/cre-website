'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { IconDownload, IconFileTypePdf, IconRefresh } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef } from 'react';

import { Icon, Spinner, useToaster } from '@/components/ui';
import { cx } from '@/components/ui/cx';

import { REPORT_TOAST_IDS, reportToast } from './reportToast';
import styles from './reports.module.css';
import { buttonText, type ReportState } from './state';
import { useReportDownload, type ReportDownload } from './useReportDownload';

type Props = {
  projectId: string;
  versionId: string;
  /** Only a submitted version can have a report; a draft shows the button disabled with the reason. */
  submitted: boolean;
  /** Version number, to name the button for screen readers when a page lists several. */
  versionNo?: number;
  /** Show progress in a toast (results page). Without it the button shows it in place. */
  toast?: boolean;
  /** The look of the button comes from the page that places it. */
  className?: string;
};

/** Shows the report's progress as one toast at a time: building, ready or failed. */
function useReportToast(report: ReportDownload, enabled: boolean) {
  const t = useTranslations('reports.toast');
  const toaster = useToaster();
  const { state, observed, tooMany, stalled, longRunning } = report;
  // Click handlers read the latest actions without making the toast effect re-run.
  const actions = useRef({ download: report.download, retry: report.retry });
  useEffect(() => {
    actions.current = { download: report.download, retry: report.retry };
  });

  useEffect(() => {
    if (!enabled || !observed) return;
    for (const id of REPORT_TOAST_IDS) toaster.dismiss(id);
    const spec = reportToast(
      state,
      tooMany,
      t,
      {
        download: () => void actions.current.download(),
        retry: () => actions.current.retry(),
      },
      { stalled, longRunning },
    );
    if (spec) toaster.show(spec);
  }, [enabled, observed, state, tooMany, stalled, longRunning, t, toaster]);

  // The toasts belong to this page: leave with it, the project page's button takes over.
  useEffect(() => {
    if (!enabled) return;
    return () => {
      for (const id of REPORT_TOAST_IDS) toaster.dismiss(id);
    };
  }, [enabled, toaster]);
}

function StateIcon({ state, withToast }: { state: ReportState; withToast: boolean }) {
  if (state === 'building') return <Spinner size={18} />;
  if (!withToast && state === 'ready') return <Icon icon={IconDownload} size={18} />;
  if (!withToast && state === 'failed') return <Icon icon={IconRefresh} size={18} />;
  return <Icon icon={IconFileTypePdf} size={18} />;
}

/**
 * "รายงาน PDF": asks for the report and downloads it when it is ready, without
 * leaving the page. On the results page a toast shows the progress; elsewhere
 * the label changes in place and a hidden live region speaks the change.
 */
export function ReportButton({
  projectId,
  versionId,
  submitted,
  versionNo,
  toast = false,
  className,
}: Props) {
  const t = useTranslations('reports');
  const report = useReportDownload(projectId, versionId);
  useReportToast(report, toast);
  const reasonId = useId();
  const { state } = report;

  const text = t(
    report.stalled && !toast ? 'action.checkAgain' : `action.${buttonText(state, toast)}`,
  );
  const name =
    versionNo === undefined ? undefined : t('action.forVersion', { action: text, no: versionNo });

  if (!submitted) {
    const reason = t('action.draftReason');
    return (
      <Tooltip.Provider delayDuration={200} skipDelayDuration={100}>
        <span className={styles.draft}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                aria-disabled="true"
                aria-describedby={reasonId}
                aria-label={name}
                data-report="draft"
                className={cx(styles.button, className)}
                onClick={(event) => event.preventDefault()}
              >
                <Icon icon={IconFileTypePdf} size={18} />
                {text}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Content
              sideOffset={6}
              className="z-50 max-w-64 rounded-control bg-navy-900 px-2 py-1 text-caption text-white"
            >
              {reason}
            </Tooltip.Content>
          </Tooltip.Root>
          {/* Seen on a phone, where there is no hover; the button points at it for screen readers. */}
          <span id={reasonId} className={styles.reason}>
            {reason}
          </span>
        </span>
      </Tooltip.Provider>
    );
  }

  const busy = state === 'building';
  // What the live region says; only for a build this page watched.
  const spoken = !toast && report.observed ? spokenText(report, t) : '';
  // In place there is no toast, so the wait notes sit next to the button.
  const note = toast
    ? ''
    : report.stalled
      ? t('toast.stalled.title')
      : report.longRunning
        ? t('toast.building.longText')
        : '';

  return (
    <>
      <button
        type="button"
        aria-busy={busy}
        aria-disabled={busy || undefined}
        aria-label={name}
        data-report={state}
        className={cx(styles.button, className)}
        onClick={() => report.start()}
      >
        <StateIcon state={state} withToast={toast} />
        {text}
      </button>
      {note && <span className={styles.note}>{note}</span>}
      {!toast && (
        <VisuallyHidden.Root role="status" aria-live="polite">
          {spoken}
        </VisuallyHidden.Root>
      )}
    </>
  );
}

function spokenText(
  { state, tooMany, stalled }: ReportDownload,
  t: ReturnType<typeof useTranslations>,
): string {
  if (stalled) return t('toast.stalled.title');
  if (state === 'building') return t('toast.building.title');
  if (state === 'ready') return t('toast.ready.title');
  if (state === 'failed') return tooMany ? t('toast.failed.tooMany') : t('toast.failed.title');
  return '';
}
