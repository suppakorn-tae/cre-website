import type { JobStatus } from './polling';

export type ReportState = 'idle' | 'building' | 'ready' | 'failed';

type Input = {
  /** The request for the job is on its way. */
  requesting: boolean;
  requestFailed: boolean;
  jobId: string | null;
  /** Last status the api gave for the job; undefined before the first answer. */
  jobStatus: JobStatus | undefined;
  /** The status request itself failed (network or server error). */
  pollFailed: boolean;
};

/** One state for the button and the toast, from the request and the job. */
export function reportState({
  requesting,
  requestFailed,
  jobId,
  jobStatus,
  pollFailed,
}: Input): ReportState {
  if (requesting) return 'building';
  if (requestFailed) return 'failed';
  if (jobId === null) return 'idle';
  if (pollFailed || jobStatus === 'failed' || jobStatus === 'expired') return 'failed';
  if (jobStatus === 'done') return 'ready';
  // No answer yet, queued or running.
  return 'building';
}

export type ButtonText = 'label' | 'building' | 'again' | 'retry';

/**
 * Which label the report button shows. With a toast (results page) the toast
 * carries "again" and "retry", so the button goes back to its plain label; in
 * place it is the only signal and changes with the state.
 */
export function buttonText(state: ReportState, withToast: boolean): ButtonText {
  if (state === 'building') return 'building';
  if (withToast) return 'label';
  if (state === 'ready') return 'again';
  if (state === 'failed') return 'retry';
  return 'label';
}

/** `CRE-{nickname}-v{no}.pdf`, with characters a file name cannot hold replaced. */
export function reportFileName(nickname: string | undefined, versionNo: number | undefined) {
  if (!nickname || versionNo === undefined) return 'CRE-report.pdf';
  return `CRE-${nickname.replace(/[\\/:*?"<>|\s]+/g, '_')}-v${versionNo}.pdf`;
}

/** Clicks a hidden link once, so the browser saves the file and the page stays where it is. */
export function triggerDownload(url: string, fileName: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
}
