import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { reportContextKey } from '@/features/reports/api';
import { ReportPage } from '@/features/reports/ReportPage';
import { projectKey } from '@/features/versions/api';
import { mockProject, mockProjectId, mockVersions } from '@/features/versions/mocks';

import common from '../../../../messages/th/common.json';
import reports from '../../../../messages/th/reports.json';
import results from '../../../../messages/th/results.json';
import shell from '../../../../messages/th/shell.json';
import ui from '../../../../messages/th/ui.json';

import { mockResults } from './mocks';
import { ResultsPage } from './ResultsPage';

const [version] = mockVersions();
const messages = { results, reports, common, ui, shell };

const wrap = (client: QueryClient, node: ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="th" messages={messages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

function currentStep(html: string): string {
  const start = html.indexOf('aria-current="step"');
  const end = html.indexOf('</li>', start);
  return html.slice(start, end).replace(/<[^>]+>/g, ' ');
}

describe('step indicator on results and report', () => {
  it('marks the results step on the results page', () => {
    const client = new QueryClient();
    const base = ['projects', mockProjectId, 'versions', version.id] as const;
    client.setQueryData(projectKey(mockProjectId), mockProject);
    client.setQueryData(base, version);
    client.setQueryData([...base, 'results'], mockResults(version.id));
    client.setQueryData(['catalogue', 'names'], new Map());
    const html = wrap(client, <ResultsPage projectId={mockProjectId} versionId={version.id} />);
    expect(html).toContain(shell.steps.label);
    expect(html).toContain(shell.steps.results);
    expect(currentStep(html)).toContain(shell.steps.results);
  });

  it('marks the report step on the report page', () => {
    const client = new QueryClient();
    client.setQueryData(reportContextKey(mockProjectId), {
      project: mockProject,
      versions: mockVersions(),
    });
    const html = wrap(client, <ReportPage projectId={mockProjectId} versionId={version.id} />);
    expect(html).toContain(shell.steps.label);
    expect(currentStep(html)).toContain(shell.steps.report);
  });
});
