/** Minimum length the api accepts (`Password.minLength` in the contract). */
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export type StrengthLevel = 'none' | 'weak' | 'fair' | 'good' | 'strong';

export type PasswordRules = {
  /** The one hard rule: at least MIN_PASSWORD_LENGTH characters. */
  minLength: boolean;
};

export function passwordRules(password: string): PasswordRules {
  return { minLength: [...password].length >= MIN_PASSWORD_LENGTH };
}

/**
 * Guidance only; the api checks length alone. A password that breaks the
 * length rule is never better than "weak".
 */
export function passwordStrength(password: string): { level: StrengthLevel; bars: number } {
  if (password === '') return { level: 'none', bars: 0 };
  if (!passwordRules(password).minLength) return { level: 'weak', bars: 1 };
  const length = [...password].length;
  const hasLetter = /\p{L}/u.test(password);
  const hasDigit = /\d/.test(password);
  const hasOther = /[^\p{L}\d]/u.test(password);
  const mixedCase = /\p{Ll}/u.test(password) && /\p{Lu}/u.test(password);
  let points = 0;
  if (length >= 12) points += 1;
  if (hasLetter && hasDigit) points += 1;
  if (hasOther || mixedCase) points += 1;
  const level = (['fair', 'good', 'good', 'strong'] as const)[points];
  return { level, bars: { fair: 2, good: 3, strong: 4 }[level] };
}

export type ConfirmationState = 'empty' | 'match' | 'mismatch';

export function confirmationState(password: string, confirmation: string): ConfirmationState {
  if (confirmation === '') return 'empty';
  return password === confirmation ? 'match' : 'mismatch';
}
