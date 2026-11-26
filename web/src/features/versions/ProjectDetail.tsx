'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { Button, ConfirmDialog, EmptyState, Skeleton, Toast, useToaster } from '@/components/ui';
import type { CompareViewName } from '@/features/compare/ComparePanel';
import { useDeleteProject } from '@/features/projects/api';
import { ApiError } from '@/lib/api/errors';

import {
  catalogueTotalKey,
  createVersion,
  deleteVersion,
  fetchIndicatorTotal,
  fetchProject,
  fetchVersions,
  projectKey,
  versionsKey,
  type VersionSummary,
} from './api';
import { OverviewPanel } from './OverviewPanel';
import { ProjectHeader } from './ProjectHeader';
import { PROJECT_TAB_PREFIX, ProjectTabs, type ProjectTab } from './ProjectTabs';
import { latestVersion, readProjectView } from './rules';
import { VersionsTab } from './VersionsTab';
import styles from './versions.module.css';

/** Writes `?tab=` and `?view=` without a round trip to the server; the page reads them back. */
function writeProjectView(tab: ProjectTab, view: CompareViewName) {
  const params = new URLSearchParams(window.location.search);
  if (tab === 'versions') params.set('tab', 'versions');
  else params.delete('tab');
  if (tab === 'versions' && view === 'rm') params.set('view', 'rm');
  else params.delete('view');
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

/** Project detail (UC-05, UC-06): header, tabs, versions with the comparison, create and delete. */
export function ProjectDetail({ projectId }: { projectId: string }) {
  const t = useTranslations('versions');
  const tProjects = useTranslations('projects.list');
  const tUi = useTranslations('ui');
  const router = useRouter();
  const queryClient = useQueryClient();
  const toaster = useToaster();
  const { tab, view } = readProjectView(useSearchParams());
  const project = useQuery({
    queryKey: projectKey(projectId),
    queryFn: () => fetchProject(projectId),
  });
  const total = useQuery({
    queryKey: catalogueTotalKey,
    queryFn: fetchIndicatorTotal,
    staleTime: Infinity,
  });
  const versions = useQuery({
    queryKey: versionsKey(projectId),
    queryFn: () => fetchVersions(projectId),
  });
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<VersionSummary | null>(null);
  const [deletingProject, setDeletingProject] = useState(false);
  const [failure, setFailure] = useState<
    'create.failed' | 'delete.failed' | 'delete.lastVersion' | 'deleteProject.failed' | null
  >(null);

  // After a dialog closes, focus goes back to the button that opened it.
  const opener = useRef<HTMLElement | null>(null);
  const listTitle = useRef<HTMLHeadingElement>(null);
  const anyOpen = creating || deleting !== null || deletingProject;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !anyOpen) {
      const button = opener.current;
      (button?.isConnected ? button : listTitle.current)?.focus();
    }
    wasOpen.current = anyOpen;
  }, [anyOpen]);

  const refresh = () => {
    // The project, its versions, the trend and the RM matrix all move with a new or a deleted version.
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
      setFailure('create.failed');
    },
  });
  const remove = useMutation({
    mutationFn: (versionId: string) => deleteVersion(projectId, versionId),
    onSuccess: (_data, versionId) => {
      // The card is about to leave the list, so focus lands on the list heading instead.
      opener.current = null;
      setDeleting(null);
      // The comparison, the trend and the RM matrix still name the deleted version. Drop them
      // first (the panel shows its skeleton) so nothing asks the api about it and fails.
      queryClient.removeQueries({
        queryKey: projectKey(projectId),
        predicate: ({ queryKey }) =>
          queryKey[2] === 'trend' ||
          queryKey[2] === 'indicator-rm' ||
          (queryKey[2] === 'compare' && queryKey.includes(versionId)),
      });
      refresh();
    },
    onError: (error) => {
      setDeleting(null);
      setFailure(
        error instanceof ApiError && error.code === 'last_version'
          ? 'delete.lastVersion'
          : 'delete.failed',
      );
    },
  });
  const removeProject = useDeleteProject();
  function confirmDeleteProject() {
    removeProject.mutate(projectId, {
      onSuccess: () => {
        setDeletingProject(false);
        // The dashboard figures and panels hold the deleted project too.
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        toaster.show({
          id: 'project-deleted',
          title: tProjects('deleted'),
          tone: 'success',
          duration: 6000,
        });
        router.replace('/dashboard');
      },
      onError: () => {
        setDeletingProject(false);
        setFailure('deleteProject.failed');
      },
    });
  }

  const open = (button: HTMLElement | null) => {
    opener.current = button;
  };
  const changeTab = (next: ProjectTab) => writeProjectView(next, view);

  // While the project is being deleted, the shared hook refetches it before the mutation ends and
  // gets a 404. Keep showing the page (the data stays) until the move to the dashboard.
  const deleted = removeProject.isPending || removeProject.isSuccess;

  if (project.isError && !deleted) {
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
        <ProjectHeader
          project={project.data}
          onDelete={(button) => {
            open(button);
            setDeletingProject(true);
          }}
        />
      ) : (
        <div aria-busy="true" className={styles.skeleton}>
          <Skeleton width="40%" height="2rem" />
          <Skeleton width="70%" height="1.25rem" />
        </div>
      )}

      {failure && (
        <Toast
          tone="error"
          title={failure === 'deleteProject.failed' ? tProjects('deleteFailed') : t(failure)}
          closeLabel={tUi('close')}
          onClose={() => setFailure(null)}
        />
      )}

      {versions.isError && !deleted ? (
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
          <ProjectTabs value={tab} count={versions.data.length} onChange={changeTab} />
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
                  onCreate={(button) => {
                    open(button);
                    setCreating(true);
                  }}
                  onShowVersions={() => changeTab('versions')}
                  indicatorTotal={total.data}
                />
              )
            ) : (
              <VersionsTab
                ref={listTitle}
                projectId={projectId}
                versions={versions.data}
                view={view}
                onViewChange={(next) => writeProjectView('versions', next)}
                onCreate={(button) => {
                  open(button);
                  setCreating(true);
                }}
                onDelete={(version, button) => {
                  open(button);
                  setDeleting(version);
                }}
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

      <ConfirmDialog
        open={deletingProject}
        destructive
        title={tProjects('deleteDialog.title')}
        confirmLabel={
          removeProject.isPending
            ? tProjects('deleteDialog.deleting')
            : tProjects('deleteDialog.confirm')
        }
        cancelLabel={tUi('cancel')}
        onConfirm={confirmDeleteProject}
        onCancel={() => setDeletingProject(false)}
      >
        {project.data && (
          <>
            <p>
              {tProjects('deleteDialog.body', {
                nickname: project.data.nickname,
                name: project.data.name,
              })}
            </p>
            <p>{tProjects('deleteDialog.research')}</p>
          </>
        )}
      </ConfirmDialog>
    </div>
  );
}
