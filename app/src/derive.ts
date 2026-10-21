// What the screens show, worked out from the stored facts (never stored itself).
import { balance, type Balance } from './balance';
import { emptyForm, type DebtForm, type DebtRow, type InstallmentRow, type LineRow } from './ledger';
import { pesosToInput } from './money';
import type { Repeat } from './plan';

export type DebtState = 'settled' | 'overdue' | 'today' | 'upcoming' | 'open';
export type DebtView = {
  debt: DebtRow;
  installments: InstallmentRow[];
  lines: LineRow[];
  bal: Balance;
  /** What is due next and when (undefined for "pay when I can"). */
  next: { date: string; amount: number } | null;
  state: DebtState;
};

export function debtView(debt: DebtRow, allInst: InstallmentRow[], allLines: LineRow[], today: string): DebtView {
  const installments = allInst.filter((i) => i.debt_id === debt.id && !i.deleted).sort((a, b) => a.seq - b.seq);
  const lines = allLines.filter((l) => l.debt_id === debt.id && !l.deleted);
  const bal = balance(installments, lines);
  const settled = debt.settled_on !== null;
  let next: DebtView['next'] = null;
  if (!settled && bal.remaining > 0) {
    if (debt.kind === 'installments' && bal.next) next = { date: bal.next.due_on, amount: bal.next.short };
    else if (debt.kind === 'one_time' && debt.due_on) next = { date: debt.due_on, amount: bal.remaining };
  }
  const state: DebtState = settled ? 'settled' : !next ? 'open' : next.date < today ? 'overdue' : next.date === today ? 'today' : 'upcoming';
  return { debt, installments, lines, bal, next, state };
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
  if (v.debt.kind === 'one_time') {
    const principal = v.lines.find((l) => l.kind === 'principal');
    f.amount = principal ? pesosToInput(principal.amount_centavos) : '';
    f.due = v.debt.due_on ?? '';
  } else {
    const plan = [...v.installments].sort((a, b) => a.due_on.localeCompare(b.due_on));
    f.amount = pesosToInput(plan.reduce((s, i) => s + i.amount_centavos, 0));
    f.payment = pesosToInput(plan.reduce((m, i) => Math.max(m, i.amount_centavos), 0));
    f.first = plan[0]?.due_on ?? '';
    const g = plan[1] && plan[0] ? gapDays(plan[0].due_on, plan[1].due_on) : 30;
    f.repeat = (g === 7 ? 'weekly' : g === 14 ? 'biweekly' : 'monthly') as Repeat;
  }
  return f;
}
