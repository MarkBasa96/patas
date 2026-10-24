// Rows that come from outside the app (the server, a backup file) are untrusted: keep only what is expected,
// with safe fallbacks (Kenshin, Gastos v2). Pure, so restore and the tests can use it too.
import type { DebtRow, InstallmentRow, LineRow } from './ledger';
import type { CashRow, Data, TableKey } from './local';
import { int, str } from './merge';
import { isIsoDate } from './plan';

const bool = (v: unknown) => v === true;
const dateOrNull = (v: unknown): string | null => (typeof v === 'string' && isIsoDate(v) ? v : null);
/** The server's time "18:00:00" -> "18:00"; anything else -> null (the account's reminder time). */
const timeOrNull = (v: unknown): string | null => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(v) ? v.slice(0, 5) : null);
/** Days before a due date that remind: only 0, 1, 3, 7, each once, sorted. A missing value is the old behaviour. */
export function remindDays(v: unknown): number[] {
  if (!Array.isArray(v)) return [0, 1];
  return [...new Set(v.filter((x): x is number => x === 0 || x === 1 || x === 3 || x === 7))].sort((a, b) => a - b);
}

// Server rows are untrusted: keep only what we expect, with safe fallbacks (Kenshin, Gastos v2).
export const rowFrom: { [K in TableKey]: (r: Record<string, unknown>) => Data[K][number] | null } = {
  debts: (r): DebtRow | null => {
    const kind = r.kind === 'installments' ? 'installments' : r.kind === 'one_time' ? 'one_time' : r.kind === 'recurring' ? 'recurring' : null;
    const opened = dateOrNull(r.opened_on);
    if (typeof r.id !== 'string' || !kind || !opened) return null;
    // Round 4 fields: a row from before migration 0007 (or an odd value) falls back to the old behaviour.
    const every = r.recurring_every === 'weekly' || r.recurring_every === 'biweekly' || r.recurring_every === 'monthly' ? r.recurring_every : null;
    const first = dateOrNull(r.recurring_first);
    const amount = int(r.recurring_amount_centavos, 0);
    if (kind === 'recurring' && (!every || !first || amount < 1)) return null; // a recurring debt without its rule can't be shown honestly
    return {
      id: r.id, direction: 'i_owe', kind, person_name: str(r.person_name), title: str(r.title), due_on: dateOrNull(r.due_on), opened_on: opened,
      settled_on: dateOrNull(r.settled_on), remind: bool(r.remind), qr_id: typeof r.qr_id === 'string' ? r.qr_id : null, qr_linked_at: typeof r.qr_linked_at === 'string' ? r.qr_linked_at : null, note: str(r.note), created_at: int(r.created_at), deleted: bool(r.deleted), updated_at: str(r.updated_at),
      remind_days: remindDays(r.remind_days), remind_on: dateOrNull(r.remind_on), remind_at: timeOrNull(r.remind_at),
      currency: typeof r.currency === 'string' && /^[A-Z]{3}$/.test(r.currency) ? r.currency : 'PHP',
      recurring_amount_centavos: kind === 'recurring' ? amount : null, recurring_every: kind === 'recurring' ? every : null,
      recurring_first: kind === 'recurring' ? first : null, recurring_until: kind === 'recurring' ? dateOrNull(r.recurring_until) : null,
    };
  },
  installments: (r): InstallmentRow | null => {
    const due = dateOrNull(r.due_on);
    if (typeof r.id !== 'string' || typeof r.debt_id !== 'string' || !due) return null;
    return { id: r.id, debt_id: r.debt_id, seq: int(r.seq, 1), due_on: due, amount_centavos: int(r.amount_centavos), created_at: int(r.created_at), deleted: bool(r.deleted), updated_at: str(r.updated_at) };
  },
  cash: (r): CashRow | null => {
    if (typeof r.id !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.id)) return null;
    const c = (v: unknown) => { const x = int(v); return x >= 0 && x <= 99_999_999_999 ? x : 0; };
    return { id: r.id, income_centavos: c(r.income_centavos), expenses_centavos: c(r.expenses_centavos), created_at: int(r.created_at), deleted: bool(r.deleted), updated_at: str(r.updated_at) };
  },
  lines: (r): LineRow | null => {
    const kinds = ['principal', 'addition', 'charge', 'adjustment', 'payment', 'writeoff'];
    const on = dateOrNull(r.on_date);
    if (typeof r.id !== 'string' || typeof r.debt_id !== 'string' || typeof r.kind !== 'string' || !kinds.includes(r.kind) || !on) return null;
    const ck = ['late_fee', 'penalty', 'interest', 'other'].includes(String(r.charge_kind)) ? (r.charge_kind as LineRow['charge_kind']) : null;
    return {
      id: r.id, debt_id: r.debt_id, kind: r.kind as LineRow['kind'], charge_kind: ck, adjust_sign: r.adjust_sign === -1 ? -1 : r.adjust_sign === 1 ? 1 : null,
      amount_centavos: int(r.amount_centavos), on_date: on, note: str(r.note), method: str(r.method), created_at: int(r.created_at), deleted: bool(r.deleted), updated_at: str(r.updated_at),
    };
  },
};
