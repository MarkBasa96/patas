// Phase 6b checks: payments, charges, settle, reopen, overpay. Fake data only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { debtView } from '../src/derive.ts';
import { buildDebt, emptyForm } from '../src/ledger.ts';
import { buildLine, emptyLineForm, formFromLine, history, remainingAfter, reopen, settle, validateLine } from '../src/lines.ts';

const TODAY = '2026-10-19';
let n = 0;
const instForm = { ...emptyForm(), person: 'Test Bank', amount: '3600', kind: 'installments', payment: '1200', first: '2026-10-20' };
const make = () => buildDebt(instForm, { debt: `d${++n}`, child: () => `c${++n}` }, 1000, TODAY);
const view = (made, extra = []) => debtView(made.debt, made.installments, [...made.lines, ...extra], TODAY);
const pay = (made, amount, date, id) => buildLine('payment', { ...emptyLineForm(TODAY), amount, date }, made.debt.id, id, 2000 + n++);

test('validateLine: amount, real date, not in the future, clean text', () => {
  const ok = { ...emptyLineForm(TODAY), amount: '500' };
  assert.deepEqual(validateLine(ok, 'payment', TODAY), {});
  assert.ok(validateLine({ ...ok, amount: '' }, 'payment', TODAY).amount);
  assert.ok(validateLine({ ...ok, amount: '0' }, 'payment', TODAY).amount);
  assert.ok(validateLine({ ...ok, date: '2026-10-20' }, 'payment', TODAY).date); // tomorrow
  assert.ok(validateLine({ ...ok, date: '2026-02-30' }, 'charge', TODAY).date);
  assert.ok(validateLine({ ...ok, note: 'x'.repeat(301) }, 'payment', TODAY).note);
  assert.ok(validateLine({ ...ok, method: 'a\tb' }, 'payment', TODAY).method);
  assert.deepEqual(validateLine({ ...ok, date: TODAY }, 'charge', TODAY), {});
});

test('SPEC 14 steps 2-4 through the real functions: 3,600 -> partial 500 -> 3,100 -> late fee 100 -> 3,200', () => {
  const made = make();
  assert.equal(view(made).bal.remaining, 360000);
  const p = pay(made, '500', '2026-10-20', 'pay1');
  const v2 = view(made, [p]);
  assert.equal(v2.bal.remaining, 310000);
  assert.equal(v2.bal.statuses[0].status, 'partly paid');
  assert.equal(v2.bal.statuses[0].short, 70000);
  assert.equal(v2.next.amount, 70000);
  const fee = buildLine('charge', { ...emptyLineForm(TODAY), amount: '100', chargeKind: 'late_fee' }, made.debt.id, 'fee1', 3000);
  assert.equal(fee.charge_kind, 'late_fee');
  assert.equal(fee.method, '');
  assert.equal(view(made, [p, fee]).bal.remaining, 320000);
});

test('editing a payment replaces it (same id); remainingAfter accounts for it', () => {
  const made = make();
  const p = pay(made, '500', '2026-10-20', 'pay1');
  const v = view(made, [p]);
  const edited = buildLine('payment', { ...formFromLine(p), amount: '800' }, made.debt.id, 'ignored', 9999, p);
  assert.equal(edited.id, 'pay1');
  assert.equal(edited.created_at, p.created_at);
  assert.equal(view(made, [edited]).bal.remaining, 280000);
  assert.equal(remainingAfter(v, 50000), 260000);
  assert.equal(remainingAfter(v, 80000, p), 280000); // editing 500 -> 800 leaves 2,800
  const over = view(made, [pay(made, '4000', '2026-10-20', 'big')]);
  assert.equal(over.bal.overpaid, 40000);
  assert.equal(remainingAfter(view(made), 400000), -40000); // negative = overpaid
  assert.equal(formFromLine(p).amount, '500');
});

