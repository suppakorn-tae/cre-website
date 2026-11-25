import path from 'node:path';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

import { loadCatalogue } from './src/lib/i18n/catalogue';
import { assertNoMocksInProduction } from './src/lib/mocks/mock-mode';

// Mock mode skips the sign-in check, so a production build or server must not have it.
assertNoMocksInProduction();

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts');

const nextConfig: NextConfig = {
  // Self-contained server for the Docker runtime image (web/Dockerfile).
  output: 'standalone',
  // Trace from the repo root so backend/seed/cre-indicators.json (imported by
  // the mocks) and the pnpm workspace's node_modules are resolved the same way
  // locally and in the image build.
  outputFileTracingRoot: path.join(__dirname, '..'),
  cacheComponents: true,
  partialPrefetching: true,
  // msw/browser has a `node: null` export condition, which Turbopack applies
  // to the SSR pass of the (client-only, lazy) mock worker import.
  turbopack: {
    resolveAlias: { 'msw/browser': './node_modules/msw/lib/browser/index.js' },
  },
  // messages/th/<feature>.json merged once when the config loads (build/dev).
  env: {
    CRE_MESSAGES_TH: JSON.stringify(loadCatalogue(path.join(__dirname, 'messages'), 'th')),
  },
};

export default withNextIntl(nextConfig);
