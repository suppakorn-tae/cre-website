// k6 load test of the interactive endpoints (IO-78, NFR-04: p95 < 1 s).
// One scenario per endpoint, all running at the same time (mixed workload).
// Every VU is one seeded user (loadtest/seed.sql) with its own cookie jar.
import http from 'k6/http';
import { sleep } from 'k6';
import { Rate } from 'k6/metrics';
import exec from 'k6/execution';

const BASE = __ENV.BASE_URL || 'https://localhost';
const USERS = 500;
const PASSWORD = 'LoadTest-Pass-2026';
const DURATION = __ENV.DURATION || '3m';
const THINK = Number(__ENV.THINK || 1); // seconds between requests of a VU
const INDICATORS = JSON.parse(open('./indicators.json'));

// VUs per endpoint: the agreed load, 100 concurrent users in total.
const LOAD = {
  login: 10,
  dashboard: 20,
  projects: 20,
  answers: 20,
  submit: 5,
  results: 20,
  report: 5,
};

export const options = {
  insecureSkipTLSVerify: true,
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
  scenarios: Object.fromEntries(
    Object.entries(LOAD).map(([name, vus]) => [
      name,
      { executor: 'constant-vus', vus, duration: DURATION, exec: name, startTime: '0s' },
    ]),
  ),
  thresholds: Object.fromEntries(
    [...Object.keys(LOAD), 'answers_full', 'job'].flatMap((n) => [
      [`http_req_duration{endpoint:${n}}`, ['p(95)<1000']],
      [`ok{endpoint:${n}}`, ['rate>=0']], // creates the sub-metric for the summary
    ]),
  ),
};

const ok = new Rate('ok');

const JSON_HEADERS = { 'Content-Type': 'application/json', Origin: BASE };

// Per-VU state, kept across iterations.
let session = null;

function api(method, path, body, endpoint, expected) {
  const params = {
    headers: { ...JSON_HEADERS, 'X-CSRF-Token': session ? session.csrf : '' },
    tags: { endpoint },
  };
  const res = http.request(method, `${BASE}/api/v1${path}`, body ? JSON.stringify(body) : null, params);
  ok.add(expected.includes(res.status), { endpoint, status: String(res.status) });
  return res;
}

function csrf() {
  const res = http.get(`${BASE}/api/v1/auth/csrf`, { tags: { endpoint: 'setup' } });
  return res.json('csrf_token');
}

function doLogin(endpoint) {
  const n = ((exec.vu.idInTest - 1) % USERS) + 1;
  const token = csrf();
  session = { csrf: token };
  const res = api(
    'POST',
    '/auth/login',
    { email: `lt-user-${n}@loadtest.invalid`, password: PASSWORD, keep_logged_in: false },
    endpoint,
    [200, 204],
  );
  if (res.status >= 400) {
    session = null;
    return false;
  }
  session.csrf = csrf(); // the session may rotate the token
  return true;
}

// Log in once per VU and learn the user's projects and their versions.
function ensure(endpoint) {
  if (session && session.projects) return true;
  if (!session && !doLogin('setup')) return false;
  const res = http.get(`${BASE}/api/v1/projects?page_size=10`, { tags: { endpoint: 'setup' } });
  const items = res.status === 200 ? res.json('items') || [] : [];
  session.projects = items.map((p) => {
    const v = http.get(`${BASE}/api/v1/projects/${p.id}/versions`, { tags: { endpoint: 'setup' } });
    const list = v.status === 200 ? v.json('items') || v.json() || [] : [];
    const sorted = [...list].sort((a, b) => a.version_no - b.version_no);
    return { id: p.id, versions: sorted.map((x) => x.id) };
  });
  return session.projects.length > 0 && session.projects[0].versions.length > 0;
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function fullAnswers() {
  return INDICATORS.map((code) => ({
    indicator_code: code,
    x: Math.floor(Math.random() * 40),
    y1: { value: Math.floor(Math.random() * 50), unit: 'percent' },
    y2: { value: Math.floor(Math.random() * 50), unit: 'percent' },
    y3: ['B'],
  }));
}

// --- scenarios (names match LOAD keys) ---

export function login() {
  doLogin('login');
  sleep(THINK);
}

export function dashboard() {
  if (!ensure('dashboard')) return sleep(THINK);
  api('GET', '/dashboard', null, 'dashboard', [200]);
  sleep(THINK);
}

export function projects() {
  if (!ensure('projects')) return sleep(THINK);
  api('GET', '/projects?page=1&page_size=10', null, 'projects', [200]);
  sleep(THINK);
}

// Save answers: batch of 5 indicators on the latest (draft) version.
export function answers() {
  if (!ensure('answers')) return sleep(THINK);
  const p = pick(session.projects);
  const v = p.versions[p.versions.length - 1];
  const batch = fullAnswers().sort(() => Math.random() - 0.5).slice(0, 5);
  api('PATCH', `/projects/${p.id}/versions/${v}/answers`, { answers: batch }, 'answers', [200]);
  sleep(THINK);
}

// Submit the latest version with all 55 indicators answered (re-submit is allowed).
export function submit() {
  if (!ensure('submit')) return sleep(THINK);
  const p = pick(session.projects);
  const v = p.versions[p.versions.length - 1];
  api('PATCH', `/projects/${p.id}/versions/${v}/answers`, { answers: fullAnswers() }, 'answers_full', [200]);
  api('POST', `/projects/${p.id}/versions/${v}/submit`, null, 'submit', [200]);
  sleep(THINK * 2);
}

export function results() {
  if (!ensure('results')) return sleep(THINK);
  const p = pick(session.projects);
  const v = p.versions[Math.floor(Math.random() * Math.max(1, p.versions.length - 1))]; // submitted ones
  api('GET', `/projects/${p.id}/versions/${v}/results`, null, 'results', [200]);
  sleep(THINK);
}

// Request a report (202 with a job id), then poll the job once.
export function report() {
  if (!ensure('report')) return sleep(THINK);
  const p = pick(session.projects);
  const v = p.versions[Math.floor(Math.random() * Math.max(1, p.versions.length - 1))];
  const res = api('POST', `/projects/${p.id}/versions/${v}/reports`, null, 'report', [200, 202]);
  if (res.status === 202 || res.status === 200) {
    const id = res.json('job_id') || res.json('id');
    if (id) api('GET', `/jobs/${id}`, null, 'job', [200]);
  }
  sleep(THINK * 2);
}

export function handleSummary(data) {
  const rows = [];
  for (const name of [...Object.keys(LOAD), 'answers_full', 'job']) {
    const d = data.metrics[`http_req_duration{endpoint:${name}}`];
    const r = data.metrics[`ok{endpoint:${name}}`];
    if (!d) continue;
    rows.push({
      endpoint: name,
      requests: d.values.count !== undefined ? d.values.count : null,
      p50: d.values.med,
      p95: d.values['p(95)'],
      p99: d.values['p(99)'],
      max: d.values.max,
      ok_rate: r ? r.values.rate : null,
    });
  }
  const lines = ['endpoint        p50(ms)  p95(ms)  p99(ms)  ok_rate'];
  for (const r of rows) {
    lines.push(
      `${r.endpoint.padEnd(14)} ${r.p50.toFixed(0).padStart(8)} ${r.p95.toFixed(0).padStart(8)} ${r.p99.toFixed(0).padStart(8)} ${(r.ok_rate === null ? NaN : r.ok_rate * 100).toFixed(1).padStart(7)}%`,
    );
  }
  return {
    stdout: lines.join('\n') + '\n',
    '/out/summary.json': JSON.stringify({ rows, raw: data }, null, 1),
  };
}
