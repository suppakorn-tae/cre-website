'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import {
  IconChartBar,
  IconDots,
  IconDownload,
  IconEye,
  IconFileTypePdf,
  IconPencil,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { Icon, Spinner } from '@/components/ui';
import { buttonText, type ReportState } from '@/features/reports/state';
import { useReportDownload } from '@/features/reports/useReportDownload';

import type { VersionSummary } from './api';
import { projectPaths } from './rules';

const menuItemBase =
  'flex h-control-md cursor-pointer select-none items-center gap-3 rounded-control px-3 text-body no-underline outline-none';
const menuItem = `${menuItemBase} text-text data-[highlighted]:bg-blue-50 data-[highlighted]:text-primary`;
const dangerItem = `${menuItemBase} text-error data-[highlighted]:bg-error-bg`;

type Props = {
  projectId: string;
  version: VersionSummary;
  /** Opens the delete confirm. `trigger` is the button to give focus back to when it closes. */
  onDelete: (version: VersionSummary, trigger: HTMLElement | null) => void;
};

/** The ⋯ menu of a version card: answer or view answers, results, PDF report, delete. */
export function VersionMenu({ projectId, version, onDelete }: Props) {
  const t = useTranslations('versions.list');
  const trigger = useRef<HTMLButtonElement>(null);
  const tReports = useTranslations('reports');
  const answer = version.editable ? t('actions.answer') : t('actions.viewAnswers');
  // The hook lives here, not in the menu content, so a build goes on after the menu closes.
  const report = useReportDownload(projectId, version.id);
  const submitted = version.status === 'submitted';
  const reportText = tReports(`action.${buttonText(report.state, false)}`);
  const spoken = report.observed ? spokenText(report.state, report.tooMany, tReports) : '';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          aria-label={t('menuLabel', { no: version.version_no })}
          className="focus-ring inline-flex size-control-sm shrink-0 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent p-0 text-text-muted hover:bg-subtle hover:text-text data-[state=open]:bg-subtle"
        >
          <Icon icon={IconDots} size={20} />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={16}
          className="z-50 min-w-56 max-w-80 rounded-card border border-border bg-white p-2 text-body shadow-floating"
        >
          <DropdownMenu.Item asChild>
            <Link href={projectPaths.assessment(projectId, version.id)} className={menuItem}>
              <Icon icon={version.editable ? IconPencil : IconEye} size={18} />
              {answer}
            </Link>
          </DropdownMenu.Item>
          {version.status === 'submitted' && (
            <DropdownMenu.Item asChild>
              <Link href={projectPaths.results(projectId, version.id)} className={menuItem}>
                <Icon icon={IconChartBar} size={18} />
                {t('actions.results')}
              </Link>
            </DropdownMenu.Item>
          )}
          {submitted && (
            <DropdownMenu.Item
              className={menuItem}
              aria-busy={report.state === 'building'}
              data-report={report.state}
              // Stay open: the label says building, then "again" or "retry", as in the shell's menu.
              onSelect={(event) => {
                event.preventDefault();
                report.start();
              }}
            >
              <ReportIcon state={report.state} />
              {reportText}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-divider" />
          <DropdownMenu.Item
            className={dangerItem}
            onSelect={() => onDelete(version, trigger.current)}
          >
            <Icon icon={IconTrash} size={18} />
            {t('actions.deleteVersion')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
      {submitted && (
        <VisuallyHidden.Root role="status" aria-live="polite">
          {spoken}
        </VisuallyHidden.Root>
      )}
    </DropdownMenu.Root>
  );
}

function ReportIcon({ state }: { state: ReportState }) {
  if (state === 'building') return <Spinner size={18} />;
  if (state === 'ready') return <Icon icon={IconDownload} size={18} />;
  if (state === 'failed') return <Icon icon={IconRefresh} size={18} />;
  return <Icon icon={IconFileTypePdf} size={18} />;
}

function spokenText(
  state: ReportState,
  tooMany: boolean,
  t: ReturnType<typeof useTranslations>,
): string {
  if (state === 'building') return t('toast.building.title');
  if (state === 'ready') return t('toast.ready.title');
  if (state === 'failed') return tooMany ? t('toast.failed.tooMany') : t('toast.failed.title');
  return '';
}
