// What the screens show, worked out from the stored facts (never stored itself).
import { balance, type Balance, type InstState } from './balance';
import { emptyForm, type DebtForm, type DebtRow, type InstallmentRow, type LineRow } from './ledger';
import { pesosToInput } from './money';
import { addMonths, type Repeat } from './plan';
import { recurringPlan } from './recurring';

export type DebtState = 'settled' | 'overdue' | 'today' | 'upcoming' | 'open';
export type DebtView = {
  debt: DebtRow;
  installments: InstallmentRow[];
  lines: LineRow[];
  bal: Balance;
  /**
   * The dated amounts to show and to tick (round 4): an installment plan as is; a recurring debt's dates so far plus
   * the next three months (payments go to the oldest first, so a payment made ahead shows the coming date as paid);
   * a one-time debt with a pay-by date as one row. Empty for "pay when I can".
   */
  schedule: InstState[];
  /** What is due next and when (undefined for "pay when I can"). */
  next: { date: string; amount: number } | null;
  state: DebtState;
};

/**
 * An installment plan's rows, plus one row for any charges (late fees) on top of the plan, dated with the last
 * installment: payments reach it only after every installment, the same oldest-first rule (round 4, so "Select all"
 * and Home's "Due this month" include the fee).
 */
function withCharges(bal: Balance, plan: InstallmentRow[], today: string): InstState[] {
  const planTotal = plan.reduce((n, i) => n + i.amount_centavos, 0);
  const extra = bal.owed - planTotal;
  if (extra <= 0) return bal.statuses;
  const covered = Math.min(Math.max(bal.paid - planTotal, 0), extra);
  const last = bal.statuses[bal.statuses.length - 1];
  const row: InstState = { seq: (last?.seq ?? 0) + 1, due_on: last?.due_on ?? today, amount: extra, covered, short: extra - covered, doneOn: null, status: covered === 0 ? 'unpaid' : covered < extra ? 'partly paid' : 'paid' };
  return [...bal.statuses, row];
}

export function debtView(debt: DebtRow, allInst: InstallmentRow[], allLines: LineRow[], today: string): DebtView {
  const installments = allInst.filter((i) => i.debt_id === debt.id && !i.deleted).sort((a, b) => a.seq - b.seq);
  const lines = allLines.filter((l) => l.debt_id === debt.id && !l.deleted);
  const settled = debt.settled_on !== null;
  let bal: Balance;
  let schedule: InstState[];
  if (debt.kind === 'recurring' && debt.recurring_amount_centavos && debt.recurring_every && debt.recurring_first) {
    // Only dates that have arrived are owed; credits beyond them pay the coming dates ahead (never "overpaid").
    const rule = { amount: debt.recurring_amount_centavos, every: debt.recurring_every, first: debt.recurring_first, until: debt.recurring_until };
    const plan = recurringPlan(rule, today, addMonths(today, 3));
    const owedBal = balance(plan.owed, lines);
    bal = { ...owedBal, overpaid: 0, pct: owedBal.owed > 0 ? Math.min(100, Math.floor((Math.min(owedBal.paid, owedBal.owed) * 100) / owedBal.owed)) : 0 };
    schedule = balance(plan.shown, lines).statuses;
  } else {
    bal = balance(installments, lines);
    schedule = debt.kind === 'installments' ? withCharges(bal, installments, today)
      : debt.due_on ? [{ seq: 1, due_on: debt.due_on, amount: bal.owed, covered: Math.min(bal.paid, bal.owed), short: bal.remaining, doneOn: null, status: bal.remaining === 0 ? 'paid' : bal.paid > 0 ? 'partly paid' : 'unpaid' }] : [];
  }
  let next: DebtView['next'] = null;
  if (!settled) {
    const open = schedule.find((s) => s.short > 0);
    if (debt.kind === 'recurring' && open) next = { date: open.due_on, amount: open.short };
    else if (bal.remaining > 0) {
      const owing = schedule.find((s) => s.short > 0);
      if (debt.kind === 'installments' && owing) next = { date: owing.due_on, amount: owing.short };
      else if (debt.kind === 'one_time' && debt.due_on) next = { date: debt.due_on, amount: bal.remaining };
    }
  }
  const state: DebtState = settled ? 'settled' : !next ? 'open' : next.date < today ? 'overdue' : next.date === today ? 'today' : 'upcoming';
  return { debt, installments, lines, bal, schedule, next, state };
}

/** Live debts (not deleted), newest first unless sorted by the caller. */
export const liveViews = (debts: DebtRow[], inst: InstallmentRow[], lines: LineRow[], today: string): DebtView[] =>
  debts.filter((d) => !d.deleted).map((d) => debtView(d, inst, lines, today));

/** Order for the list: soonest due first, "pay when I can" last. */
export const byDueSoonest = (a: DebtView, b: DebtView): number => (a.next?.date ?? '9999') .localeCompare(b.next?.date ?? '9999') || b.debt.created_at - a.debt.created_at;

export const hasCredits = (lines: LineRow[]): boolean => lines.some((l) => !l.deleted && (l.kind === 'payment' || l.kind === 'writeoff' || (l.kind === 'adjustment' && l.adjust_sign === -1)));

const gapDays = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Fill the edit form from what is stored. The repeat is read back from the gap between the first two dates. */
export function formFromDebt(v: DebtView): DebtForm {
  const f = emptyForm();
  f.person = v.debt.person_name;
  f.title = v.debt.title;
  f.note = v.debt.note;
  f.remind = v.debt.remind;
  f.kind = v.debt.kind;
  f.currency = v.debt.currency;
  if (v.debt.kind === 'one_time') {
    const principal = v.lines.find((l) => l.kind === 'principal');
    f.amount = principal ? pesosToInput(principal.amount_centavos) : '';
    f.due = v.debt.due_on ?? '';
    f.opened = v.debt.opened_on;
  } else if (v.debt.kind === 'recurring') {
    f.amount = v.debt.recurring_amount_centavos ? pesosToInput(v.debt.recurring_amount_centavos) : '';
    f.repeat = v.debt.recurring_every ?? 'monthly';
    f.first = v.debt.recurring_first ?? '';
    f.until = v.debt.recurring_until ?? '';
  } else {
    const plan = [...v.installments].sort((a, b) => a.due_on.localeCompare(b.due_on));
    f.amount = pesosToInput(plan.reduce((s, i) => s + i.amount_centavos, 0));
    // The first payment as "each" and the count reproduce the stored plan exactly (the last one takes the rest).
    f.payment = plan[0] ? pesosToInput(plan[0].amount_centavos) : '';
    f.count = String(plan.length);
    f.first = plan[0]?.due_on ?? '';
    const g = plan[1] && plan[0] ? gapDays(plan[0].due_on, plan[1].due_on) : 30;
    f.repeat = (g === 7 ? 'weekly' : g === 14 ? 'biweekly' : 'monthly') as Repeat;
  }
  return f;
}
