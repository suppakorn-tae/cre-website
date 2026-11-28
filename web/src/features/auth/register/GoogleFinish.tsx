'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { IconBuilding } from '@tabler/icons-react';
import { Alert, Button, GoogleMark, Input } from '@/components/ui';
import { clearClientData } from '@/features/shell/logout';

import { AuthApiError, completeGoogleSignup, getGooglePending, refreshCsrf } from './api';
import { AuthShell } from './AuthShell';
import { ConsentCheckboxes } from './ConsentCheckboxes';
import { AFTER_SIGNUP_PATH, googleReturnView, REGISTER_PATH } from './google';
import styles from './register.module.css';

/** Landing page of the Google redirect: the result decides what shows. */
export function GoogleFinish() {
  const t = useTranslations('auth.register.google');
  const router = useRouter();
  const result = useSearchParams().get('result');
  const view = googleReturnView(result);

  useEffect(() => {
    if (view.kind === 'redirect') router.replace(AFTER_SIGNUP_PATH);
  }, [view.kind, router]);

  return (
    <AuthShell>
      {view.kind === 'finish' && <FinishForm />}
      {view.kind === 'redirect' && <Alert tone="success">{t('result.redirecting')}</Alert>}
      {view.kind === 'message' && (
        <>
          <Alert tone="error">{t(`result.${view.key}`)}</Alert>
          <Link href={REGISTER_PATH} className={styles.link}>
            {t('restart')}
          </Link>
        </>
      )}
    </AuthShell>
  );
}

function FinishForm() {
  const t = useTranslations('auth.register');
  const tCommon = useTranslations('common.errors');
  const tUi = useTranslations('ui');
  const router = useRouter();
  const queryClient = useQueryClient();
  const [organisation, setOrganisation] = useState('');
  const [retention, setRetention] = useState(false);
  const [terms, setTerms] = useState(false);

  const pending = useQuery({ queryKey: ['auth', 'google-pending'], queryFn: getGooglePending });
  const complete = useMutation({
    mutationFn: () =>
      completeGoogleSignup({
        organisation: organisation.trim() || undefined,
        retention_accepted: retention,
        terms_accepted: terms,
      }),
    onSuccess: async () => {
      await refreshCsrf();
      clearClientData(queryClient);
      router.replace(AFTER_SIGNUP_PATH);
    },
  });

  if (pending.isPending) return <p className={styles.subtitle}>{t('google.loading')}</p>;
  if (pending.isError) {
    return (
      <>
        <Alert tone="error">{t('google.expired')}</Alert>
        <Link href={REGISTER_PATH} className={styles.link}>
          {t('google.restart')}
        </Link>
      </>
    );
  }

  const accepted = retention && terms;
  const failed = complete.error;
  const failedText =
    failed instanceof AuthApiError && failed.status === 404
      ? t('google.expired')
      : failed instanceof TypeError
        ? tCommon('network')
        : failed
          ? tCommon('unknown')
          : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (accepted) complete.mutate();
  }

  return (
    <>
      <h1 className={styles.title}>{t('google.title')}</h1>
      <p className={styles.subtitle}>{t('google.subtitle')}</p>
      <div className={styles.account}>
        <span className={styles.accountMark}>
          <GoogleMark size={18} />
        </span>
        <span className={styles.accountText}>
          <span className={styles.accountLabel}>{t('google.account')}</span>
          <span>{pending.data.email}</span>
        </span>
      </div>
      <form className={styles.form} onSubmit={submit} noValidate>
        {failedText && <Alert tone="error">{failedText}</Alert>}
        <Input
          label={t('google.organisation')}
          optionalLabel={tUi('optional')}
          autoComplete="organization"
          placeholder={t('google.organisationPlaceholder')}
          icon={IconBuilding}
          value={organisation}
          maxLength={200}
          onChange={(e) => setOrganisation(e.target.value)}
        />
        <ConsentCheckboxes
          retention={retention}
          terms={terms}
          onRetention={setRetention}
          onTerms={setTerms}
        />
        <div className={styles.actions}>
          <Link href={REGISTER_PATH} className={styles.cancel}>
            {t('google.cancel')}
          </Link>
          <Button type="submit" size="lg" disabled={!accepted || complete.isPending}>
            {complete.isPending ? t('google.submitting') : t('google.submit')}
          </Button>
        </div>
        {!accepted && <p className={styles.hint}>{t('google.acceptBoth')}</p>}
      </form>
    </>
  );
}
