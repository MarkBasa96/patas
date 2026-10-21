// Row shapes (they mirror supabase/schema.sql), text rules, and turning the Add debt form into rows.
import type { LineKind } from './balance';
import { MAX_CENTAVOS, parsePesos } from './money';
import { buildPlan, isIsoDate, type PlanRow, type Repeat } from './plan';

export type DebtRow = {
  id: string;
  direction: 'i_owe';
  kind: 'one_time' | 'installments';
  person_name: string;
  title: string;
  due_on: string | null;
  opened_on: string;
  settled_on: string | null;
  remind: boolean;
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
export type DebtForm = {
  person: string;
  title: string;
  amount: string; // pesos as typed
  kind: 'one_time' | 'installments';
  due: string; // one-time only, optional ("pay when I can")
  payment: string; // installments: amount of each payment
  repeat: Repeat;
  first: string; // installments: first due date
  remind: boolean;
  note: string;
};

export const emptyForm = (): DebtForm => ({ person: '', title: '', amount: '', kind: 'one_time', due: '', payment: '', repeat: 'monthly', first: '', remind: true, note: '' });

export type FormErrors = Partial<Record<keyof DebtForm, string>>;

export function validateForm(f: DebtForm): FormErrors {
  const e: FormErrors = {};
  const person = f.person.trim();
  const title = f.title.trim();
  if (!person) e.person = 'Who do you owe?';
  else if (!isCleanLine(person, LIMITS.person)) e.person = `Up to ${LIMITS.person} plain characters.`;
  if (!isCleanLine(title, LIMITS.title)) e.title = `Up to ${LIMITS.title} plain characters.`;
  if (!isCleanNote(f.note, LIMITS.note)) e.note = `Up to ${LIMITS.note} characters, no unusual symbols.`;
  const amount = parsePesos(f.amount);
  if (amount === null) e.amount = 'Enter the amount, for example 1200 or 1,200.50.';
  if (f.kind === 'one_time') {
    if (f.due && !isIsoDate(f.due)) e.due = 'Pick a real date.';
  } else {
    const pay = parsePesos(f.payment);
    if (pay === null) e.payment = 'Enter the payment amount.';
    else if (amount !== null && pay > amount) e.payment = 'A payment can not be more than the amount borrowed.';
    if (!f.first || !isIsoDate(f.first)) e.first = 'Pick the first due date.';
    if (amount !== null && pay !== null && f.first && isIsoDate(f.first) && buildPlan(amount, pay, f.repeat, f.first) === null && !e.payment) e.payment = 'That makes too many payments (600 at most).';
  }
  return e;
}

export type NewDebt = { debt: DebtRow; installments: InstallmentRow[]; lines: LineRow[] };

/**
 * Form to rows. One-time: a `principal` line. Installments: the plan itself is the principal, so no
 * principal line (docs/DATA_MODEL.md). `ids` are made by the caller so tests can fix them.
 */
export function buildDebt(f: DebtForm, ids: { debt: string; child: () => string }, nowMs: number, today: string): NewDebt {
  const amount = parsePesos(f.amount);
  if (amount === null || amount > MAX_CENTAVOS) throw new Error('invalid amount');
  const debt: DebtRow = {
    id: ids.debt,
    direction: 'i_owe',
    kind: f.kind,
    person_name: f.person.trim(),
    title: f.title.trim(),
    due_on: f.kind === 'one_time' && f.due ? f.due : null,
    opened_on: today,
    settled_on: null,
    remind: f.remind,
    note: f.note,
    created_at: nowMs,
    deleted: false,
  };
  if (f.kind === 'one_time') {
    const line: LineRow = { id: ids.child(), debt_id: debt.id, kind: 'principal', charge_kind: null, adjust_sign: null, amount_centavos: amount, on_date: today, note: '', method: '', created_at: nowMs, deleted: false };
    return { debt, installments: [], lines: [line] };
  }
  const pay = parsePesos(f.payment);
  const plan: PlanRow[] | null = pay === null ? null : buildPlan(amount, pay, f.repeat, f.first);
  if (!plan) throw new Error('invalid plan');
  const installments = plan.map((p): InstallmentRow => ({ id: ids.child(), debt_id: debt.id, seq: p.seq, due_on: p.due_on, amount_centavos: p.amount_centavos, created_at: nowMs, deleted: false }));
  return { debt, installments, lines: [] };
}
