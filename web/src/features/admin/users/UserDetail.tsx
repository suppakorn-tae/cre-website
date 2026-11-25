'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, ConfirmDialog, Skeleton, Toast } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { formatDate, formatNumber } from '@/lib/format/locale';

import {
  actionErrorKey,
  orderedMethods,
  useAdminUser,
  useOwnUserId,
  useUserAction,
  type UserAction,
  type UserRole,
} from './api';
import { RoleBadge, StatusBadge } from './UserBadges';
import styles from './users.module.css';

type Notice = { tone: 'success' | 'error'; text: string };

/** One user: account facts, counts, and the confirmed actions on the account. */
export function UserDetail({ userId }: { userId: string }) {
  const t = useTranslations('admin-users.detail');
  const tDialogs = useTranslations('admin-users.dialogs');
  const tNotices = useTranslations('admin-users.notices');
  const tErrors = useTranslations('admin-users.errors');
  const tMethods = useTranslations('admin-users.methods');
  const tRoles = useTranslations('admin-users.roles');
  const tUi = useTranslations('ui');
  const user = useAdminUser(userId);
  const ownId = useOwnUserId().data;
  const action = useUserAction(userId);
  const [picked, setPicked] = useState<UserRole | null>(null);
  const [pending, setPending] = useState<UserAction | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const breadcrumb = (current: string) => (
    <p className={styles.breadcrumb}>
      <Link href="/admin/users">{t('breadcrumbRoot')}</Link>
      <span aria-hidden="true"> / </span>
      <span>{current}</span>
    </p>
  );

  if (user.isPending) {
    return (
      <section className={styles.page}>
        <div className={styles.loading} role="status" aria-label={t('loading')}>
          <Skeleton />
          <Skeleton />
        </div>
      </section>
    );
  }

  if (user.isError || !user.data) {
    const missing = user.error instanceof ApiError && user.error.status === 404;
    return (
      <section className={styles.page}>
        {breadcrumb('')}
        <div className={styles.error} role="alert">
          <p>{missing ? t('notFound') : t('loadFailed')}</p>
          {missing ? (
            <Link href="/admin/users" className={styles.rowLink}>
              {t('backToList')}
            </Link>
          ) : (
            <Button variant="secondary" size="sm" onClick={() => user.refetch()}>
              {t('retry')}
            </Button>
          )}
        </div>
      </section>
    );
  }

  const u = user.data;
  const isOwn = u.id === ownId;
  const isDeleted = u.status === 'deleted';
  const locked = isOwn || isDeleted;
  const email = u.email ?? t('deletedTitle');
  const role = picked ?? u.role;
  const busy = action.isPending;

  function confirm() {
    if (!pending) return;
    const done = pending;
    action.mutate(done, {
      onSuccess: () => {
        setPicked(null);
        setNotice({
          tone: 'success',
          text: tNotices(
            done.kind === 'role'
              ? 'roleChanged'
              : done.kind === 'deactivate'
                ? 'deactivated'
                : done.kind === 'reactivate'
                  ? 'reactivated'
                  : 'deleted',
          ),
        });
      },
      onError: (error) => setNotice({ tone: 'error', text: tErrors(actionErrorKey(error)) }),
      onSettled: () => setPending(null),
    });
  }

  const dialog = (() => {
    switch (pending?.kind) {
      case 'role':
        return {
          title: tDialogs('role.title', { role: tRoles(pending.role) }),
          body: [tDialogs(pending.role === 'admin' ? 'role.toAdmin' : 'role.toUser', { email })],
          confirm: tDialogs('role.confirm'),
          destructive: false,
        };
      case 'deactivate':
        return {
          title: tDialogs('deactivate.title'),
          body: [tDialogs('deactivate.body', { email })],
          confirm: tDialogs('deactivate.confirm'),
          destructive: true,
        };
      case 'reactivate':
        return {
          title: tDialogs('reactivate.title'),
          body: [tDialogs('reactivate.body', { email })],
          confirm: tDialogs('reactivate.confirm'),
          destructive: false,
        };
      case 'delete':
        return {
          title: tDialogs('delete.title'),
          body: [tDialogs('delete.body', { email }), tDialogs('delete.kept')],
          confirm: tDialogs('delete.confirm'),
          destructive: true,
        };
      default:
        return null;
    }
  })();

  return (
    <section className={styles.page}>
      {breadcrumb(email)}
      <header className={styles.detailHead}>
        <h1 className={styles.title}>{email}</h1>
        <RoleBadge role={u.role} />
        <StatusBadge status={u.status} />
      </header>

      {notice && (
        <div className={styles.notice}>
          <Toast
            title={notice.text}
            tone={notice.tone}
            closeLabel={tUi('close')}
            onClose={() => setNotice(null)}
          />
        </div>
      )}
      {(isOwn || isDeleted) && (
        <p className={styles.lockNote}>{isOwn ? t('ownAccount') : t('deletedAccount')}</p>
      )}

      <div className={styles.detailGrid}>
        <div className={styles.detailMain}>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>{t('account.title')}</h2>
            <dl className={styles.facts}>
              <dt>{t('account.email')}</dt>
              <dd>{u.email ?? '–'}</dd>
              <dt>{t('account.organisation')}</dt>
              <dd>{u.organisation ?? '–'}</dd>
              <dt>{t('account.createdAt')}</dt>
              <dd>{formatDate(u.created_at)}</dd>
              <dt>{t('account.methods')}</dt>
              <dd>
                {u.sign_in_methods.length === 0
                  ? t('account.none')
                  : orderedMethods(u.sign_in_methods)
                      .map((m) => tMethods(m))
                      .join(', ')}
              </dd>
            </dl>
          </div>

          <div className={styles.counts}>
            <div className={styles.count}>
              <span className={styles.countLabel}>{t('counts.projects')}</span>
              <span className={styles.countValue}>{formatNumber(u.project_count)}</span>
            </div>
            <div className={styles.count}>
              <span className={styles.countLabel}>{t('counts.versions')}</span>
              <span className={styles.countValue}>{formatNumber(u.version_count)}</span>
            </div>
          </div>
          <p className={styles.privacy}>{t('privacy')}</p>
        </div>

        <div className={styles.detailSide}>
          <fieldset className={styles.card} disabled={locked}>
            <legend className={styles.cardTitle}>{t('role.title')}</legend>
            <div className={styles.radios} role="radiogroup" aria-label={t('role.legend')}>
              {(['user', 'admin'] as const).map((r) => (
                <label key={r} className={styles.radio}>
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setPicked(r)}
                  />
                  <span>{t(`role.${r}`)}</span>
                </label>
              ))}
            </div>
            <Button
              fullWidth
              disabled={locked || role === u.role || busy}
              onClick={() => setPending({ kind: 'role', role })}
            >
              {t('role.save')}
            </Button>
          </fieldset>

          <fieldset className={styles.card} disabled={locked}>
            <legend className={styles.cardTitle}>{t('status.title')}</legend>
            <p className={styles.hint}>
              {u.status === 'deactivated' ? t('status.deactivatedHint') : t('status.activeHint')}
            </p>
            {u.status === 'deactivated' ? (
              <Button
                variant="secondary"
                fullWidth
                disabled={locked || busy}
                onClick={() => setPending({ kind: 'reactivate' })}
              >
                {t('status.reactivate')}
              </Button>
            ) : (
              <Button
                variant="secondary"
                fullWidth
                disabled={locked || busy}
                onClick={() => setPending({ kind: 'deactivate' })}
              >
                {t('status.deactivate')}
              </Button>
            )}
          </fieldset>

          <fieldset className={styles.card} disabled={locked}>
            <legend className={`${styles.cardTitle} ${styles.danger}`}>{t('delete.title')}</legend>
            <p className={styles.hint}>{t('delete.hint')}</p>
            <Button
              variant="destructive"
              fullWidth
              disabled={locked || busy}
              onClick={() => setPending({ kind: 'delete' })}
            >
              {t('delete.action')}
            </Button>
          </fieldset>

          <p className={styles.hint}>{t('auditNote')}</p>
        </div>
      </div>

      <ConfirmDialog
        open={pending !== null}
        destructive={dialog?.destructive}
        title={dialog?.title ?? ''}
        confirmLabel={busy ? tDialogs('working') : (dialog?.confirm ?? '')}
        cancelLabel={tDialogs('cancel')}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      >
        {dialog?.body.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </ConfirmDialog>
    </section>
  );
}
