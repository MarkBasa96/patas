// Sign-in helpers. Pure functions, no React, so the node tests can import them.

export const CODE_LENGTH = 6;

/** A deliberately plain check: something@something.tld, no spaces. The server decides if it is real. */
export function isPlausibleEmail(raw: string): boolean {
  const e = raw.trim();
  return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);
}

export const normaliseEmail = (raw: string): string => raw.trim().toLowerCase();

/** Keep digits only and cap the length, so pasted "123 456" or "123-456" still works. */
export function cleanCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
}

export const isCompleteCode = (code: string): boolean => new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);

/** Show "jo****@gmail.com" style text on the code screen. */
export function maskEmail(email: string): string {
  const [name = '', domain = ''] = email.split('@');
  if (!domain) return email;
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(2, name.length - 2))}@${domain}`;
}

/** Plain-language messages. Never show a raw server message: it can leak details and reads badly. */
export function friendlyAuthError(message: string | undefined, fallback: string): string {
  const m = (message ?? '').toLowerCase();
  if (/captcha/.test(m)) return 'The security check did not go through. Please try again.';
  if (/rate limit|too many|over_email_send_rate_limit|security purposes/.test(m)) return 'Too many tries. Please wait a minute and try again.';
  if (/expired|invalid|token/.test(m)) return 'That code did not work. Check the newest email, or send a new code.';
  if (/network|fetch|failed to/.test(m)) return 'No internet connection. Check it and try again.';
  return fallback;
}