test('late: paying after the due date marks the installment "paid late"', () => {
  const made = make();
  const v = view(made, [pay(made, '1200', '2026-10-25', 'late1')]);
  assert.equal(v.bal.statuses[0].status, 'paid late');
  assert.equal(view(made, [pay(made, '1200', '2026-10-20', 'ok1')]).bal.statuses[0].status, 'paid');
});

test('settle with a write-off: balance reaches zero, history is true; reopen takes back only that line', () => {
  const made = make();
  const p = pay(made, '500', '2026-10-20', 'pay1');
  const v = view(made, [p]);
  let k = 0;
  const s = settle(v, TODAY, true, () => `w${++k}`, 5000);
  assert.equal(s.debt.settled_on, TODAY);
  assert.equal(s.lines.length, 1);
  assert.deepEqual([s.lines[0].kind, s.lines[0].amount_centavos], ['writeoff', 310000]);
  const settled = debtView(s.debt, made.installments, [...made.lines, p, ...s.lines], TODAY);
  assert.equal(settled.bal.remaining, 0);
  assert.equal(settled.state, 'settled');
  assert.equal(history(settled, ['payment']).length, 1); // payment history untouched

  const r = reopen(settled);
  assert.equal(r.debt.settled_on, null);
  assert.deepEqual(r.lines.map((l) => [l.id, l.deleted]), [['w1', true]]);
  const again = debtView(r.debt, made.installments, [...made.lines, p, ...r.lines], TODAY);
  assert.equal(again.bal.remaining, 310000);
  assert.notEqual(again.state, 'settled');

  // a write-off the user logged by hand is not undone by reopen
  const manual = { ...s.lines[0], id: 'manual', note: 'discount agreed' };
  const keep = reopen(debtView(s.debt, made.installments, [...made.lines, p, manual], TODAY));
  assert.equal(keep.lines.length, 0);
});

test('settle without a write-off, or when nothing is left, adds no line', () => {
  const made = make();
  assert.equal(settle(view(made), TODAY, false, () => 'x', 1).lines.length, 0);
  const paid = view(made, [pay(made, '3600', '2026-10-20', 'all')]);
  assert.equal(paid.bal.remaining, 0);
  assert.equal(settle(paid, TODAY, true, () => 'x', 1).lines.length, 0);
});

test('history lists newest first and only the asked kinds', () => {
  const made = make();
  const a = pay(made, '100', '2026-10-01', 'a');
  const b = pay(made, '100', '2026-10-05', 'b');
  const fee = buildLine('charge', { ...emptyLineForm(TODAY), amount: '5', date: '2026-10-03' }, made.debt.id, 'f', 1);
  const v = view(made, [a, b, fee]);
  assert.deepEqual(history(v, ['payment']).map((l) => l.id), ['b', 'a']);
  assert.deepEqual(history(v, ['charge']).map((l) => l.id), ['f']);
});

test('autoSettled: paying the last peso settles the debt by itself; nothing else does', async () => {
  const { autoSettled } = await import('../src/lines.ts');
  const made = make();
  assert.equal(autoSettled(view(made), TODAY), null);
  assert.equal(autoSettled(view(made, [pay(made, '3599', '2026-10-20', 'p')]), TODAY), null);
  const done = autoSettled(view(made, [pay(made, '3600', '2026-10-20', 'p')]), TODAY);
  assert.equal(done.settled_on, TODAY);
  const already = { ...made, debt: { ...made.debt, settled_on: '2026-10-01' } };
  assert.equal(autoSettled(view(already, [pay(made, '3600', '2026-10-20', 'p')]), TODAY), null);
  // a one-time debt of 300 paid in full (SPEC 14 step 5)
  const friend = buildDebt({ ...emptyForm(), person: 'Test Friend', amount: '300' }, { debt: 'f1', child: () => 'fc' }, 1, TODAY);
  const fv = debtView(friend.debt, [], [...friend.lines, buildLine('payment', { ...emptyLineForm(TODAY), amount: '300' }, 'f1', 'fp', 2)], TODAY);
  assert.equal(autoSettled(fv, TODAY).settled_on, TODAY);
});
