import { execFileSync } from 'node:child_process';
import { Api } from './helpers/api';
import { ADMIN, USER } from './helpers/env';

const COMPOSE = [
  'compose',
  '--env-file',
  'compose.env',
  '-f',
  '../deploy/compose/compose.yaml',
  '-f',
  '../deploy/compose/compose.test.yaml',
  '--profile',
  'test',
];

/** Seed one user and one admin. Safe to run again: existing e-mails are kept. */
export default async function globalSetup() {
  const api = await Api.create();
  try {
    for (const who of [USER, ADMIN]) await api.register(who);
  } finally {
    await api.dispose();
  }
  // There is no admin sign-up path, so promote the account in the database.
  execFileSync(
    'docker',
    [
      ...COMPOSE,
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'cre_owner',
      '-d',
      'cre',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      `UPDATE account SET role = 'admin' WHERE email = '${ADMIN.email}'`,
    ],
    { stdio: 'inherit', cwd: import.meta.dirname },
  );
}
