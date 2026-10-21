// Turning an edited form into row changes. Only the changed rows come back, so only they get sent.
import { hasCredits, type DebtView } from './derive';
import type { DebtForm, DebtRow, InstallmentRow, LineRow } from './ledger';
import { parsePesos } from './money';
import { buildPlan } from './plan';

export type EditResult = { debt: DebtRow; installments: InstallmentRow[]; lines: LineRow[] } | { error: string };

export function editDebt(v: DebtView, f: DebtForm, newId: () => string, nowMs: number, today: string): EditResult {
  const amount = parsePesos(f.amount);
  if (amount === null) return { error: 'invalid amount' };
  const debt: DebtRow = {
    ...v.debt,
    person_name: f.person.trim(),
    title: f.title.trim(),
    note: f.note,
    remind: f.remind,
    due_on: v.debt.kind === 'one_time' && f.due ? f.due : null,
  };
  const installments: InstallmentRow[] = [];
  const lines: LineRow[] = [];

  if (v.debt.kind === 'one_time') {
    const principal = v.lines.find((l) => l.kind === 'principal');
    if (!principal) lines.push({ id: newId(), debt_id: debt.id, kind: 'principal', charge_kind: null, adjust_sign: null, amount_centavos: amount, on_date: today, note: '', method: '', created_at: nowMs, deleted: false });
    else if (principal.amount_centavos !== amount) lines.push({ ...principal, amount_centavos: amount });
    return { debt, installments, lines };
  }

  const pay = parsePesos(f.payment);
  const plan = pay === null ? null : buildPlan(amount, pay, f.repeat, f.first);
  if (!plan) return { error: 'invalid plan' };
  const same =
    plan.length === v.installments.length &&
    plan.every((p, i) => {
      const o = v.installments[i];
      return !!o && o.seq === p.seq && o.due_on === p.due_on && o.amount_centavos === p.amount_centavos;
    });
  if (same) return { debt, installments, lines };
  if (hasCredits(v.lines)) return { error: 'The plan can not be changed after a payment was logged.' };
  for (const old of v.installments) installments.push({ ...old, deleted: true });
  for (const p of plan) installments.push({ id: newId(), debt_id: debt.id, seq: p.seq, due_on: p.due_on, amount_centavos: p.amount_centavos, created_at: nowMs, deleted: false });
  return { debt, installments, lines };
}
