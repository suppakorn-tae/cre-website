'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ConfirmDialog, Toast } from '@/components/ui';

import { AddProjectLink } from '../dashboard/AddProjectLink';
import { DashboardMocks } from '../dashboard/DashboardMocks';
import { ProjectsPanel } from '../dashboard/Panels';
import { RowButton, RowLink } from '../dashboard/RowActions';
import type { DashboardProjectItem } from '../dashboard/api';
import { useDeleteProject } from './api';
import dashboard from '../dashboard/dashboard.module.css';
import styles from './projects.module.css';

/**
 * Own projects: the same table and cards as the dashboard (search by name or
 * nickname, paged), plus edit and delete on every row.
 */
export function ProjectList() {
  const t = useTranslations('projects.list');
  const tDash = useTranslations('dashboard');
  const tUi = useTranslations('ui');
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<DashboardProjectItem | null>(null);
  const [notice, setNotice] = useState<'deleted' | 'failed' | null>(null);
  const remove = useDeleteProject();

  function confirmDelete() {
    if (!toDelete) return;
    remove.mutate(toDelete.project_id, {
      onSuccess: () => {
        setNotice('deleted');
        // The dashboard figures and panels hold the deleted project too.
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      },
      onError: () => setNotice('failed'),
      onSettled: () => setToDelete(null),
    });
  }

  return (
    <DashboardMocks>
      <section className={dashboard.page}>
        <header className={dashboard.head}>
          <div>
            <h1 className={dashboard.title}>{t('title')}</h1>
            <p className={dashboard.subtitle}>{t('subtitle')}</p>
          </div>
          <AddProjectLink label={tDash('addProject')} compactOnPhone />
        </header>

        {notice && (
          <div className={styles.notice}>
            <Toast
              title={notice === 'deleted' ? t('deleted') : t('deleteFailed')}
              tone={notice === 'deleted' ? 'success' : 'error'}
              closeLabel={tUi('close')}
              onClose={() => setNotice(null)}
            />
          </div>
        )}

        <ProjectsPanel
          extraActions={(p) => (
            <>
              <RowLink
                href={`/projects/${p.project_id}/edit`}
                aria-label={`${t('edit')} ${p.nickname}`}
              >
                {t('edit')}
              </RowLink>
              <RowButton
                tone="danger"
                aria-label={`${t('delete')} ${p.nickname}`}
                onClick={() => setToDelete(p)}
              >
                {t('delete')}
              </RowButton>
            </>
          )}
        />

        <ConfirmDialog
          open={toDelete !== null}
          destructive
          title={t('deleteDialog.title')}
          confirmLabel={remove.isPending ? t('deleteDialog.deleting') : t('deleteDialog.confirm')}
          cancelLabel={tUi('cancel')}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        >
          {toDelete && (
            <>
              <p>{t('deleteDialog.body', { nickname: toDelete.nickname, name: toDelete.name })}</p>
              <p>{t('deleteDialog.research')}</p>
            </>
          )}
        </ConfirmDialog>
      </section>
    </DashboardMocks>
  );
}
