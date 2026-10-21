// Numbers for Home, Schedule and Reports. Pure and worked out from the debts, never stored.
// Owed is never netted against anything (SPEC): "Total I owe" is only debts I owe.
import type { DebtView } from './derive';

export const monthOf = (isoDate: string): string => isoDate.slice(0, 7);

export type Totals = {
  owed: number;
  activeCount: number;
  dueThisMonth: number;
  dueThisMonthPaid: number;
  paidThisMonth: number;
  overdueAmount: number;
  overdueCount: number;
};

const active = (views: DebtView[]) => views.filter((v) => v.state !== 'settled');

export function homeTotals(views: DebtView[], today: string): Totals {
  const month = monthOf(today);
  const act = active(views);
  let dueThisMonth = 0;
  let dueThisMonthPaid = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  for (const v of act) {
    if (v.debt.kind === 'installments') {
      for (const st of v.bal.statuses) {
        if (monthOf(st.due_on) === month) {
          dueThisMonth += st.amount;
          dueThisMonthPaid += st.covered;
        }
      }
    } else if (v.debt.due_on && monthOf(v.debt.due_on) === month) {
      dueThisMonth += v.bal.owed;
      dueThisMonthPaid += Math.min(v.bal.paid, v.bal.owed);
    }
    if (v.state === 'overdue' && v.next) {
      overdueAmount += v.next.amount;
      overdueCount += 1;
    }
  }
  const paidThisMonth = views.reduce((n, v) => n + v.lines.filter((l) => l.kind === 'payment' && monthOf(l.on_date) === month).reduce((a, l) => a + l.amount_centavos, 0), 0);
  return { owed: act.reduce((n, v) => n + v.bal.remaining, 0), activeCount: act.length, dueThisMonth, dueThisMonthPaid, paidThisMonth, overdueAmount, overdueCount };
}

/** The payment to show first: overdue before upcoming, soonest first. Null if nothing has a due date. */
export function nextPayment(views: DebtView[]): DebtView | null {
  return (
    active(views)
      .filter((v) => v.next)
      .sort((a, b) => (a.next?.date ?? '').localeCompare(b.next?.date ?? '') || b.debt.created_at - a.debt.created_at)[0] ?? null
  );
}

export type ScheduleRow = { key: string; date: string; debtId: string; person: string; title: string; amount: number; overdue: boolean; today: boolean };

/** Every unpaid installment and every dated one-time debt, soonest first (overdue naturally come first). */
export function scheduleRows(views: DebtView[], today: string): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  for (const v of active(views)) {
    const base = { debtId: v.debt.id, person: v.debt.person_name, title: v.debt.title };
    if (v.debt.kind === 'installments') {
      for (const st of v.bal.statuses) {
        if (st.short > 0) rows.push({ ...base, key: `${v.debt.id}:${st.seq}`, date: st.due_on, amount: st.short, overdue: st.due_on < today, today: st.due_on === today });
      }
    } else if (v.debt.due_on && v.bal.remaining > 0) {
      rows.push({ ...base, key: v.debt.id, date: v.debt.due_on, amount: v.bal.remaining, overdue: v.debt.due_on < today, today: v.debt.due_on === today });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.person.localeCompare(b.person));
}

/** Payments logged per month for the last `months` months (oldest first), for the Reports bars. */
export function monthlyPayments(views: DebtView[], today: string, months = 6): { ym: string; amount: number }[] {
  const [y = 1970, m = 1] = monthOf(today).split('-').map(Number);
  const out: { ym: string; amount: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push({ ym: d.toISOString().slice(0, 7), amount: 0 });
  }
  const idx = new Map(out.map((o) => [o.ym, o] as const));
  for (const v of views) for (const l of v.lines) if (l.kind === 'payment') {
    const slot = idx.get(monthOf(l.on_date));
    if (slot) slot.amount += l.amount_centavos;
  }
  return out;
}

/** Home's "Cash remaining": income minus expenses minus what went to debts this month. Can be negative. */
export const cashRemaining = (income: number, expenses: number, paid: number): number => income - expenses - paid;
