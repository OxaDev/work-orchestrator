/**
 * Password policy (ADR-0008), mirror of backend app/modules/auth/password_policy.py.
 * The backend stays authoritative; this only drives the live checklist.
 */

export const PASSWORD_RULES = [
  "PASSWORD_TOO_SHORT",
  "PASSWORD_MISSING_UPPERCASE",
  "PASSWORD_MISSING_LOWERCASE",
  "PASSWORD_MISSING_DIGIT",
  "PASSWORD_MISSING_SYMBOL",
] as const;

export type PasswordRule = (typeof PASSWORD_RULES)[number] | "PASSWORD_TOO_LONG";

export const MIN_LENGTH = 12;
export const MAX_LENGTH = 128;

const isUpper = (c: string) => c !== c.toLowerCase() && c === c.toUpperCase();
const isLower = (c: string) => c !== c.toUpperCase() && c === c.toLowerCase();
const isDigit = (c: string) => /\p{Nd}/u.test(c);
const isLetterOrDigit = (c: string) => /[\p{L}\p{N}]/u.test(c);
const isPrintable = (c: string) => !/\p{C}/u.test(c);

export function passwordViolations(password: string): PasswordRule[] {
  const chars = Array.from(password);
  const violations: PasswordRule[] = [];
  if (chars.length < MIN_LENGTH) violations.push("PASSWORD_TOO_SHORT");
  if (chars.length > MAX_LENGTH) violations.push("PASSWORD_TOO_LONG");
  if (!chars.some(isUpper)) violations.push("PASSWORD_MISSING_UPPERCASE");
  if (!chars.some(isLower)) violations.push("PASSWORD_MISSING_LOWERCASE");
  if (!chars.some(isDigit)) violations.push("PASSWORD_MISSING_DIGIT");
  if (!chars.some((c) => !isLetterOrDigit(c) && isPrintable(c))) {
    violations.push("PASSWORD_MISSING_SYMBOL");
  }
  return violations;
}
