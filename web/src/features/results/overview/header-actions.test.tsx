import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { projectKey } from '@/features/versions/api';
import { mockProject, mockProjectId, mockVersions } from '@/features/versions/mocks';

import common from '../../../../messages/th/common.json';
import results from '../../../../messages/th/results.json';
import shell from '../../../../messages/th/shell.json';
import ui from '../../../../messages/th/ui.json';

import { mockResults } from './mocks';
import { ResultsPage } from './ResultsPage';

function renderPage() {
  const [version] = mockVersions();
  const client = new QueryClient();
  const base = ['projects', mockProjectId, 'versions', version.id] as const;
  client.setQueryData(projectKey(mockProjectId), mockProject);
  client.setQueryData(base, version);
  client.setQueryData([...base, 'results'], mockResults(version.id));
  client.setQueryData(['catalogue', 'names'], new Map());
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="th" messages={{ results, common, ui, shell }}>
        <ResultsPage projectId={mockProjectId} versionId={version.id} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
  return { html, versionId: version.id };
}

describe('results header actions', () => {
  it('links to the report page of the same version', () => {
    const { html, versionId } = renderPage();
    expect(html).toContain(`href="/projects/${mockProjectId}/versions/${versionId}/report"`);
    expect(html).toContain(results.page.reportAction);
  });

  it('offers the advice and strategy action', () => {
    const { html } = renderPage();
    expect(html).toContain(results.page.adviceAction.replace('&', '&amp;'));
  });
});
