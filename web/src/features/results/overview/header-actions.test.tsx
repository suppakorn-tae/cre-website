import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { projectKey } from '@/features/versions/api';
import { mockProject, mockProjectId, mockVersions } from '@/features/versions/mocks';

import common from '../../../../messages/th/common.json';
import reports from '../../../../messages/th/reports.json';
import results from '../../../../messages/th/results.json';
import shell from '../../../../messages/th/shell.json';
import ui from '../../../../messages/th/ui.json';

import { mockResults } from './mocks';
import { ResultsPage } from './ResultsPage';
import { parseTab } from './rules';

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => '/projects/p/versions/v/results',
  useSearchParams: () => new URLSearchParams(nav.query),
}));

function renderPage(query = '') {
  nav.query = query;
  const [version] = mockVersions();
  const client = new QueryClient();
  const base = ['projects', mockProjectId, 'versions', version.id] as const;
  client.setQueryData(projectKey(mockProjectId), mockProject);
  client.setQueryData(base, version);
  client.setQueryData([...base, 'results'], mockResults(version.id));
  client.setQueryData(['catalogue', 'names'], new Map());
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="th" messages={{ results, reports, common, ui, shell }}>
        <ResultsPage projectId={mockProjectId} versionId={version.id} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { html, versionId: version.id };
}

describe('results header actions', () => {
  it('has a report button that builds the PDF in place', () => {
    const { html } = renderPage();
    expect(html).toContain(reports.action.label);
    expect(html).toMatch(/<button[^>]*data-report="idle"/);
    expect(html).not.toContain('/report');
  });

  it('links the advice and strategy action to the plan page', () => {
    const { html, versionId } = renderPage();
    expect(html).toContain(results.page.adviceAction.replace('&', '&amp;'));
    expect(html).toContain(`href="/projects/${mockProjectId}/versions/${versionId}/plan"`);
  });
});

describe('results tab query', () => {
  beforeEach(() => {
    nav.replace.mockClear();
  });

  it('opens the advice tab from ?tab=hvh', () => {
    const { html } = renderPage('tab=hvh');
    expect(html).toContain('id="results-panel-hvh"');
  });

  it('opens the overview without a query', () => {
    expect(renderPage().html).toContain('id="results-panel-overview"');
  });

  it('falls back to the overview for an unknown tab', () => {
    expect(renderPage('tab=nope').html).toContain('id="results-panel-overview"');
  });
});

describe('parseTab', () => {
  it('accepts known tabs only', () => {
    expect(parseTab('hvh')).toBe('hvh');
    expect(parseTab('heatmap')).toBe('heatmap');
    expect(parseTab('advice')).toBe('overview');
    expect(parseTab(null)).toBe('overview');
    expect(parseTab(undefined)).toBe('overview');
  });
});
