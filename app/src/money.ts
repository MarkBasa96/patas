// Money is whole centavos (integers), never floats. docs/DATA_MODEL.md.

/** The database allows 1 to 99,999,999,999 centavos (about 1 billion pesos) on any amount. */
export const MAX_CENTAVOS = 99_999_999_999;

/** "1,200.50" or "₱1200" to 120050 / 120000. Null for anything that is not a plain amount. */
export function parsePesos(input: string): number | null {
  const t = input.replace(/[₱,\s]/g, '');
  if (!/^\d*\.?\d{0,2}$/.test(t) || t === '' || t === '.') return null;
  const [whole = '0', frac = ''] = t.split('.');
  const c = Number(whole || '0') * 100 + Number(frac.padEnd(2, '0') || '0');
  return Number.isSafeInteger(c) && c >= 1 && c <= MAX_CENTAVOS ? c : null;
}

/** 120050 to "₱1,200.50", 120000 to "₱1,200.00": round 4 always shows the centavos (A28). */
export function formatPesos(centavos: number, symbol: string = currencySymbol()): string {
  const neg = centavos < 0;
  const c = Math.abs(Math.round(centavos));
  const whole = Math.floor(c / 100).toLocaleString('en-US');
  return `${neg ? '−' : ''}${symbol}${whole}.${String(c % 100).padStart(2, '0')}`;
}

/** An amount in a given currency (a debt keeps the one it was typed in): "$120.00", "AED 1,200.00". */
export const formatMoney = (centavos: number, code: string): string => formatPesos(centavos, symbolOf(code));

/** Short labels for small spaces such as chart bars: "₱850", "₱7.3k", "₱12k", "₱1.2M" (never centavos). */
export function compactPesos(centavos: number, symbol: string = currencySymbol()): string {
  const p = Math.round(Math.abs(centavos) / 100);
  const one = (n: number) => (n >= 10 ? String(Math.round(n)) : (Math.round(n * 10) / 10).toString());
  const body = p < 1000 ? String(p) : p < 999_500 ? `${one(p / 1000)}k` : `${one(p / 1_000_000)}M`;
  return `${centavos < 0 ? '−' : ''}${symbol}${body}`;
}

/** For an edit box: 120050 to "1200.5" would lose a zero, so keep two decimals only when needed. */
export function pesosToInput(centavos: number): string {
  return centavos % 100 ? (centavos / 100).toFixed(2) : String(centavos / 100);
}

/** For the typed cash-flow numbers, where zero is allowed ("" counts as 0). Null for anything that is not an amount. */
export function parsePesosOrZero(input: string): number | null {
  if (input.replace(/[₱,\s]/g, '') === '') return 0;
  const t = input.replace(/[₱,\s]/g, '');
  if (/^0*\.?0*$/.test(t)) return 0;
  return parsePesos(input);
}

// ---- Currency. The account currency is the display currency; each debt keeps its own (round 4). Amounts stay whole centavos. ----
// Symbols are fixed here (not Intl) so every browser shows the same text, and only ones the bundled font draws.
export const CURRENCIES: Record<string, { symbol: string; name: string }> = {
  PHP: { symbol: '₱', name: 'Philippine peso' },
  USD: { symbol: '$', name: 'US dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British pound' },
  JPY: { symbol: '¥', name: 'Japanese yen' },
  SGD: { symbol: 'S$', name: 'Singapore dollar' },
  HKD: { symbol: 'HK$', name: 'Hong Kong dollar' },
  AUD: { symbol: 'A$', name: 'Australian dollar' },
  CAD: { symbol: 'C$', name: 'Canadian dollar' },
  AED: { symbol: 'AED ', name: 'UAE dirham' },
  SAR: { symbol: 'SAR ', name: 'Saudi riyal' },
  QAR: { symbol: 'QAR ', name: 'Qatari riyal' },
  KWD: { symbol: 'KWD ', name: 'Kuwaiti dinar' },
  KRW: { symbol: 'KRW ', name: 'South Korean won' },
  CNY: { symbol: 'CN¥', name: 'Chinese yuan' },
  TWD: { symbol: 'NT$', name: 'New Taiwan dollar' },
  MYR: { symbol: 'RM', name: 'Malaysian ringgit' },
  THB: { symbol: 'THB ', name: 'Thai baht' },
  INR: { symbol: 'INR ', name: 'Indian rupee' },
  NZD: { symbol: 'NZ$', name: 'New Zealand dollar' },
  CHF: { symbol: 'CHF ', name: 'Swiss franc' },
};
export const symbolOf = (code: string): string => CURRENCIES[code]?.symbol ?? code + ' ';
let currentCurrency = 'PHP';
export const isCurrency = (c: unknown): c is string => typeof c === 'string' && Object.prototype.hasOwnProperty.call(CURRENCIES, c);
export function setCurrency(code: string): void {
  if (isCurrency(code)) currentCurrency = code;
}
export const currencyCode = (): string => currentCurrency;
export const currencySymbol = (): string => CURRENCIES[currentCurrency]?.symbol ?? '₱';
