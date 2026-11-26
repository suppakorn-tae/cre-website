'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { IconChartBar, IconDots, IconEye, IconPencil, IconTrash } from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { Icon } from '@/components/ui';

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

/** The ⋯ menu of a version card: answer or view answers, results, delete. */
export function VersionMenu({ projectId, version, onDelete }: Props) {
  const t = useTranslations('versions.list');
  const trigger = useRef<HTMLButtonElement>(null);
  const answer = version.editable ? t('actions.answer') : t('actions.viewAnswers');

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
    </DropdownMenu.Root>
  );
}
