// Payments, charges, settling and reopening, as pure row changes. Amounts are centavos.
import type { DebtView } from './derive';
import { isCleanLine, isCleanNote, type DebtRow, type LineRow } from './ledger';
import { parsePesos } from './money';
import { isIsoDate } from './plan';

export const METHODS = ['Cash', 'GCash', 'Maya', 'Bank transfer', 'Other'] as const;
export const CHARGE_KINDS = [
  { key: 'late_fee', label: 'Late fee' },
  { key: 'penalty', label: 'Penalty' },
  { key: 'interest', label: 'Interest' },
  { key: 'other', label: 'Other' },
] as const;
export type ChargeKind = (typeof CHARGE_KINDS)[number]['key'];

/** Marks the write-off that "Mark as settled" made, so "Reopen" can take back exactly that one. */
export const SETTLE_NOTE = 'Written off when settled';

export type LineForm = { amount: string; date: string; method: string; note: string; chargeKind: ChargeKind };
export const emptyLineForm = (today: string): LineForm => ({ amount: '', date: today, method: 'Cash', note: '', chargeKind: 'late_fee' });
export type LineErrors = Partial<Record<keyof LineForm, string>>;

export function validateLine(f: LineForm, kind: 'payment' | 'charge', today: string): LineErrors {
  const e: LineErrors = {};
  if (parsePesos(f.amount) === null) e.amount = 'Enter the amount, for example 500 or 1,200.50.';
  if (!isIsoDate(f.date)) e.date = 'Pick a real date.';
  else if (f.date > today) e.date = 'Pick today or an earlier day. Patas records what already happened.';
  if (!isCleanNote(f.note, 300)) e.note = 'Up to 300 characters, no unusual symbols.';
  if (kind === 'payment' && !isCleanLine(f.method, 20)) e.method = 'Pick a payment method.';
  return e;
}

/** A new line, or (with `existing`) the same line with new values: same id, so it replaces the old one. */
export function buildLine(kind: 'payment' | 'charge', f: LineForm, debtId: string, id: string, nowMs: number, existing?: LineRow): LineRow {
  const amount = parsePesos(f.amount);
  if (amount === null) throw new Error('invalid amount');
  return {
    id: existing?.id ?? id,
    debt_id: debtId,
    kind,
    charge_kind: kind === 'charge' ? f.chargeKind : null,
    adjust_sign: null,
    amount_centavos: amount,
    on_date: f.date,
    note: f.note,
    method: kind === 'payment' ? f.method : '',
    created_at: existing?.created_at ?? nowMs,
    deleted: false,
  };
}

export function formFromLine(l: LineRow): LineForm {
  const c = l.amount_centavos;
  return { amount: c % 100 ? (c / 100).toFixed(2) : String(c / 100), date: l.on_date, method: l.method || 'Cash', note: l.note, chargeKind: l.charge_kind ?? 'late_fee' };
}

/** Balance left after adding a payment (negative = overpaid), so the form can say so before saving. */
export const remainingAfter = (v: DebtView, payment: number, replacing?: LineRow): number => v.bal.remaining - v.bal.overpaid + (replacing && !replacing.deleted ? replacing.amount_centavos : 0) - payment;

export type SettleResult = { debt: DebtRow; lines: LineRow[] };

/** Mark as settled. If money is still left and `writeOff` is true, the rest becomes a labelled write-off line. */
export function settle(v: DebtView, today: string, writeOff: boolean, newId: () => string, nowMs: number): SettleResult {
  const lines: LineRow[] = [];
  if (writeOff && v.bal.remaining > 0) {
    lines.push({ id: newId(), debt_id: v.debt.id, kind: 'writeoff', charge_kind: null, adjust_sign: null, amount_centavos: v.bal.remaining, on_date: today, note: SETTLE_NOTE, method: '', created_at: nowMs, deleted: false });
  }
  return { debt: { ...v.debt, settled_on: today }, lines };
}

/** A debt whose balance reached zero by payments settles by itself (SPEC 14 step 5). Null if nothing changes. */
export function autoSettled(v: DebtView, today: string): DebtRow | null {
  return v.debt.settled_on === null && v.bal.owed > 0 && v.bal.remaining === 0 ? { ...v.debt, settled_on: today } : null;
}

/** Reopen: clear the settled date and take back the write-off that settling made (and only that one). */
export function reopen(v: DebtView): SettleResult {
  const lines = v.lines.filter((l) => l.kind === 'writeoff' && l.note === SETTLE_NOTE && !l.deleted).map((l) => ({ ...l, deleted: true }));
  return { debt: { ...v.debt, settled_on: null }, lines };
}

/** Lines to show in history, newest first. */
export function history(v: DebtView, kinds: LineRow['kind'][]): LineRow[] {
  return v.lines.filter((l) => kinds.includes(l.kind)).sort((a, b) => b.on_date.localeCompare(a.on_date) || b.created_at - a.created_at || b.id.localeCompare(a.id));
}
