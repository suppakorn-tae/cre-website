import { inflateRawSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';
import { Api, loggedIn } from '../../helpers/api';
import { ADMIN } from '../../helpers/env';

/** Write on /api/v1 with a fresh CSRF token (Api.post keeps the pre-login one, which goes stale). */
export async function send(
  api: Api,
  method: 'post' | 'put' | 'patch' | 'delete',
  path: string,
  data?: unknown,
) {
  const csrf = ((await (await api.ctx.get('/api/v1/auth/csrf')).json()) as { csrf_token: string })
    .csrf_token;
  return api.ctx[method](`/api/v1${path}`, { data, headers: { 'X-CSRF-Token': csrf } });
}

export const adminApi = () => loggedIn(ADMIN);

export async function json<T>(res: Awaited<ReturnType<Api['get']>>, status = 200): Promise<T> {
  expect(res.status(), await res.text()).toBe(status);
  return (await res.json()) as T;
}

/** Navigate without waiting for the load event, and retry: the host is loaded. */
export async function go(page: Page, url: string) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    } catch (err) {
      if (attempt === 5) throw err;
    }
  }
}

export type AuditItem = {
  id: number;
  action: string;
  target_type: string;
  target_id: string;
  admin_email: string | null;
};

/** Audit entries of one action on one target. */
export async function auditFor(
  api: Api,
  action: string,
  targetType: 'account' | 'indicator' | 'export',
  targetId: string,
) {
  const res = await json<{ items: AuditItem[] }>(
    await api.get(
      `/admin/audit-log?action=${action}&target_type=${targetType}&target_id=${targetId}&page_size=100`,
    ),
  );
  return res.items.filter((i) => i.target_id === targetId && i.action === action);
}

/** Read every file of a ZIP (stored or deflated) from its central directory. */
export function unzip(zip: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  let eocd = zip.length - 22;
  while (eocd >= 0 && zip.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a zip file');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const local = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const raw = zip.subarray(dataStart, dataStart + size);
    if (!name.endsWith('/')) files.set(name, method === 0 ? raw : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** An answer in percent units; EC-MG-1 with these inputs scores VH (engine golden). */
export type Answer = { code: string; x: number; y1: number; y2: number; y3: string[] };
export const VH_ANSWER: Answer = { code: 'EC-MG-1', x: 8.41, y1: 70, y2: 66, y3: ['G', 'C'] };
export const answerBody = (a: Answer) => ({
  indicator_code: a.code,
  x: a.x,
  y1: { value: a.y1, unit: 'percent' },
  y2: { value: a.y2, unit: 'percent' },
  y3: a.y3,
});
