// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import common from '../../../../messages/th/common.json';
import adminAudit from '../../../../messages/th/admin-audit.json';
import ui from '../../../../messages/th/ui.json';

import { AuditFilters } from './AuditFilters';
import { AUDIT_ACTIONS, EMPTY_FILTERS, TARGET_TYPES } from './filters';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
afterEach(cleanup);

const mount = () =>
  render(
    <NextIntlClientProvider locale="th" messages={{ 'admin-audit': adminAudit, common, ui }}>
      <QueryClientProvider client={new QueryClient()}>
        <AuditFilters values={EMPTY_FILTERS} onChange={() => {}} />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );

describe('AuditFilters pickers', () => {
  it('offers a Thai label for every action', async () => {
    mount();
    fireEvent.click(screen.getByRole('combobox', { name: 'การกระทำ' }));
    const listed = (await screen.findAllByRole('option')).map((o) => o.textContent);
    for (const action of AUDIT_ACTIONS) expect(listed).toContain(adminAudit.actions[action]);
  });

  it('offers a Thai label for every target type', async () => {
    mount();
    fireEvent.click(screen.getByRole('combobox', { name: 'ประเภทเป้าหมาย' }));
    const listed = (await screen.findAllByRole('option')).map((o) => o.textContent);
    for (const type of TARGET_TYPES) expect(listed).toContain(adminAudit.targets[type]);
  });
});
