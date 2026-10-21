// Phase 6d checks: Home / Schedule / Reports numbers. Fake data only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { debtView } from '../src/derive.ts';
import { cashRemaining, homeTotals, monthlyPayments, nextPayment, scheduleRows } from '../src/home.ts';
import { buildDebt, emptyForm } from '../src/ledger.ts';
import { buildLine, emptyLineForm, settle } from '../src/lines.ts';

const TODAY = '2026-10-19';
let n = 0;
const inst = (person, amount, payment, first) => buildDebt({ ...emptyForm(), person, amount, kind: 'installments', payment, first }, { debt: `d${++n}`, child: () => `c${++n}` }, 100 + n, '2026-09-01');
const one = (person, amount, due = '') => buildDebt({ ...emptyForm(), person, amount, due }, { debt: `d${++n}`, child: () => `c${++n}` }, 100 + n, '2026-09-01');
const pay = (made, amount, date) => buildLine('payment', { ...emptyLineForm(TODAY), amount, date }, made.debt.id, `p${++n}`, 500 + n);
const v = (made, extra = []) => debtView(made.debt, made.installments, [...made.lines, ...extra], TODAY);

test('SPEC 14: 3 x 1,200 from this month gives total 3,600, due this month 1,200 with 0 paid; then partial 500', () => {
  const plan = inst('Test Lender', '3600', '1200', '2026-10-20');
  let t = homeTotals([v(plan)], TODAY);
  assert.deepEqual([t.owed, t.dueThisMonth, t.dueThisMonthPaid, t.paidThisMonth], [360000, 120000, 0, 0]);
  t = homeTotals([v(plan, [pay(plan, '500', '2026-10-19')])], TODAY);
  assert.deepEqual([t.owed, t.dueThisMonth, t.dueThisMonthPaid, t.paidThisMonth], [310000, 120000, 50000, 50000]);
});

test('owed is never netted; settled debts are left out of owed and due; deleted ones never reach here', () => {
  const a = inst('A', '3600', '1200', '2026-10-05');
  const b = one('B', '300', '2026-10-25');
  const c = one('C', '999');
  const done = one('D', '500');
  const dv = v(done);
  const settledView = debtView(settle(dv, TODAY, true, () => 'w', 1).debt, [], [...done.lines], TODAY);
  const t = homeTotals([v(a), v(b), v(c), settledView], TODAY);
  assert.equal(t.owed, 360000 + 30000 + 99900);
  assert.equal(t.activeCount, 3);
  assert.equal(t.dueThisMonth, 120000 + 30000);
  assert.equal(t.overdueCount, 1);
  assert.equal(t.overdueAmount, 120000); // A's October 5 installment
});

test('paid this month counts payments by their own date, across all debts', () => {
  const a = one('A', '1000');
  const b = one('B', '1000');
  const t = homeTotals([v(a, [pay(a, '100', '2026-10-02'), pay(a, '50', '2026-09-30')]), v(b, [pay(b, '25', '2026-10-19')])], TODAY);
  assert.equal(t.paidThisMonth, 12500);
});

test('nextPayment: overdue first, then soonest; none when nothing has a date', () => {
  const late = one('Late', '100', '2026-10-01');
  const soon = one('Soon', '100', '2026-10-25');
  const open = one('Open', '100');
  assert.equal(nextPayment([v(open)]), null);
  assert.equal(nextPayment([v(soon), v(open), v(late)]).debt.person_name, 'Late');
  assert.equal(nextPayment([]), null);
});

test('schedule: unpaid installments (short amount) and dated one-time debts, soonest first; paid ones are gone', () => {
  const plan = inst('Plan', '3600', '1200', '2026-10-20');
  const dated = one('Dated', '300', '2026-10-10');
  const open = one('Open', '300');
  const rows = scheduleRows([v(plan, [pay(plan, '500', '2026-10-19')]), v(dated), v(open)], TODAY);
  assert.deepEqual(rows.map((r) => [r.person, r.date, r.amount, r.overdue]), [
    ['Dated', '2026-10-10', 30000, true],
    ['Plan', '2026-10-20', 70000, false],
    ['Plan', '2026-11-20', 120000, false],
    ['Plan', '2026-12-20', 120000, false],
  ]);
  const paid = scheduleRows([v(plan, [pay(plan, '1200', '2026-10-19')])], TODAY);
  assert.equal(paid.length, 2);
});

test('monthlyPayments: six months ending now, oldest first, zero-filled', () => {
  const a = one('A', '5000');
  const out = monthlyPayments([v(a, [pay(a, '100', '2026-10-02'), pay(a, '200', '2026-08-15'), pay(a, '999', '2026-01-01')])], TODAY, 6);
  assert.deepEqual(out.map((o) => o.ym), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(out.map((o) => o.amount), [0, 0, 0, 20000, 0, 10000]);
  assert.equal(monthlyPayments([], '2026-02-10', 3).map((o) => o.ym).join(), '2025-12,2026-01,2026-02'); // wraps the year
});

test('cash remaining: income - expenses - debt payments, can go negative', () => {
  assert.equal(cashRemaining(5000000, 2000000, 120000), 2880000);
  assert.equal(cashRemaining(100, 200, 50), -150);
});
