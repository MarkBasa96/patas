// Round 4: what Home, the person page, Log payment and Reports show, worked out from the debt views (never stored).
// Ported from the approved mockup's engine (docs/mockups-v4/engine.js) onto the real rows. Money is whole centavos.
// Every debt keeps the currency it was typed in; totals across debts are converted into the display currency with
// `conv` and marked approximate (≈) when any amount was converted or no rate was known.
import { debtView, type DebtView } from './derive';
import type { LineRow } from './ledger';
import type { InstState } from './balance';
import { addDays, addMonths } from './plan';

/** An amount from a debt's currency into the display currency; null when no rate is known. */
export type Conv = (amount: number, from: string) => number | null;
/** No conversion at all: only amounts already in `display` are known. */
export const sameOnly = (display: string): Conv => (a, from) => (from === display ? a : null);

/** A running total in the display currency that remembers whether it is exact. */
export type Sum = { total: number; approx: boolean };
/**
 * A converted total is approximate whenever any part of it came from another currency. With no rate, the amount is
 * counted as is (never hide money) and the total is marked approximate.
 */
export function sumOf(items: { amount: number; currency: string }[], conv: Conv, display: string): Sum {
  const s: Sum = { total: 0, approx: false };
  for (const i of items) {
    const c = conv(i.amount, i.currency);
    s.total += c ?? i.amount;
    if (c === null || i.currency !== display) s.approx = true;
  }
  return s;
}

export const monthOf = (d: string): string => d.slice(0, 7);
const monthEnd = (ym: string): string => addDays(addMonths(ym + '-01', 1), -1);
/** People with the same name (trimmed, spaces squeezed, any case) are one person. */
export const personKey = (name: string): string => name.trim().replace(/\s+/g, ' ').toLowerCase();
const isActive = (v: DebtView) => v.state !== 'settled';
const credits = (l: LineRow) => l.kind === 'payment' || l.kind === 'writeoff' || (l.kind === 'adjustment' && l.adjust_sign === -1);

// ---------------- Home ----------------
/** `charge`: the row of charges (late fees) after an installment plan. */
export type DueRow = { view: DebtView; due: string; amount: number; short: number; status: InstState['status']; carried: boolean; charge: boolean };
const isChargeRow = (v: DebtView, seq: number) => v.debt.kind === 'installments' && seq > v.installments.length;
export type PaidRow = { view: DebtView; line: LineRow };
export type HomeInsights = {
  owed: Sum;
  activeCount: number;
  /** This month's dates plus every earlier unpaid one ("From <month>"), soonest first. */
  due: DueRow[];
  dueThisMonth: Sum;
  dueThisMonthPaid: Sum;
  /** This month's payments, newest first. */
  paid: PaidRow[];
  paidThisMonth: Sum;
  overdueCount: number;
  overdueAmount: Sum;
  income: number;
  expenses: number;
  cashRemaining: number;
};

export function homeInsights(views: DebtView[], months: Record<string, { income: number; expenses: number }>, today: string, conv: Conv, display: string): HomeInsights {
  const m = monthOf(today);
  const act = views.filter(isActive);
  const due: DueRow[] = [];
  const late: { amount: number; currency: string }[] = [];
  let overdueCount = 0;
  for (const v of act) {
    for (const s of v.schedule) {
      const carried = monthOf(s.due_on) < m && s.short > 0;
      if (monthOf(s.due_on) === m || carried) due.push({ view: v, due: s.due_on, amount: s.amount, short: s.short, status: s.status, carried, charge: isChargeRow(v, s.seq) });
    }
    const lateRows = v.schedule.filter((s) => s.short > 0 && s.due_on < today);
    if (lateRows.length) {
      overdueCount += 1;
      for (const s of lateRows) late.push({ amount: s.short, currency: v.debt.currency });
    }
  }
  due.sort((a, b) => a.due.localeCompare(b.due) || a.view.debt.person_name.localeCompare(b.view.debt.person_name));
  const paid: PaidRow[] = [];
  for (const v of views) for (const l of v.lines) if (l.kind === 'payment' && monthOf(l.on_date) === m) paid.push({ view: v, line: l });
  paid.sort((a, b) => b.line.on_date.localeCompare(a.line.on_date) || b.line.created_at - a.line.created_at);
  const cur = (v: DebtView) => v.debt.currency;
  const paidThisMonth = sumOf(paid.map((p) => ({ amount: p.line.amount_centavos, currency: cur(p.view) })), conv, display);
  const cash = months[m] ?? { income: 0, expenses: 0 };
  return {
    owed: sumOf(act.map((v) => ({ amount: v.bal.remaining, currency: cur(v) })), conv, display),
    activeCount: act.length,
    due,
    dueThisMonth: sumOf(due.map((d) => ({ amount: d.amount, currency: cur(d.view) })), conv, display),
    dueThisMonthPaid: sumOf(due.map((d) => ({ amount: d.amount - d.short, currency: cur(d.view) })), conv, display),
    paid,
    paidThisMonth,
    overdueCount,
    overdueAmount: sumOf(late, conv, display),
    income: cash.income,
    expenses: cash.expenses,
    cashRemaining: cash.income - cash.expenses - paidThisMonth.total,
  };
}

