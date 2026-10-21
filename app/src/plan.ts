// Dates are plain "YYYY-MM-DD" text. All maths is in UTC so a time zone can never shift a due date.

export type Repeat = 'monthly' | 'weekly' | 'biweekly';
export type PlanRow = { seq: number; due_on: string; amount_centavos: number };

/** The schema allows seq 1 to 600 per debt. */
export const MAX_INSTALLMENTS = 600;

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = parse(s);
  return iso(d) === s;
}

const parse = (s: string): Date => {
  const [y = 0, m = 1, d = 1] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const iso = (d: Date): string => d.toISOString().slice(0, 10);

export function addDays(s: string, n: number): string {
  const d = parse(s);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}

/** Same day next month; a day that does not exist (31st into February) lands on the month's last day. */
export function addMonths(s: string, n: number): string {
  const d = parse(s);
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return iso(t);
}

/** The i-th due date counted from the first one (always from the first, so a clipped 28th never drifts). */
export function stepDate(first: string, repeat: Repeat, i: number): string {
  return repeat === 'weekly' ? addDays(first, 7 * i) : repeat === 'biweekly' ? addDays(first, 14 * i) : addMonths(first, i);
}

/**
 * "Borrowed 12,000, paying 1,250 monthly from Nov 5": the plan is every payment at the full amount and
 * a smaller last one, so the plan adds up to exactly what was borrowed. Null if the numbers do not make a plan.
 */
export function buildPlan(total: number, payment: number, repeat: Repeat, first: string): PlanRow[] | null {
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(payment) || total < 1 || payment < 1 || payment > total || !isIsoDate(first)) return null;
  const n = Math.ceil(total / payment);
  if (n > MAX_INSTALLMENTS) return null;
  return Array.from({ length: n }, (_, i) => ({
    seq: i + 1,
    due_on: stepDate(first, repeat, i),
    amount_centavos: i < n - 1 ? payment : total - payment * (n - 1),
  }));
}

/** Today's date on the phone, as the person sees it (local calendar, not UTC). */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const formatShort = (s: string): string => `${MON[Number(s.slice(5, 7)) - 1] ?? '?'} ${s.slice(8, 10)}`;
export const formatLong = (s: string): string => `${formatShort(s)}, ${s.slice(0, 4)}`;
