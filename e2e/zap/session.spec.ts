import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { loggedIn } from '../helpers/api';
import { USER } from '../helpers/env';

// Writes the Cookie header of a signed-in e2e user to out/cookie.txt. scan.sh
// hands it to ZAP, which sends it on every request of the authenticated scans.
test('sign in as the e2e user and save the session cookie', async () => {
  const api = await loggedIn(USER);
  const cookies = (await api.ctx.storageState()).cookies;
  await api.dispose();
  expect(cookies.map((c) => c.name)).toContain('cre_session');
  mkdirSync(`${import.meta.dirname}/out`, { recursive: true });
  // Only the session: ZAP splits its options on spaces, so no "a=1; b=2" header.
  const header = `cre_session=${cookies.find((c) => c.name === 'cre_session')!.value}`;
  writeFileSync(`${import.meta.dirname}/out/cookie.txt`, header);
});
