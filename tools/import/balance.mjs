// The money rules from docs/DATA_MODEL.md, as one pure function. The app gets its own copy with tests in
// Phase 6b; the importer uses this one to reconcile against the spreadsheet. All amounts are centavos.
//   remaining = installments + principal + additions + charges + adjustments(+)
//             - payments - writeoffs - adjustments(-)
// Credits (payments, write-offs, minus adjustments) fill installments oldest first; what is left pays the
// tail (principal, additions, charges, plus adjustments); beyond that is "overpaid".
export function balance(debt, installments, lines) {
  const live = lines.filter((l) => !l.deleted);
  const isCredit = (l) => l.kind === 'payment' || l.kind === 'writeoff' || (l.kind === 'adjustment' && l.adjust_sign === -1);
  const debitTotal = live.filter((l) => !isCredit(l)).reduce((s, l) => s + l.amount_centavos, 0);
  const credits = live.filter(isCredit).sort((a, b) => (a.on_date < b.on_date ? -1 : a.on_date > b.on_date ? 1 : a.created_at - b.created_at || (a.id < b.id ? -1 : 1)));
  const creditTotal = credits.reduce((s, l) => s + l.amount_centavos, 0);
  const plan = installments.filter((i) => !i.deleted).sort((a, b) => (a.due_on < b.due_on ? -1 : a.due_on > b.due_on ? 1 : a.seq - b.seq));
  const planTotal = plan.reduce((s, i) => s + i.amount_centavos, 0);

  // When did the running credit total first reach a given amount?
  const reachedOn = (target) => {
    let run = 0;
    for (const c of credits) { run += c.amount_centavos; if (run >= target) return c.on_date; }
    return null;
  };
  let before = 0;
  const statuses = plan.map((i) => {
    const covered = Math.min(Math.max(creditTotal - before, 0), i.amount_centavos);
    const short = i.amount_centavos - covered;
    const doneOn = short === 0 ? reachedOn(before + i.amount_centavos) : null;
    before += i.amount_centavos;
    const status = covered === 0 ? 'unpaid' : short > 0 ? 'partly paid' : doneOn <= i.due_on ? 'paid' : 'paid late';
    return { seq: i.seq, due_on: i.due_on, amount: i.amount_centavos, covered, short, doneOn, status };
  });
  const owed = planTotal + debitTotal;
  const remaining = owed - creditTotal;
  return { owed, paid: creditTotal, remaining: Math.max(remaining, 0), overpaid: Math.max(-remaining, 0), statuses };
}

// "First installments get the extra centavo": split a total into n whole-centavo parts that add up exactly.
export function split(total, n) {
  const base = Math.floor(total / n), extra = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
}

// Pesos as text ("1234.56") to centavos, exactly. Numbers from cells go through cellCentavos instead.
export function pesos(text) {
  const m = String(text).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) throw new Error(`not a peso amount: ${text}`);
  return (m[1] ? -1 : 1) * (Number(m[2]) * 100 + Number((m[3] || '0').padEnd(2, '0')));
}

export const fmt = (c) => {
  const s = Math.abs(c), sign = c < 0 ? '-' : '';
  return `${sign}${Math.floor(s / 100).toLocaleString('en-US')}.${String(s % 100).padStart(2, '0')}`;
};
