// Row shapes (they mirror supabase/schema.sql), text rules, and turning the Add debt form into rows.
import type { LineKind } from './balance';
import { MAX_CENTAVOS, parsePesos } from './money';
import { buildPlan, isIsoDate, MAX_INSTALLMENTS, planByCount, type PlanRow, type Repeat } from './plan';

export type DebtRow = {
  id: string;
  direction: 'i_owe';
  kind: 'one_time' | 'installments' | 'recurring';
  person_name: string;
  title: string;
  due_on: string | null;
  opened_on: string;
  settled_on: string | null;
  remind: boolean;
  /** Round 4 (migration 0007). Days before each due date that remind (0 = on the day); default [0, 1]. */
  remind_days: number[];
  /** An extra reminder on this date, while something is still unpaid. */
  remind_on: string | null;
  /** "HH:MM" (the server stores a time); null = the account's reminder time. */
  remind_at: string | null;
  /** The currency the amounts were typed in. Never converted when stored. */
  currency: string;
  /** Recurring debts only: the same amount every `recurring_every` from `recurring_first` (until `recurring_until`). */
  recurring_amount_centavos: number | null;
  recurring_every: Repeat | null;
  recurring_first: string | null;
  recurring_until: string | null;
  /** The saved QR that pays this debt. qr_linked_at is the server's time of the last change (read-only). */
  qr_id?: string | null;
  qr_linked_at?: string | null;
  note: string;
  created_at: number;
  deleted: boolean;
  updated_at?: string;
};
export type InstallmentRow = { id: string; debt_id: string; seq: number; due_on: string; amount_centavos: number; created_at: number; deleted: boolean; updated_at?: string };
export type LineRow = {
  id: string;
  debt_id: string;
  kind: LineKind;
  charge_kind: 'late_fee' | 'penalty' | 'interest' | 'other' | null;
  adjust_sign: -1 | 1 | null;
  amount_centavos: number;
  on_date: string;
  note: string;
  method: string;
  created_at: number;
  deleted: boolean;
  updated_at?: string;
};

// ---- text rules: same as the database (patas_clean_line / patas_clean_note), built from character codes ----
const range = (a: number, b: number) => String.fromCharCode(a) + '-' + String.fromCharCode(b);
const BIDI = new RegExp('[' + range(0x202a, 0x202e) + range(0x2066, 0x2069) + String.fromCharCode(0x200e, 0x200f) + ']');
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

export const isCleanLine = (t: string, max: number): boolean => t.length <= max && !CONTROL.test(t) && !BIDI.test(t);
export const isCleanNote = (t: string, max: number): boolean => t.length <= max && !CONTROL.test(t.replace(/[\n\r\t]/g, '')) && !BIDI.test(t);

export const LIMITS = { person: 60, title: 60, note: 500 } as const;

// ---- the Add / Edit debt form ----
export type DebtKind = DebtRow['kind'];
export type DebtForm = {
  person: string;
  title: string;
  /** One-time: the amount borrowed. Installments: the total. Recurring: the amount each time. As typed. */
  amount: string;
  kind: DebtKind;
  /** The currency the amounts are typed in (round 4). */
  currency: string;
  /** One-time: the day it was borrowed. */
  opened: string;
  due: string; // one-time only, optional ("pay when I can")
  /** Installments: how many payments (round 4). */
  count: string;
  /** Installments: each payment. Empty = the total divided by the count. */
  payment: string;
  repeat: Repeat;
  first: string; // installments: first due date; recurring: starts on
  /** Recurring: an optional end date. */
  until: string;
  remind: boolean;
  note: string;
};

export const emptyForm = (today = ''): DebtForm => ({ person: '', title: '', amount: '', kind: 'one_time', currency: 'PHP', opened: today, due: '', count: '', payment: '', repeat: 'monthly', first: '', until: '', remind: true, note: '' });

export type FormErrors = Partial<Record<keyof DebtForm, string>>;

/** The installment plan the form describes (by count; or, for an older form with only a payment, by payment). */
export function formPlan(f: DebtForm): PlanRow[] | null {
  const total = parsePesos(f.amount);
  if (total === null || !f.first || !isIsoDate(f.first)) return null;
  const pay = f.payment.trim() ? parsePesos(f.payment) : null;
  if (f.payment.trim() && pay === null) return null;
  const typed = (f.count ?? '').trim(); // an older form has no count
  const count = /^\d{1,3}$/.test(typed) ? Number(typed) : null;
  if (count !== null) return planByCount(total, count, f.repeat, f.first, pay);
  return pay === null ? null : buildPlan(total, pay, f.repeat, f.first);
}

