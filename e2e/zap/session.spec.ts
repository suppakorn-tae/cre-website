import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loggedIn } from '../helpers/api';
import { USER } from '../helpers/env';

// Writes the Cookie header of a signed-in e2e user to ZAP_COOKIE_FILE, outside
// the uploaded reports (scan.sh sets it to a temporary directory). scan.sh
// hands it to ZAP, which sends it on every request of the authenticated scans.
test('sign in as the e2e user and save the session cookie', async () => {
  const file = process.env.ZAP_COOKIE_FILE;
  if (!file) throw new Error('ZAP_COOKIE_FILE is not set (run it through scan.sh)');
  const api = await loggedIn(USER);
  const cookies = (await api.ctx.storageState()).cookies;
  await api.dispose();
  expect(cookies.map((c) => c.name)).toContain('cre_session');
  // Only the session: ZAP splits its options on spaces, so no "a=1; b=2" header.
  const header = `cre_session=${cookies.find((c) => c.name === 'cre_session')!.value}`;
  writeFileSync(file, header);
});
