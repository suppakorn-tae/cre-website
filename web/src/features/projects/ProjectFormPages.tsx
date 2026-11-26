'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { ProjectSteps } from '@/features/shell/ProjectSteps';

import { useProject } from './api';
import { ProjectForm } from './ProjectForm';
import { ProjectMocks } from './ProjectMocks';
import styles from './projects.module.css';

function Head({ title, subtitle, current }: { title: string; subtitle: string; current: string }) {
  const t = useTranslations('projects.form');
  return (
    <>
      <nav aria-label={t('breadcrumbLabel')} className={styles.breadcrumb}>
        <Link href="/dashboard">{t('breadcrumbRoot')}</Link>
        <span aria-hidden="true"> / </span>
        <span>{current}</span>
      </nav>
      <header className={styles.pageHead}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
      </header>
    </>
  );
}

export function CreateProjectPage() {
  const t = useTranslations('projects.form');
  return (
    <ProjectMocks>
      <Head
        title={t('createTitle')}
        subtitle={t('createSubtitle')}
        current={t('breadcrumbCreate')}
      />
      <div className={styles.steps}>
        <ProjectSteps current="project" />
      </div>
      <ProjectForm />
    </ProjectMocks>
  );
}

export function EditProjectPage({ projectId }: { projectId: string }) {
  return (
    <ProjectMocks>
      <EditLoader projectId={projectId} />
    </ProjectMocks>
  );
}

function EditLoader({ projectId }: { projectId: string }) {
  const t = useTranslations('projects.form');
  const project = useProject(projectId);

  if (project.isPending) {
    return (
      <div className={styles.status} role="status">
        <Skeleton />
        <Skeleton />
      </div>
    );
  }
  if (project.isError) {
    const missing = project.error instanceof ApiError && project.error.status === 404;
    return (
      <div className={styles.status} role="alert">
        <p>{missing ? t('notFound') : t('loadFailed')}</p>
        <Link href="/projects" className={styles.cancelLink}>
          {t('backToList')}
        </Link>
        {!missing && (
          <Button variant="secondary" size="sm" onClick={() => project.refetch()}>
            {t('retryLabel')}
          </Button>
        )}
      </div>
    );
  }
  return (
    <>
      <Head
        title={t('editTitle')}
        subtitle={t('editSubtitle')}
        current={`${project.data.nickname} ${project.data.name}`}
      />
      <div className={styles.steps}>
        <ProjectSteps current="project" projectId={projectId} />
      </div>
      <ProjectForm project={project.data} />
    </>
  );
}
