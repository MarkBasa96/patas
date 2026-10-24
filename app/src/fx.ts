// Exchange rates (round 4), display only: a debt keeps the currency it was typed in; totals are converted into the
// chosen display currency and marked "≈". Same sources as Gastos: open.er-api.com (it has the Gulf currencies many
// Filipinos abroad are paid in), then Frankfurter (ECB rates). Only the currency code is sent, nothing personal.
// Rates are kept on the phone, so an offline phone still converts with its last rates.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Rates = { base: string; date: string; fetchedAt: number; rates: Record<string, number> };

/** The currencies Patas offers (name for the list; the code is what is stored). */
export const CURRENCY_LIST: { code: string; name: string }[] = [
  { code: 'PHP', name: 'Philippine peso' }, { code: 'USD', name: 'US dollar' }, { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British pound' }, { code: 'JPY', name: 'Japanese yen' }, { code: 'SGD', name: 'Singapore dollar' },
  { code: 'HKD', name: 'Hong Kong dollar' }, { code: 'AUD', name: 'Australian dollar' }, { code: 'CAD', name: 'Canadian dollar' },
  { code: 'AED', name: 'UAE dirham' }, { code: 'SAR', name: 'Saudi riyal' }, { code: 'QAR', name: 'Qatari riyal' },
  { code: 'KWD', name: 'Kuwaiti dinar' }, { code: 'KRW', name: 'South Korean won' }, { code: 'CNY', name: 'Chinese yuan' },
  { code: 'TWD', name: 'New Taiwan dollar' }, { code: 'MYR', name: 'Malaysian ringgit' }, { code: 'THB', name: 'Thai baht' },
  { code: 'INR', name: 'Indian rupee' }, { code: 'NZD', name: 'New Zealand dollar' }, { code: 'CHF', name: 'Swiss franc' },
];
export const isListedCurrency = (c: unknown): c is string => typeof c === 'string' && CURRENCY_LIST.some((x) => x.code === c);

const KEY = (base: string) => `patas.fx.v1.${base}`;
const DAY = 24 * 60 * 60 * 1000;

/** Server answers are untrusted: keep only 3-letter codes with positive, finite, plausible numbers. */
export function sane(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (/^[A-Z]{3}$/.test(k) && typeof x === 'number' && Number.isFinite(x) && x > 0 && x < 1e7) out[k] = x;
  }
  return out;
}

/**
 * An amount (minor units, i.e. centavos / cents) from one currency to another with rates whose base is `rates.base`
 * (rates[X] = how many X one base unit buys). Null when a rate is missing: the caller must not guess.
 */
export function convert(amount: number, from: string, to: string, rates: Rates | null): number | null {
  if (from === to) return amount;
  if (!rates) return null;
  const rf = from === rates.base ? 1 : rates.rates[from];
  const rt = to === rates.base ? 1 : rates.rates[to];
  if (!rf || !rt) return null;
  return Math.round((amount * rt) / rf);
}

async function fetchJson(url: string, ms = 6000): Promise<unknown> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl?.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!res.ok) throw new Error('rates ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function loadRates(base: string): Promise<Rates | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY(base));
    if (!raw) return null;
    const r = JSON.parse(raw) as Rates;
    return r && r.base === base && typeof r.fetchedAt === 'number' ? { ...r, rates: sane(r.rates) } : null;
  } catch {
    return null;
  }
}

/** Fresh rates for `base` if the saved ones are a day old (or missing); otherwise the saved ones. Never throws. */
export async function ratesFor(base: string, now = Date.now()): Promise<Rates | null> {
  if (!/^[A-Z]{3}$/.test(base)) return null;
  const saved = await loadRates(base);
  if (saved && now - saved.fetchedAt < DAY) return saved;
  try {
    let got: Rates | null = null;
    try {
      const j = (await fetchJson(`https://open.er-api.com/v6/latest/${base}`)) as { result?: string; rates?: unknown; time_last_update_utc?: string };
      const rates = sane(j.rates);
      if (j.result === 'success' && Object.keys(rates).length > 1) got = { base, date: String(j.time_last_update_utc ?? ''), fetchedAt: now, rates };
    } catch {
      /* try the second source */
    }
    if (!got) {
      const j = (await fetchJson(`https://api.frankfurter.dev/v1/latest?base=${base}`)) as { rates?: unknown; date?: string };
      const rates = sane(j.rates);
      if (Object.keys(rates).length > 1) got = { base, date: String(j.date ?? ''), fetchedAt: now, rates };
    }
    if (!got) return saved;
    await AsyncStorage.setItem(KEY(base), JSON.stringify(got)).catch(() => {});
    return got;
  } catch {
    return saved; // offline: the last rates (or none)
  }
}

/** "1 USD = ₱58.12" style line, for the currency list. */
export const rateLine = (code: string, base: string, rates: Rates | null): number | null => convert(100, code, base, rates);
