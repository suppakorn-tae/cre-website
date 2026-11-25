'use client';

import { IconBuilding, IconMail } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Alert, Button, Input } from '@/components/ui';

import { organisationError } from './account';
import styles from './account.module.css';
import { accountApi, type Account } from './api';
import { useFailureText } from './useFailureText';

/** E-mail (read only) and the optional organisation (UC-04 2). */
export function ProfileSection({ account }: { account: Account }) {
  const t = useTranslations('account.profile');
  const failureText = useFailureText();
  const queryClient = useQueryClient();
  const [organisation, setOrganisation] = useState(account.organisation ?? '');
  const [fieldError, setFieldError] = useState<string>();
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () => accountApi.updateOrganisation(organisation.trim()),
    onSuccess: (next) => {
      queryClient.setQueryData(['account'], next);
      setOrganisation(next.organisation ?? '');
      setSaved(true);
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    const problem = organisationError(organisation);
    setFieldError(problem && t(problem));
    if (!problem) save.mutate();
  }

  return (
    <section className={styles.card} aria-labelledby="account-profile">
      <h2 id="account-profile" className={styles.cardTitle}>
        {t('title')}
      </h2>
      <Input
        label={t('email')}
        icon={IconMail}
        value={account.email}
        disabled
        readOnly
        helper={t('emailHelper')}
      />
      <form className={styles.inlineForm} onSubmit={submit} noValidate>
        <Input
          className={styles.grow}
          label={t('organisation')}
          optionalLabel={t('optional')}
          placeholder={t('organisationPlaceholder')}
          icon={IconBuilding}
          autoComplete="organization"
          value={organisation}
          onChange={(e) => {
            setOrganisation(e.target.value);
            setSaved(false);
            setFieldError(undefined);
          }}
          error={fieldError ?? (save.isError ? failureText(save.error) : undefined)}
        />
        <Button type="submit" variant="secondary" disabled={save.isPending}>
          {save.isPending ? t('saving') : t('save')}
        </Button>
      </form>
      {saved && <Alert tone="success">{t('saved')}</Alert>}
    </section>
  );
}
