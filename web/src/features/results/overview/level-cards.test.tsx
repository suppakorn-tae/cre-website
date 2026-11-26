import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { projectKey } from '@/features/versions/api';
import { mockProject, mockProjectId, mockVersions } from '@/features/versions/mocks';

import common from '../../../../messages/th/common.json';
import results from '../../../../messages/th/results.json';
import shell from '../../../../messages/th/shell.json';
import ui from '../../../../messages/th/ui.json';

import { mockResults } from './mocks';
import { ResultsPage } from './ResultsPage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), back: vi.fn(), push: vi.fn() }),
  usePathname: () => '/projects/p/versions/v/results',
  useSearchParams: () => new URLSearchParams(),
}));

const css = readFileSync(join(__dirname, 'results.module.css'), 'utf8');

function renderPage() {
  const [version] = mockVersions();
  const client = new QueryClient();
  const base = ['projects', mockProjectId, 'versions', version.id] as const;
  client.setQueryData(projectKey(mockProjectId), mockProject);
  client.setQueryData(base, version);
  client.setQueryData([...base, 'results'], mockResults(version.id));
  client.setQueryData(['catalogue', 'names'], new Map());
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="th" messages={{ results, common, ui, shell }}>
        <ResultsPage projectId={mockProjectId} versionId={version.id} />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe('results level cards', () => {
  it('wraps each of the five level cards with its level', () => {
    const html = renderPage();
    for (const level of ['VH', 'H', 'M', 'L', 'VL']) {
      expect(html).toMatch(new RegExp(`class="[^"]*count[^"]*" data-level="${level}"`));
    }
  });

  it('shows the level chip first, then the count and the unit', () => {
    const html = renderPage();
    for (const level of ['VH', 'H', 'M', 'L', 'VL']) {
      const card = new RegExp(
        `data-level="${level}"><p class="[^"]*countName[^"]*"><span class="[^"]*badge[^"]*"[^>]*>${level}</span><span aria-hidden="true"> – [^<]+</span></p><p class="[^"]*countValue[^"]*"><span class="[^"]*countNumber[^"]*">\\d+</span><span class="[^"]*countUnit[^"]*">ตัวชี้วัด</span>`,
      );
      expect(html).toMatch(card);
    }
  });

  it('names every level in full next to its code', () => {
    const html = renderPage();
    for (const name of [
      'ความเสี่ยงสูงมาก',
      'ความเสี่ยงสูง',
      'ความเสี่ยงปานกลาง',
      'ความเสี่ยงต่ำ',
      'ความเสี่ยงต่ำมาก',
    ]) {
      expect(html).toContain(` – ${name}</span>`);
    }
    expect(/\.countName\s*\{([^}]*)\}/.exec(css)?.[1]).toContain('--weight-bold');
  });

  it('colours the stripe of every level with its level token', () => {
    for (const level of ['VL', 'L', 'M', 'H', 'VH']) {
      const rule = new RegExp(`\\.count\\[data-level='${level}'\\]\\s*\\{([^}]*)\\}`).exec(css);
      expect(rule?.[1]).toContain(`var(--level-${level.toLowerCase()})`);
    }
  });

  it('styles the disclaimer as a warning', () => {
    const rule = /\.disclaimer\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toContain('--color-warning-bg');
    expect(rule).toContain('--color-warning-border');
  });
});
