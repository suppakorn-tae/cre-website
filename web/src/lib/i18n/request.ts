import { getRequestConfig } from 'next-intl/server';

import { defaultLocale, timeZone } from './config';

// The merged catalogue is injected by next.config.ts at build time.
export default getRequestConfig(async () => ({
  locale: defaultLocale,
  timeZone,
  messages: JSON.parse(process.env.CRE_MESSAGES_TH ?? '{}'),
}));
