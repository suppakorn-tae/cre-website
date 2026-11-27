'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { IconDots, IconPencil, IconTrash } from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRef } from 'react';

import { Icon } from '@/components/ui';
import { formatDate, formatNumber } from '@/lib/format/locale';

import type { Project } from './api';
import { projectPaths } from './rules';
import styles from './versions.module.css';

type Props = {
  project: Project;
  /** Opens the delete confirm. `trigger` is the button to give focus back to when it closes. */
  onDelete: (trigger: HTMLElement | null) => void;
};

/** Breadcrumb, name with nickname, one meta line and the edit and ⋯ actions (hi-fi 2.3). */
export function ProjectHeader({ project, onDelete }: Props) {
  const t = useTranslations('versions.detail');
  const menu = useRef<HTMLButtonElement>(null);
  const island =
    project.island_code === 'other' && project.island_other
      ? project.island_other
      : t(`islands.${project.island_code}`);
  const type =
    project.type_code === 'other' && project.type_other
      ? project.type_other
      : t(`types.${project.type_code}`);

  return (
    <header className={styles.header}>
      <nav aria-label={t('breadcrumbLabel')} className={styles.crumbs}>
        <Link href="/dashboard">{t('breadcrumbRoot')}</Link>
        <span aria-hidden="true"> / </span>
        <span aria-current="page">
          {project.nickname} {project.name}
        </span>
      </nav>
      <div className={styles.titleRow}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>
            {project.name} <span className={styles.nickname}>{project.nickname}</span>
          </h1>
          <p className={styles.meta}>
            {[
              island,
              type,
              t('value', { value: formatNumber(project.value_baht) }),
              t('period', {
                start: formatDate(project.start_date),
                end: formatDate(project.end_date),
              }),
              t('progressMeta', {
                actual: formatNumber(project.progress_pct),
                expected: formatNumber(project.expected_progress_pct),
              }),
            ].join(' · ')}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.editButton} href={projectPaths.edit(project.id)}>
            <Icon icon={IconPencil} size={18} />
            <span className={styles.editLabel}>{t('edit')}</span>
          </Link>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                ref={menu}
                type="button"
                aria-label={t('menuLabel')}
                className={styles.moreButton}
              >
                <Icon icon={IconDots} size={20} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                collisionPadding={16}
                className="z-50 min-w-52 rounded-card border border-border bg-card p-2 text-body shadow-floating"
              >
                <DropdownMenu.Item
                  className="flex h-control-md cursor-pointer select-none items-center gap-3 rounded-control px-3 text-body text-error outline-none data-[highlighted]:bg-error-bg"
                  onSelect={() => onDelete(menu.current)}
                >
                  <Icon icon={IconTrash} size={18} />
                  {t('delete')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  );
}