export function validateForm(f: DebtForm): FormErrors {
  const e: FormErrors = {};
  const person = f.person.trim();
  const title = f.title.trim();
  if (!person) e.person = 'Who do you owe?';
  else if (!isCleanLine(person, LIMITS.person)) e.person = `Up to ${LIMITS.person} plain characters.`;
  if (!isCleanLine(title, LIMITS.title)) e.title = `Up to ${LIMITS.title} plain characters.`;
  if (!isCleanNote(f.note, LIMITS.note)) e.note = `Up to ${LIMITS.note} characters, no unusual symbols.`;
  if (f.currency !== undefined && !/^[A-Z]{3}$/.test(f.currency)) e.currency = 'Pick a currency.'; // an older form has none: pesos
  const amount = parsePesos(f.amount);
  if (amount === null) e.amount = 'Enter the amount, for example 1200 or 1,200.50.';
  if (f.kind === 'one_time') {
    if (f.due && !isIsoDate(f.due)) e.due = 'Pick a real date.';
    if (f.opened && !isIsoDate(f.opened)) e.opened = 'Pick a real date.';
  } else if (f.kind === 'installments') {
    if (!f.first || !isIsoDate(f.first)) e.first = 'Pick the first due date.';
    const count = (f.count ?? '').trim();
    if (count && !/^\d{1,3}$/.test(count)) e.count = 'Type a number of payments, for example 6.';
    else if (count && (Number(count) < 1 || Number(count) > MAX_INSTALLMENTS)) e.count = `Between 1 and ${MAX_INSTALLMENTS} payments.`;
    if (!count && !f.payment.trim()) e.count = 'How many payments?';
    if (f.payment.trim() && parsePesos(f.payment) === null) e.payment = 'Enter the payment amount.';
    if (!e.count && !e.payment && !e.first && amount !== null && formPlan(f) === null) e.payment = count ? 'That payment is too big for that many payments.' : 'That makes too many payments (600 at most).';
  } else {
    if (!f.first || !isIsoDate(f.first)) e.first = 'Pick the first date.';
    if (f.until && (!isIsoDate(f.until) || (f.first && f.until < f.first))) e.until = 'The end date must be after the first date.';
  }
  return e;
}

export type NewDebt = { debt: DebtRow; installments: InstallmentRow[]; lines: LineRow[] };

/** Defaults for the round 4 columns, for rows made before them (and the sample rows in tests). */
export const DEBT_DEFAULTS = { remind_days: [0, 1], remind_on: null, remind_at: null, currency: 'PHP', recurring_amount_centavos: null, recurring_every: null, recurring_first: null, recurring_until: null } as const;

/**
 * Form to rows. One-time: a `principal` line. Installments: the plan itself is the principal, so no
 * principal line (docs/DATA_MODEL.md). Recurring: no lines and no installments; its dates come from its rule.
 * `ids` are made by the caller so tests can fix them.
 */
export function buildDebt(f: DebtForm, ids: { debt: string; child: () => string }, nowMs: number, today: string): NewDebt {
  const amount = parsePesos(f.amount);
  if (amount === null || amount > MAX_CENTAVOS) throw new Error('invalid amount');
  const opened = f.kind === 'one_time' && f.opened && isIsoDate(f.opened) && f.opened <= today ? f.opened : today;
  const debt: DebtRow = {
    id: ids.debt,
    direction: 'i_owe',
    kind: f.kind,
    person_name: f.person.trim(),
    title: f.title.trim(),
    due_on: f.kind === 'one_time' && f.due ? f.due : null,
    opened_on: opened,
    settled_on: null,
    remind: f.remind,
    ...DEBT_DEFAULTS,
    remind_days: [0, 1],
    currency: /^[A-Z]{3}$/.test(f.currency) ? f.currency : 'PHP',
    note: f.note,
    created_at: nowMs,
    deleted: false,
  };
  if (f.kind === 'one_time') {
    const line: LineRow = { id: ids.child(), debt_id: debt.id, kind: 'principal', charge_kind: null, adjust_sign: null, amount_centavos: amount, on_date: opened, note: '', method: '', created_at: nowMs, deleted: false };
    return { debt, installments: [], lines: [line] };
  }
  if (f.kind === 'recurring') {
    if (!isIsoDate(f.first)) throw new Error('invalid first date');
    return { debt: { ...debt, recurring_amount_centavos: amount, recurring_every: f.repeat, recurring_first: f.first, recurring_until: f.until && isIsoDate(f.until) ? f.until : null }, installments: [], lines: [] };
  }
  const plan = formPlan(f);
  if (!plan) throw new Error('invalid plan');
  const installments = plan.map((p): InstallmentRow => ({ id: ids.child(), debt_id: debt.id, seq: p.seq, due_on: p.due_on, amount_centavos: p.amount_centavos, created_at: nowMs, deleted: false }));
  return { debt, installments, lines: [] };
}
