'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, ConfirmDialog, EmptyState, Skeleton, Toast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';

import {
  createVersion,
  deleteVersion,
  fetchProject,
  fetchVersions,
  projectKey,
  versionsKey,
  type VersionSummary,
} from './api';
import { OverviewPanel } from './OverviewPanel';
import { ProjectHeader } from './ProjectHeader';
import { PROJECT_TAB_PREFIX, ProjectTabs, type ProjectTab } from './ProjectTabs';
import { latestVersion } from './rules';
import { VersionList } from './VersionList';
import styles from './versions.module.css';

/** Project detail: header and version list, with create and delete (UC-06). */
export function ProjectDetail({ projectId }: { projectId: string }) {
  const t = useTranslations('versions');
  const queryClient = useQueryClient();
  const project = useQuery({
    queryKey: projectKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const versions = useQuery({
    queryKey: versionsKey(projectId),
    queryFn: () => fetchVersions(projectId),
  });
  const [tab, setTab] = useState<ProjectTab>('overview');
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<VersionSummary | null>(null);
  const [failure, setFailure] = useState<'create' | 'delete' | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: versionsKey(projectId) });
    void queryClient.invalidateQueries({ queryKey: projectKey(projectId) });
  };

  const create = useMutation({
    mutationFn: () => createVersion(projectId),
    onSuccess: () => {
      setCreating(false);
      refresh();
    },
    onError: () => {
      setCreating(false);
      setFailure('create');
    },
  });
  const remove = useMutation({
    mutationFn: (versionId: string) => deleteVersion(projectId, versionId),
    onSuccess: () => {
      setDeleting(null);
      refresh();
    },
    onError: () => {
      setDeleting(null);
      setFailure('delete');
    },
  });

  if (project.isError) {
    const missing = project.error instanceof ApiError && project.error.status === 404;
    return (
      <EmptyState
        title={missing ? t('detail.notFound') : t('detail.loadFailed')}
        action={
          missing ? (
            <Link className={styles.secondaryLink} href="/dashboard">
              {t('detail.backToDashboard')}
            </Link>
          ) : (
            <Button variant="secondary" onClick={() => void project.refetch()}>
              {t('detail.retry')}
            </Button>
          )
        }
      />
    );
  }

  const previous = latestVersion(versions.data ?? []);

  return (
    <div className={styles.page}>
      {project.data ? (
        <ProjectHeader project={project.data} />
      ) : (
        <div aria-busy="true" className={styles.skeleton}>
          <Skeleton width="40%" height="2rem" />
          <Skeleton width="70%" height="1.25rem" />
          <Skeleton width="100%" height="1rem" />
        </div>
      )}

      {failure && (
        <Toast
          tone="error"
          title={t(`${failure}.failed`)}
          closeLabel={t('create.cancel')}
          onClose={() => setFailure(null)}
        />
      )}

      {versions.isError ? (
        <EmptyState
          title={t('list.loadFailed')}
          action={
            <Button variant="secondary" onClick={() => void versions.refetch()}>
              {t('detail.retry')}
            </Button>
          }
        />
      ) : versions.data ? (
        <>
          <ProjectTabs value={tab} count={versions.data.length} onChange={setTab} />
          <div
            role="tabpanel"
            id={`${PROJECT_TAB_PREFIX}-panel-${tab}`}
            aria-labelledby={`${PROJECT_TAB_PREFIX}-tab-${tab}`}
            tabIndex={0}
            className={styles.panel}
          >
            {tab === 'overview' ? (
              project.data && (
                <OverviewPanel
                  project={project.data}
                  versions={versions.data}
                  onCreate={() => setCreating(true)}
                  onShowVersions={() => setTab('versions')}
                />
              )
            ) : (
              <VersionList
                projectId={projectId}
                versions={versions.data}
                onCreate={() => setCreating(true)}
                onDelete={setDeleting}
              />
            )}
          </div>
        </>
      ) : (
        <div aria-busy="true" className={styles.skeleton}>
          <Skeleton height="8rem" />
        </div>
      )}

      <ConfirmDialog
        open={creating}
        title={t('create.title')}
        confirmLabel={create.isPending ? t('create.creating') : t('create.confirm')}
        cancelLabel={t('create.cancel')}
        onConfirm={() => create.mutate()}
        onCancel={() => setCreating(false)}
      >
        <p>{t('create.blank')}</p>
        {previous && <p>{t('create.readOnly', { no: previous.version_no })}</p>}
        <p>{t('create.settings')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleting !== null}
        destructive
        title={t('delete.title', { no: deleting?.version_no ?? 0 })}
        confirmLabel={remove.isPending ? t('delete.deleting') : t('delete.confirm')}
        cancelLabel={t('delete.cancel')}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      >
        <p>{t('delete.body')}</p>
        <p>{t('delete.numberNotReused')}</p>
      </ConfirmDialog>
    </div>
  );
}
