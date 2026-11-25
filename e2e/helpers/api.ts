import { request, type APIRequestContext } from '@playwright/test';
import { BASE_URL } from '../playwright.config';
import { clearMail, readOtp } from './mailpit';

export type Credentials = { email: string; password: string };

export type ProjectInput = {
  name: string;
  nickname: string;
  island_code: string;
  type_code: string;
  start_date: string;
  end_date: string;
  value_baht: number;
  progress_pct?: number;
};

/** An API client on /api/v1 that keeps cookies and echoes the CSRF token. */
export class Api {
  private csrf = '';
  private constructor(readonly ctx: APIRequestContext) {}

  static async create(): Promise<Api> {
    const ctx = await request.newContext({ baseURL: BASE_URL, ignoreHTTPSErrors: true });
    const api = new Api(ctx);
    const res = await ctx.get('/api/v1/auth/csrf');
    api.csrf = ((await res.json()) as { csrf_token: string }).csrf_token;
    return api;
  }

  post(path: string, data: unknown) {
    return this.ctx.post(`/api/v1${path}`, { data, headers: { 'X-CSRF-Token': this.csrf } });
  }

  get(path: string) {
    return this.ctx.get(`/api/v1${path}`);
  }

  dispose() {
    return this.ctx.dispose();
  }

  /** Sign up by e-mail, reading the OTP from Mailpit. Returns false if the e-mail exists. */
  async register({ email, password }: Credentials): Promise<boolean> {
    await clearMail(email);
    const start = await this.post('/auth/register/start', {
      email,
      password,
      password_confirmation: password,
      retention_accepted: true,
      terms_accepted: true,
    });
    if (start.status() === 409) return false;
    if (!start.ok()) throw new Error(`register/start ${start.status()}: ${await start.text()}`);
    const verify = await this.post('/auth/register/verify', { email, otp: await readOtp(email) });
    if (!verify.ok()) throw new Error(`register/verify ${verify.status()}: ${await verify.text()}`);
    return true;
  }

  async login({ email, password }: Credentials) {
    const res = await this.post('/auth/login', { email, password });
    if (!res.ok()) throw new Error(`login ${res.status()}: ${await res.text()}`);
  }

  /** Create a project through the API and return its id. */
  async createProject(overrides: Partial<ProjectInput> = {}): Promise<string> {
    const body: ProjectInput = {
      name: 'E2E project',
      nickname: 'E2E',
      island_code: 'koh_samui',
      type_code: 'pier',
      start_date: '2026-01-01',
      end_date: '2026-12-31',
      value_baht: 1_000_000,
      progress_pct: 0,
      ...overrides,
    };
    const res = await this.post('/projects', body);
    if (res.status() !== 201) throw new Error(`createProject ${res.status()}: ${await res.text()}`);
    return ((await res.json()) as { id: string }).id;
  }
}

/** Log in as `who` and return an authenticated client. */
export async function loggedIn(who: Credentials): Promise<Api> {
  const api = await Api.create();
  await api.login(who);
  return api;
}
