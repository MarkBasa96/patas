// Rows that come from outside the app (the server, a backup file) are untrusted: keep only what is expected,
// with safe fallbacks (Kenshin, Gastos v2). Pure, so restore and the tests can use it too.
import type { DebtRow, InstallmentRow, LineRow } from './ledger';
import type { Data, TableKey } from './local';
import { int, str } from './merge';
import { isIsoDate } from './plan';

const bool = (v: unknown) => v === true;
const dateOrNull = (v: unknown): string | null => (typeof v === 'string' && isIsoDate(v) ? v : null);

// Server rows are untrusted: keep only what we expect, with safe fallbacks (Kenshin, Gastos v2).
export const rowFrom: { [K in TableKey]: (r: Record<string, unknown>) => Data[K][number] | null } = {
  debts: (r): DebtRow | null => {
    const kind = r.kind === 'installments' ? 'installments' : r.kind === 'one_time' ? 'one_time' : null;
    const opened = dateOrNull(r.opened_on);
    if (typeof r.id !== 'string' || !kind || !opened) return null;
    return {
      id: r.id, direction: 'i_owe', kind, person_name: str(r.person_name), title: str(r.title), due_on: dateOrNull(r.due_on), opened_on: opened,
      settled_on: dateOrNull(r.settled_on), remind: bool(r.remind), qr_id: typeof r.qr_id === 'string' ? r.qr_id : null, qr_linked_at: typeof r.qr_linked_at === 'string' ? r.qr_linked_at : null, note: str(r.note), created_at: int(r.created_at), deleted: bool(r.deleted), updated_at: str(r.updated_at),
    };
  },
  installments: (r): InstallmentRow | null => {
    const due = dateOrNull(r.due_on);
    if (typeof r.id !== 'string' || typeof r.debt_id !== 'string' || !due) return null;
    return { id: r.id, debt_id: r.debt_id, seq: int(r.seq, 1), due_on: due, amount_centavos: int(r.amount_centavos), created_at: int(r.created_at), deleted: bool(r.deleted), updated_at: str(r.updated_at) };
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
