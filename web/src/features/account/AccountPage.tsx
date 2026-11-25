'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Alert, Button, Skeleton } from '@/components/ui';
import '@/styles/tokens.css';

import { ACCOUNT_PATH, resultNotice } from './account';
import styles from './account.module.css';
import { accountApi } from './api';
import { DeleteSection } from './DeleteSection';
import { MethodsSection } from './MethodsSection';
import { PasswordSection } from './PasswordSection';
import { ProfileSection } from './ProfileSection';

/** "My account" page (UC-04): profile, sign-in methods, password, delete. */
export function AccountPage() {
  const t = useTranslations('account');
  const router = useRouter();
  const result = useSearchParams().get('result');
  // The callback result is read once, then removed from the address.
  const [initialResult] = useState(result);
  const notice = resultNotice(initialResult);
  const account = useQuery({ queryKey: ['account'], queryFn: accountApi.get });

  useEffect(() => {
    if (initialResult) router.replace(ACCOUNT_PATH);
  }, [initialResult, router]);

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </header>
      {notice && (
        <Alert tone={notice.tone === 'success' ? 'success' : 'error'}>
          {t(`result.${notice.key}`)}
        </Alert>
      )}
      {account.isPending && (
        <div className={styles.loading} role="status" aria-label={t('loading')}>
          <Skeleton height={264} />
          <Skeleton height={240} />
        </div>
      )}
      {account.isError && (
        <Alert
          tone="error"
          action={
            <Button variant="secondary" size="sm" onClick={() => account.refetch()}>
              {t('retry')}
            </Button>
          }
        >
          {t('loadFailed')}
        </Alert>
      )}
      {account.data && (
        <>
          <ProfileSection account={account.data} />
          <MethodsSection account={account.data} />
          {account.data.sign_in_methods.password && <PasswordSection />}
          <DeleteSection
            account={account.data}
            reauthenticated={initialResult === 'reauthenticated'}
          />
        </>
      )}
    </div>
  );
}
