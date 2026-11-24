export const locales = ['th', 'en'] as const;
export type Locale = (typeof locales)[number];

// Thai is the only shipped locale (FR-55); `en` is formatter-ready only.
export const defaultLocale: Locale = 'th';
export const timeZone = 'Asia/Bangkok';
