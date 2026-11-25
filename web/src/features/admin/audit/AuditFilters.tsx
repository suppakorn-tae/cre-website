'use client';

import { useTranslations } from 'next-intl';

import { Button, Input, Select } from '@/components/ui';

import { useAuditAdmins } from './api';
import {
  AUDIT_ACTIONS,
  EMPTY_FILTERS,
  TARGET_TYPES,
  dateProblem,
  hasFilters,
  type FilterValues,
} from './filters';
import styles from './audit.module.css';

type Props = {
  values: FilterValues;
  onChange: (values: FilterValues) => void;
};

/** Admin, action, target and date range filters (UC-19). */
export function AuditFilters({ values, onChange }: Props) {
  const t = useTranslations('admin-audit');
  const admins = useAuditAdmins();
  const problem = dateProblem(values);
  const set = (patch: Partial<FilterValues>) => onChange({ ...values, ...patch });

  return (
    <form
      className={styles.filters}
      aria-label={t('filters.label')}
      onSubmit={(e) => e.preventDefault()}
    >
      <Select
        label={t('filters.admin')}
        placeholder={t('filters.adminAll')}
        value={values.adminId}
        onChange={(e) => set({ adminId: e.target.value })}
        options={(admins.data ?? []).map((a) => ({
          value: a.id,
          label: a.email ?? t('table.anonymised'),
        }))}
      />
      <Select
        label={t('filters.action')}
        placeholder={t('filters.actionAll')}
        value={values.action}
        onChange={(e) => set({ action: e.target.value })}
        options={AUDIT_ACTIONS.map((a) => ({ value: a, label: t(`actions.${a}`) }))}
      />
      <Select
        label={t('filters.targetType')}
        placeholder={t('filters.targetTypeAll')}
        value={values.targetType}
        onChange={(e) =>
          set({ targetType: e.target.value, targetId: e.target.value ? values.targetId : '' })
        }
        options={TARGET_TYPES.map((x) => ({ value: x, label: t(`targets.${x}`) }))}
      />
      <Input
        label={t('filters.targetId')}
        placeholder={t('filters.targetIdPlaceholder')}
        value={values.targetId}
        disabled={values.targetType === ''}
        onChange={(e) => set({ targetId: e.target.value })}
        autoComplete="off"
      />
      <Input
        label={t('filters.from')}
        placeholder={t('filters.datePlaceholder')}
        inputMode="numeric"
        value={values.from}
        onChange={(e) => set({ from: e.target.value })}
        error={problem === 'from' ? t('filters.dateInvalid') : undefined}
        autoComplete="off"
      />
      <Input
        label={t('filters.to')}
        placeholder={t('filters.datePlaceholder')}
        inputMode="numeric"
        value={values.to}
        onChange={(e) => set({ to: e.target.value })}
        error={
          problem === 'to'
            ? t('filters.dateInvalid')
            : problem === 'range'
              ? t('filters.rangeInvalid')
              : undefined
        }
        autoComplete="off"
      />
      {hasFilters(values) && (
        <Button
          variant="ghost"
          size="sm"
          className={styles.clear}
          onClick={() => onChange(EMPTY_FILTERS)}
        >
          {t('filters.clear')}
        </Button>
      )}
    </form>
  );
}