// ---------------- people and their ledger ----------------
export type Person = { key: string; name: string; views: DebtView[]; borrowed: Sum; paid: Sum; remaining: Sum; open: number };

/** Everyone I owe, one row each, biggest remaining first. */
export function people(views: DebtView[], conv: Conv, display: string): Person[] {
  const map = new Map<string, { key: string; name: string; views: DebtView[] }>();
  for (const v of views) {
    const k = personKey(v.debt.person_name);
    if (!k) continue;
    const p = map.get(k) ?? { key: k, name: v.debt.person_name.trim(), views: [] };
    p.views.push(v);
    map.set(k, p);
  }
  return [...map.values()]
    .map((p): Person => {
      const item = (f: (v: DebtView) => number) => p.views.map((v) => ({ amount: f(v), currency: v.debt.currency }));
      return {
        ...p,
        borrowed: sumOf(item((v) => v.bal.owed), conv, display),
        paid: sumOf(item((v) => Math.min(v.bal.paid, v.bal.owed || v.bal.paid)), conv, display),
        remaining: sumOf(item((v) => (isActive(v) ? v.bal.remaining : 0)), conv, display),
        open: p.views.filter(isActive).length,
      };
    })
    .sort((a, b) => b.remaining.total - a.remaining.total || a.name.localeCompare(b.name));
}

export type LedgerEntry = { date: string; kind: 'borrowed' | 'charge' | 'payment' | 'writeoff'; amount: number; currency: string; view: DebtView; line?: LineRow; text: string };

/** The person's dated ledger: every borrowing, charge and payment across their debts, newest first. */
export function personLedger(views: DebtView[], key: string, today: string): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const v of views) {
    if (personKey(v.debt.person_name) !== key) continue;
    const t = v.debt.title ? `: ${v.debt.title}` : '';
    const base = { view: v, currency: v.debt.currency };
    if (v.debt.kind === 'installments') out.push({ ...base, date: v.debt.opened_on, kind: 'borrowed', amount: v.installments.reduce((n, i) => n + i.amount_centavos, 0), text: `Added debt${t}` });
    if (v.debt.kind === 'recurring') for (const s of v.schedule) if (s.due_on <= today) out.push({ ...base, date: s.due_on, kind: 'borrowed', amount: s.amount, text: `Due${t}` });
    for (const l of v.lines) {
      const note = l.note ? `: ${l.note}` : '';
      if (l.kind === 'principal') out.push({ ...base, date: l.on_date, kind: 'borrowed', amount: l.amount_centavos, line: l, text: `Added debt${t}` });
      else if (l.kind === 'addition') out.push({ ...base, date: l.on_date, kind: 'borrowed', amount: l.amount_centavos, line: l, text: `Borrowed more${note}` });
      else if (l.kind === 'charge') out.push({ ...base, date: l.on_date, kind: 'charge', amount: l.amount_centavos, line: l, text: `Charge${note}` });
      else if (l.kind === 'payment') out.push({ ...base, date: l.on_date, kind: 'payment', amount: l.amount_centavos, line: l, text: `Payment${l.method ? ' · ' + l.method : ''}` });
      else if (l.kind === 'writeoff') out.push({ ...base, date: l.on_date, kind: 'writeoff', amount: l.amount_centavos, line: l, text: 'Written off' });
    }
  }
  const rank = (e: LedgerEntry) => (e.kind === 'payment' || e.kind === 'writeoff' ? 1 : 0);
  return out.sort((a, b) => b.date.localeCompare(a.date) || rank(b) - rank(a));
}

