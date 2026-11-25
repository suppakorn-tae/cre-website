export const MAILPIT_URL = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025';

// Throw-away accounts created by global-setup (see ../global-setup.ts).
export const PASSWORD = 'e2e-Password-1';
export const USER = { email: 'e2e.user@example.com', password: PASSWORD };
export const ADMIN = { email: 'e2e.admin@example.com', password: PASSWORD };
