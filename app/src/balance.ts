// The money rules from docs/DATA_MODEL.md as one pure function. Remaining and status are always worked
// out from the lines and the plan, never stored. All amounts are whole centavos.
//   remaining = installments + principal + additions + charges + adjustments(+)
//             - payments - writeoffs - adjustments(-)

export type LineKind = 'principal' | 'addition' | 'charge' | 'adjustment' | 'payment' | 'writeoff';
export type BalLine = { id: string; kind: LineKind; adjust_sign?: number | null; amount_centavos: number; on_date: string; created_at: number; deleted?: boolean };
export type BalInstallment = { seq: number; due_on: string; amount_centavos: number; deleted?: boolean };
export type InstStatus = 'unpaid' | 'partly paid' | 'paid' | 'paid late';
export type InstState = { seq: number; due_on: string; amount: number; covered: number; short: number; doneOn: string | null; status: InstStatus };
export type Balance = { owed: number; paid: number; remaining: number; overpaid: number; pct: number; statuses: InstState[]; next: InstState | null };

const isCredit = (l: BalLine) => l.kind === 'payment' || l.kind === 'writeoff' || (l.kind === 'adjustment' && l.adjust_sign === -1);
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function balance(installments: BalInstallment[], lines: BalLine[]): Balance {
  const live = lines.filter((l) => !l.deleted);
  const debitTotal = live.filter((l) => !isCredit(l)).reduce((s, l) => s + l.amount_centavos, 0);
  const credits = live.filter(isCredit).sort((a, b) => cmp(a.on_date, b.on_date) || a.created_at - b.created_at || cmp(a.id, b.id));
  const creditTotal = credits.reduce((s, l) => s + l.amount_centavos, 0);
  const plan = installments.filter((i) => !i.deleted).sort((a, b) => cmp(a.due_on, b.due_on) || a.seq - b.seq);
  const planTotal = plan.reduce((s, i) => s + i.amount_centavos, 0);

  const reachedOn = (target: number): string | null => {
    let run = 0;
    for (const c of credits) {
      run += c.amount_centavos;
      if (run >= target) return c.on_date;
    }
    return null;
  };

  let before = 0;
  const statuses: InstState[] = plan.map((i) => {
    const covered = Math.min(Math.max(creditTotal - before, 0), i.amount_centavos);
    const short = i.amount_centavos - covered;
    const doneOn = short === 0 ? reachedOn(before + i.amount_centavos) : null;
    before += i.amount_centavos;
    const status: InstStatus = covered === 0 ? 'unpaid' : short > 0 ? 'partly paid' : doneOn !== null && doneOn <= i.due_on ? 'paid' : 'paid late';
    return { seq: i.seq, due_on: i.due_on, amount: i.amount_centavos, covered, short, doneOn, status };
  });

  const owed = planTotal + debitTotal;
  const remaining = owed - creditTotal;
  const paid = Math.min(creditTotal, owed);
  return {
    owed,
    paid: creditTotal,
    remaining: Math.max(remaining, 0),
    overpaid: Math.max(-remaining, 0),
    pct: owed > 0 ? Math.min(100, Math.floor((paid * 100) / owed)) : 0,
    statuses,
    next: statuses.find((s) => s.short > 0) ?? null,
  };
}