// ---------------- Log payment: ticking installments ----------------
/** Ticking row k of the unpaid rows ticks every unpaid row before it (payments go to the oldest first, A6). */
export function tickUpTo(v: DebtView, k: number): { rows: InstState[]; total: number; all: number } {
  const open = v.schedule.filter((s) => s.short > 0);
  const n = Math.max(0, Math.min(open.length, k + 1));
  const rows = open.slice(0, n);
  return { rows, total: rows.reduce((t, s) => t + s.short, 0), all: open.length };
}

/** What one payment paid for: the credits, oldest first, poured through the dated rows. `extra` = beyond all rows. */
export function coverOf(v: DebtView, lineId: string): { rows: { seq: number; due: string; amount: number; of: number }[]; extra: number } {
  const rows = v.schedule.map((s) => ({ seq: s.seq, due: s.due_on, of: s.amount, left: s.amount }));
  const pays = v.lines.filter((l) => !l.deleted && credits(l)).sort((a, b) => a.on_date.localeCompare(b.on_date) || a.created_at - b.created_at || a.id.localeCompare(b.id));
  for (const l of pays) {
    let pool = l.amount_centavos;
    const got: { seq: number; due: string; amount: number; of: number }[] = [];
    for (const r of rows) {
      if (pool <= 0) break;
      const k = Math.min(r.left, pool);
      if (k > 0) {
        got.push({ seq: r.seq, due: r.due, amount: k, of: r.of });
        r.left -= k;
        pool -= k;
      }
    }
    if (l.id === lineId) return { rows: got, extra: pool };
  }
  return { rows: [], extra: 0 };
}

// ---------------- Reports ----------------
export type PeriodKey = 'week' | 'month' | 'last_month' | '3m' | '6m' | 'year' | 'custom';
export type Range = { from: string; to: string };
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'This week' }, { key: 'month', label: 'This month' }, { key: 'last_month', label: 'Last month' },
  { key: '3m', label: 'Last 3 months' }, { key: '6m', label: 'Last 6 months' }, { key: 'year', label: 'This year' }, { key: 'custom', label: 'Custom…' },
];

/** Inclusive [from, to] for a period. */
export function period(key: PeriodKey, today: string, custom?: Range): Range {
  const m = monthOf(today);
  if (key === 'week') {
    const dow = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
    return { from: addDays(today, -dow), to: today };
  }
  if (key === 'last_month') {
    const f = addMonths(m + '-01', -1);
    return { from: f, to: monthEnd(monthOf(f)) };
  }
  if (key === '3m') return { from: addMonths(m + '-01', -2), to: today };
  if (key === '6m') return { from: addMonths(m + '-01', -5), to: today };
  if (key === 'year') return { from: today.slice(0, 4) + '-01-01', to: today };
  if (key === 'custom' && custom && custom.from <= custom.to) return custom;
  return { from: m + '-01', to: today };
}

export const monthsIn = (r: Range): string[] => {
  const out: string[] = [];
  for (let m = monthOf(r.from); m <= monthOf(r.to) && out.length < 240; m = monthOf(addMonths(m + '-01', 1))) out.push(m);
  return out;
};

export type Report = {
  range: Range;
  months: string[];
  debtPaid: Sum;
  payCount: number;
  remaining: Sum;
  totalOwed: Sum;
  totalPaidAll: Sum;
  progressPct: number;
  income: number;
  expenses: number;
  cashRemaining: number;
  byPerson: { name: string; amount: number }[];
  monthly: { m: string; paid: number; income: number; expenses: number }[];
  trend: { m: string; remaining: number }[];
  approx: boolean;
};

