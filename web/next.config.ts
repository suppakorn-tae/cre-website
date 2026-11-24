import path from 'node:path';

import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

import { loadCatalogue } from './src/lib/i18n/catalogue';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n/request.ts');

const nextConfig: NextConfig = {
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
