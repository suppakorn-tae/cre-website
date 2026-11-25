'use client';

import { IconBuilding, IconMail, IconPlus, IconTrash, IconX } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  Alert,
  Button,
  CheckboxGroup,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FieldError,
  FieldOk,
  GoogleMark,
  Icon,
  IconButton,
  Input,
  KpiCard,
  LEVELS,
  LevelBadge,
  NumberInput,
  Pagination,
  PasswordInput,
  SearchInput,
  Select,
  Skeleton,
  Stepper,
  Tabs,
  Toast,
  UnitPicker,
  type UnitValue,
} from '@/components/ui';
import '@/styles/tokens.css';

import { RadixExamples } from './radix-examples';

type Row = { id: string; name: string; value: string; progress: string };

// Review page for the shared kit. Dev-only: the (dev) layout 404s in production.
export default function ComponentsPage() {
  const t = useTranslations('ui');
  const [tab, setTab] = useState('overview');
  const [page, setPage] = useState(3);
  const [options, setOptions] = useState<string[]>(['B']);
  const [cost, setCost] = useState<UnitValue>({ amount: '1250000', unit: 'baht' });
  const [time, setTime] = useState<UnitValue>({ amount: '120', unit: 'percent' });
  const [measured, setMeasured] = useState('8.5');
  const [selectedKpi, setSelectedKpi] = useState('risk');
  const [dialog, setDialog] = useState(false);
  const [neutralDialog, setNeutralDialog] = useState(false);
  const [password, setPassword] = useState('');

  const rows: Row[] = [
    { id: '1', name: t('dev.project1'), value: '48.5M', progress: '45%' },
    { id: '2', name: t('dev.project2'), value: '35M', progress: '100%' },
  ];
  const steps = ['project', 'assessment', 'results', 'strategy', 'report'].map((id) => ({
    id,
    label: t(`stepper.${id}`),
  }));
  const tabs = [
    { id: 'overview', label: t('dev.tabOverview') },
    { id: 'details', label: t('dev.tabDetails') },
    { id: 'heat', label: t('dev.tabHeatMap') },
    { id: 'high', label: t('dev.tabHighRisk'), count: 13 },
  ];
  const units = (second: string) => [
    { value: second, label: t(`dev.${second}`) },
    { value: 'percent', label: t('dev.percent') },
  ];

  return (
    <main
      style={{ maxWidth: 'var(--container-max)', margin: '0 auto', padding: 'var(--margin-page)' }}
    >
      <h1>{t('dev.title')}</h1>
      <p>{t('dev.intro')}</p>

      <h2>{t('dev.buttons')}</h2>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button>{t('dev.save')}</Button>
        <Button variant="secondary">{t('dev.view')}</Button>
        <Button variant="ghost">{t('dev.versions')}</Button>
        <Button variant="destructive">{t('dev.deleteProject')}</Button>
        <Button disabled>{t('dev.save')}</Button>
        <Button size="sm">{t('dev.save')}</Button>
        <Button size="lg">{t('dev.save')}</Button>
      </div>

      <h2>{t('dev.fields')}</h2>
      <div style={{ display: 'grid', gap: 16, maxWidth: 480 }}>
        <Input
          label={t('dev.emailLabel')}
          helper={t('dev.emailHelper')}
          required
          type="email"
          icon={IconMail}
        />
        <div style={{ display: 'grid', gap: 4 }}>
          <label htmlFor="dev-password">{t('dev.passwordLabel')}</label>
          <PasswordInput
            id="dev-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            labels={{ show: t('password.show'), hide: t('password.hide') }}
          />
        </div>
        <SearchInput label={t('dev.searchLabel')} placeholder={t('dev.searchPlaceholder')} />
        <Input label={t('dev.islandLabel')} icon={IconBuilding} defaultValue={t('dev.project1')} />
        <Input
          label={t('dev.emailLabel')}
          error={t('dev.emailError')}
          optionalLabel={t('optional')}
          defaultValue="name@company"
        />
        <NumberInput
          label={t('dev.measuredLabel')}
          suffix={t('dev.measuredUnit')}
          value={measured}
          onChange={setMeasured}
        />
        <Select
          label={t('dev.islandLabel')}
          placeholder={t('dev.islandPlaceholder')}
          options={[
            { value: '1', label: t('dev.island1') },
            { value: '2', label: t('dev.island2') },
            { value: '3', label: t('dev.island3') },
          ]}
        />
        <UnitPicker
          label={t('dev.costLabel')}
          helper={t('dev.costHelper')}
          unitsLabel={t('dev.unitsLabel')}
          units={units('baht')}
          value={cost}
          onChange={setCost}
          required
        />
        <UnitPicker
          label={t('dev.timeLabel')}
          error={t('dev.timeError')}
          unitsLabel={t('dev.unitsLabel')}
          units={units('days')}
          value={time}
          onChange={setTime}
          required
        />
      </div>

      <h2>{t('dev.selection')}</h2>
      <CheckboxGroup
        legend={t('dev.optionsLegend')}
        helper={t('dev.optionsHelper')}
        value={options}
        onChange={setOptions}
        options={'ABCDEFGHI'.split('').map((c) => ({ value: c, label: c, exclusive: c === 'A' }))}
      />

      <h2>{t('dev.navigation')}</h2>
      <Stepper
        steps={steps}
        current={2}
        label={t('stepper.flowLabel')}
        doneLabel={t('stepper.done')}
      />
      <Tabs items={tabs} value={tab} onChange={setTab} label={t('dev.tabsLabel')} idPrefix="demo" />
      <Pagination
        page={page}
        pageCount={12}
        onChange={setPage}
        labels={{
          nav: t('pagination.nav'),
          previous: t('pagination.previous'),
          next: t('pagination.next'),
          page: (n) => t('pagination.page', { n }),
        }}
      />

      <h2>{t('dev.data')}</h2>
      <div
        style={{
          display: 'grid',
          gap: 16,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}
      >
        <KpiCard
          label={t('dev.kpiHighRisk')}
          value="25"
          unit={t('dev.kpiHighRiskUnit')}
          note={t('dev.kpiHighRiskNote')}
          selected={selectedKpi === 'risk'}
          selectedLabel={t('dev.kpiShowing')}
          onSelect={() => setSelectedKpi('risk')}
        />
        <KpiCard
          label={t('dev.kpiProjects')}
          value="3"
          unit={t('dev.kpiProjectsUnit')}
          note={t('dev.kpiProjectsNote')}
          selected={selectedKpi === 'projects'}
          selectedLabel={t('dev.kpiShowing')}
          onSelect={() => setSelectedKpi('projects')}
        />
      </div>
      <p style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {LEVELS.map((l) => (
          <LevelBadge
            key={l}
            level={l}
            label={t(`levels.${l}`)}
            count={l === 'H' ? 11 : undefined}
          />
        ))}
        {LEVELS.map((l) => (
          <LevelBadge key={`s-${l}`} level={l} variant="solid" label={t(`levels.${l}`)} />
        ))}
      </p>
      <DataTable
        caption={t('dev.tableCaption')}
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: 'name', header: t('dev.colProject'), primary: true, render: (r) => r.name },
          { key: 'value', header: t('dev.colValue'), align: 'end', render: (r) => r.value },
          { key: 'progress', header: t('dev.colProgress'), render: (r) => r.progress },
          {
            key: 'risk',
            header: t('dev.colHighRisk'),
            render: () => <LevelBadge level="H" count={11} label={t('levels.H')} />,
          },
        ]}
      />
      <EmptyState
        icon={IconBuilding}
        title={t('dev.emptyTitle')}
        description={t('dev.emptyText')}
        action={<Button icon={<Icon icon={IconPlus} size={18} />}>{t('dev.addProject')}</Button>}
      />
      <div aria-busy="true" style={{ display: 'grid', gap: 8, maxWidth: 360 }}>
        <Skeleton height={20} />
        <Skeleton width="60%" height={20} />
      </div>

      <h2>{t('dev.alerts')}</h2>
      <div style={{ display: 'grid', gap: 12, maxWidth: 640 }}>
        {(['info', 'success', 'warning', 'error'] as const).map((tone) => (
          <Alert
            key={tone}
            tone={tone}
            title={t(`dev.alert${tone[0].toUpperCase()}${tone.slice(1)}Title`)}
            onClose={tone === 'info' || tone === 'success' ? () => {} : undefined}
            closeLabel={t('toastClose')}
          >
            {t(`dev.alert${tone[0].toUpperCase()}${tone.slice(1)}Text`)}
          </Alert>
        ))}
      </div>
      <h2>{t('dev.fieldMessages')}</h2>
      <div style={{ display: 'grid', gap: 8 }}>
        <FieldError>{t('dev.emailError')}</FieldError>
        <FieldOk>{t('dev.fieldOk')}</FieldOk>
      </div>
      <h2>{t('dev.iconButtons')}</h2>
      <p style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <IconButton icon={IconX} label={t('dev.iconButtonLabel')} />
        <GoogleMark size={20} />
      </p>

      <h2>{t('dev.feedback')}</h2>
      <div style={{ display: 'grid', gap: 12 }}>
        <Toast
          title={t('dev.toastTitle')}
          description={t('dev.toastText')}
          closeLabel={t('toastClose')}
          onClose={() => {}}
        />
        <Toast
          tone="error"
          title={t('dev.toastErrorTitle')}
          description={t('dev.toastErrorText')}
        />
      </div>
      <p style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" onClick={() => setDialog(true)}>
          {t('dev.dialogOpen')}
        </Button>
        <Button variant="secondary" onClick={() => setNeutralDialog(true)}>
          {t('dev.dialogNeutralOpen')}
        </Button>
      </p>
      <h2>{t('dev.primitives')}</h2>
      <p>{t('dev.primitivesIntro')}</p>
      <RadixExamples />
      <ConfirmDialog
        open={neutralDialog}
        title={t('dev.dialogNeutralTitle')}
        confirmLabel={t('dev.dialogNeutralConfirm')}
        cancelLabel={t('cancel')}
        closeLabel={t('close')}
        onConfirm={() => setNeutralDialog(false)}
        onCancel={() => setNeutralDialog(false)}
      >
        <p>{t('dev.dialogNeutralBody')}</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog}
        destructive
        icon={<Icon icon={IconTrash} size={20} />}
        confirmIcon={<Icon icon={IconTrash} size={18} />}
        closeLabel={t('close')}
        title={t('dev.dialogTitle')}
        confirmLabel={t('dev.deleteProject')}
        cancelLabel={t('cancel')}
        onConfirm={() => setDialog(false)}
        onCancel={() => setDialog(false)}
      >
        <p>{t('dev.dialogBody1')}</p>
        <p>{t('dev.dialogBody2')}</p>
      </ConfirmDialog>
    </main>
  );
}