/** The debt as it stood at the end of `date`: later lines dropped, a later settling undone. */
function viewAt(v: DebtView, date: string): DebtView | null {
  if (v.debt.opened_on > date) return null;
  const debt = { ...v.debt, settled_on: v.debt.settled_on && v.debt.settled_on <= date ? v.debt.settled_on : null };
  return debtView(debt, v.installments, v.lines.filter((l) => l.on_date <= date), date);
}

export function report(views: DebtView[], months: Record<string, { income: number; expenses: number }>, range: Range, today: string, conv: Conv, display: string): Report {
  const cur = (v: DebtView) => v.debt.currency;
  const act = views.filter(isActive);
  const pays = views.flatMap((v) => v.lines.filter((l) => l.kind === 'payment' && l.on_date >= range.from && l.on_date <= range.to).map((l) => ({ amount: l.amount_centavos, currency: cur(v) })));
  const ms = monthsIn(range);
  // A short period still draws the last 6 months for the trend charts, so a line is never a single dot.
  const trendMonths = ms.length >= 3 ? ms : monthsIn({ from: addMonths(monthOf(range.to) + '-01', -5), to: range.to });
  const paidIn = (m: string) => sumOf(views.flatMap((v) => v.lines.filter((l) => l.kind === 'payment' && monthOf(l.on_date) === m).map((l) => ({ amount: l.amount_centavos, currency: cur(v) }))), conv, display).total;
  const remainingAt = (date: string) =>
    sumOf(views.flatMap((v) => { const w = viewAt(v, date); return w && w.state !== 'settled' ? [{ amount: w.bal.remaining, currency: cur(v) }] : []; }), conv, display).total;
  const totalOwed = sumOf(act.map((v) => ({ amount: v.bal.owed, currency: cur(v) })), conv, display);
  const totalPaidAll = sumOf(act.map((v) => ({ amount: Math.min(v.bal.paid, v.bal.owed), currency: cur(v) })), conv, display);
  const debtPaid = sumOf(pays, conv, display);
  const remaining = sumOf(act.map((v) => ({ amount: v.bal.remaining, currency: cur(v) })), conv, display);
  const income = ms.reduce((n, m) => n + (months[m]?.income ?? 0), 0);
  const expenses = ms.reduce((n, m) => n + (months[m]?.expenses ?? 0), 0);
  return {
    range, months: ms, debtPaid, payCount: pays.length, remaining, totalOwed, totalPaidAll,
    progressPct: totalOwed.total > 0 ? Math.min(100, Math.floor((totalPaidAll.total * 100) / totalOwed.total)) : 0,
    income, expenses, cashRemaining: income - expenses - debtPaid.total,
    byPerson: people(views, conv, display).filter((p) => p.remaining.total > 0).map((p) => ({ name: p.name, amount: p.remaining.total })),
    monthly: trendMonths.map((m) => ({ m, paid: paidIn(m), income: months[m]?.income ?? 0, expenses: months[m]?.expenses ?? 0 })),
    trend: trendMonths.map((m) => ({ m, remaining: remainingAt(m < monthOf(today) ? monthEnd(m) : today) })),
    approx: remaining.approx || debtPaid.approx || totalOwed.approx,
  };
}

// ---------------- Schedule calendar ----------------
export type DayDot = 'overdue' | 'today' | 'upcoming' | 'paid';
export type CalRow = { view: DebtView; due: string; amount: number; short: number; state: DayDot; charge: boolean };

/** Every dated amount of the active debts (paid ones too) in one month, for the calendar. */
export function monthRows(views: DebtView[], ym: string, today: string): CalRow[] {
  const out: CalRow[] = [];
  for (const v of views) {
    if (v.state === 'settled' && !v.schedule.some((s) => monthOf(s.due_on) === ym)) continue;
    for (const s of v.schedule) {
      if (monthOf(s.due_on) !== ym) continue;
      const state: DayDot = s.short === 0 ? 'paid' : s.due_on < today ? 'overdue' : s.due_on === today ? 'today' : 'upcoming';
      out.push({ view: v, due: s.due_on, amount: s.amount, short: s.short, state, charge: isChargeRow(v, s.seq) });
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.view.debt.person_name.localeCompare(b.view.debt.person_name));
}
