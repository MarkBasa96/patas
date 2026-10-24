// Round 4 money rules: installments by count, recurring debts (dates, what is owed, paying ahead, never settling
// by itself while it runs), server rows with the new fields. Fake data only.
import assert from 'node:assert/strict';
import test from 'node:test';

import { debtView } from '../src/derive.ts';
import { buildDebt, emptyForm, formPlan, validateForm } from '../src/ledger.ts';
import { autoSettled } from '../src/lines.ts';
import { planByCount } from '../src/plan.ts';
import { recurringDates } from '../src/recurring.ts';
import { remindDays, rowFrom } from '../src/rows.ts';

const TODAY = '2026-10-23';
const P = (pesos) => Math.round(pesos * 100);
let n = 0;
const ids = () => ({ debt: 'd' + ++n, child: () => 'c' + ++n });

test('installments by count: equal payments, the rounding in the last one', () => {
  assert.deepEqual(planByCount(P(5000), 6, 'monthly', '2026-10-28').map((r) => r.amount_centavos), [83333, 83333, 83333, 83333, 83333, 83335]);
  assert.deepEqual(planByCount(P(10146), 12, 'monthly', '2026-05-30').map((r) => r.amount_centavos), Array(12).fill(84550));
  assert.equal(planByCount(P(5000), 6, 'monthly', '2026-10-28').at(-1).due_on, '2027-03-28');
  assert.deepEqual(planByCount(P(5000), 3, 'monthly', '2026-10-28', P(2000)).map((r) => r.amount_centavos), [P(2000), P(2000), P(1000)]); // typed each payment
  assert.equal(planByCount(P(5000), 3, 'monthly', '2026-10-28', P(2600)), null); // 2 x 2,600 already passes 5,000
  assert.equal(planByCount(P(5000), 0, 'monthly', '2026-10-28'), null);
  assert.equal(planByCount(P(5000), 601, 'monthly', '2026-10-28'), null);
  assert.equal(planByCount(P(5000), 3, 'weekly', '2026-10-28')[2].due_on, '2026-11-11');
});

test('the Add debt form: three kinds, each checked', () => {
  const inst = { ...emptyForm(TODAY), person: 'Test Lender', amount: '5,000.00', kind: 'installments', count: '6', first: '2026-10-28' };
  assert.deepEqual(validateForm(inst), {});
  assert.equal(formPlan(inst).length, 6);
  assert.ok(validateForm({ ...inst, count: 'six' }).count);
  assert.ok(validateForm({ ...inst, count: '', payment: '' }).count);
  assert.ok(validateForm({ ...inst, payment: '2,600' }).payment); // too big for 3? (6 here: 5 x 2,600 > 5,000)
  const rec = { ...emptyForm(TODAY), person: 'Test Lender', amount: '650', kind: 'recurring', first: '2026-11-01' };
  assert.deepEqual(validateForm(rec), {});
  assert.ok(validateForm({ ...rec, first: '' }).first);
  assert.ok(validateForm({ ...rec, until: '2026-10-01' }).until);
  assert.ok(validateForm({ ...rec, currency: 'usd' }).currency);
  const one = { ...emptyForm(TODAY), person: 'Test Lender', amount: '120', currency: 'USD', opened: '2026-10-20' };
  const made = buildDebt(one, ids(), 1, TODAY);
  assert.deepEqual([made.debt.currency, made.debt.opened_on, made.lines[0].on_date, made.debt.remind_days.join()], ['USD', '2026-10-20', '2026-10-20', '0,1']);
  assert.equal(buildDebt({ ...one, opened: '2026-12-01' }, ids(), 1, TODAY).debt.opened_on, TODAY); // never borrowed in the future
});

test('recurring dates: counted from the first date, the end date respected', () => {
  assert.deepEqual(recurringDates({ amount: 1, every: 'monthly', first: '2026-01-31', until: null }, '2026-04-30'), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  assert.deepEqual(recurringDates({ amount: 1, every: 'weekly', first: '2026-10-07', until: '2026-10-21' }, '2026-12-31'), ['2026-10-07', '2026-10-14', '2026-10-21']);
  assert.deepEqual(recurringDates({ amount: 1, every: 'biweekly', first: '2026-10-07', until: null }, '2026-11-04'), ['2026-10-07', '2026-10-21', '2026-11-04']);
});

const recDebt = (lines, extra = {}) => {
  const d = buildDebt({ ...emptyForm(TODAY), person: 'Kuya Ramil', amount: '1,450', kind: 'recurring', first: '2026-08-15' }, ids(), 1, TODAY).debt;
  return debtView({ ...d, ...extra }, [], lines.map((l, i) => ({ id: 'L' + i + n, debt_id: d.id, kind: 'payment', charge_kind: null, adjust_sign: null, amount_centavos: l[0], on_date: l[1], note: '', method: 'Cash', created_at: i, deleted: false })), TODAY);
};

test('recurring: only dates that have arrived are owed; a payment ahead pays the coming date', () => {
  const v = recDebt([[P(1450), '2026-08-15'], [P(1450), '2026-09-15'], [P(1450), '2026-10-14']]);
  assert.deepEqual([v.bal.owed, v.bal.paid, v.bal.remaining, v.bal.overpaid], [P(4350), P(4350), 0, 0]);
  assert.deepEqual([v.next.date, v.next.amount, v.state], ['2026-11-15', P(1450), 'upcoming']);
  assert.ok(v.schedule.length >= 6); // Aug..Jan: the coming three months are shown to tick ahead
  const late = recDebt([[P(1450), '2026-08-15']]);
  assert.deepEqual([late.bal.remaining, late.state, late.next.date], [P(2900), 'overdue', '2026-09-15']);
  const ahead = recDebt([[P(1450 * 4), '2026-10-01']]);
  assert.deepEqual([ahead.bal.remaining, ahead.bal.overpaid, ahead.next.date], [0, 0, '2026-12-15']); // Nov paid ahead, never "overpaid"
  assert.equal(ahead.schedule.find((s) => s.due_on === '2026-11-15').short, 0);
});

test('recurring never settles by itself while it runs; it does once its end date has passed and all is paid', () => {
  const running = recDebt([[P(4350), '2026-10-14']]);
  assert.equal(autoSettled(running, TODAY), null);
  const ended = recDebt([[P(4350), '2026-10-14']], { recurring_until: '2026-10-15' });
  assert.equal(autoSettled(ended, TODAY)?.settled_on, TODAY);
  const endedUnpaid = recDebt([[P(2900), '2026-10-14']], { recurring_until: '2026-10-15' });
  assert.equal(autoSettled(endedUnpaid, TODAY), null);
});

test('rows from the server: new fields checked, odd values fall back, a broken recurring row is dropped', () => {
  const base = { id: 'x', kind: 'one_time', person_name: 'Test Lender', opened_on: '2026-10-01', created_at: 1 };
  const r = rowFrom.debts({ ...base, remind_days: [7, 0, 2, 0], remind_at: '18:00:00', currency: 'USD', remind_on: '2026-10-30' });
  assert.deepEqual([r.remind_days.join(), r.remind_at, r.currency, r.remind_on], ['0,7', '18:00', 'USD', '2026-10-30']);
  const old = rowFrom.debts(base); // a row from before round 4
  assert.deepEqual([old.remind_days.join(), old.remind_at, old.currency, old.recurring_every], ['0,1', null, 'PHP', null]);
  assert.equal(rowFrom.debts({ ...base, currency: 'peso' }).currency, 'PHP');
  assert.equal(rowFrom.debts({ ...base, kind: 'recurring' }), null);
  const rec = rowFrom.debts({ ...base, kind: 'recurring', recurring_amount_centavos: 145000, recurring_every: 'monthly', recurring_first: '2026-08-15' });
  assert.deepEqual([rec.kind, rec.recurring_amount_centavos, rec.recurring_until], ['recurring', 145000, null]);
  assert.equal(rowFrom.debts({ ...base, kind: 'weird' }), null);
  assert.deepEqual(remindDays('not a list'), [0, 1]);
});

import { applySettingsPulled, cashByMonth, emptyLocal, reviveLocal, setCashMonth, setNameLocal } from '../src/local.ts';
import { todayIso } from '../src/plan.ts';

test('cash flow per month: an older phone’s two numbers become this month’s row, once', () => {
  const old = { ...emptyLocal(), cash: { income: P(43217.4), expenses: P(15860.25) } };
  delete old.data.cash; delete old.dirty.cash; delete old.cursors.cash; // a phone saved before round 4
  const l = reviveLocal(JSON.parse(JSON.stringify(old)));
  const month = todayIso().slice(0, 7);
  assert.deepEqual(cashByMonth(l), { [month]: { income: P(43217.4), expenses: P(15860.25) } });
  assert.ok(l.dirty.cash[month] !== undefined); // waiting to be sent (same id as the server's own carry-over)
  assert.deepEqual(l.cash, { income: 0, expenses: 0 });
  assert.equal(reviveLocal(JSON.parse(JSON.stringify(l))).data.cash.length, 1); // revived again: still one row
  const two = setCashMonth(setCashMonth(l, '2026-09', P(42519.9), P(16127.75), 1), '2026-09', P(1), P(2), 2);
  assert.deepEqual(cashByMonth(two)['2026-09'], { income: P(1), expenses: P(2) }); // same month, replaced
  assert.equal(setCashMonth(l, '2026-13', 1, 1, 1), l); // not a month: nothing changes
  assert.equal(cashByMonth(setCashMonth(l, '2026-08', -5, P(1), 1))['2026-08'].income, 0); // never negative
});

test('the greeting name: trimmed, at most 40 characters, an unsent change is not overwritten by the server', () => {
  const l = setNameLocal(emptyLocal(), '   Rina   Santos  ');
  assert.equal(l.name, 'Rina Santos');
  assert.equal(setNameLocal(l, 'x'.repeat(60)).name.length, 40);
  assert.equal(applySettingsPulled(l, { currency: 'PHP', name: 'Old Name' }).name, 'Rina Santos'); // dirty: mine wins
  assert.equal(applySettingsPulled({ ...l, settingsDirty: false }, { currency: 'USD', name: 'From Cloud' }).name, 'From Cloud');
});

import { convert, sane } from '../src/fx.ts';

test('exchange rates: display only, exact rule, never a guess, untrusted answers cleaned', () => {
  const rates = { base: 'PHP', date: '', fetchedAt: 0, rates: { USD: 1 / 58.12, JPY: 1 / 0.383 } };
  assert.equal(convert(P(120), 'USD', 'PHP', rates), P(6974.4)); // $120.00 = ₱6,974.40
  assert.equal(convert(P(24806), 'PHP', 'USD', rates), 42681); // ≈ $426.81
  assert.equal(convert(P(500), 'PHP', 'PHP', null), P(500)); // same currency needs no rates
  assert.equal(convert(P(500), 'USD', 'PHP', null), null); // no rates: no guess
  assert.equal(convert(P(500), 'AED', 'PHP', rates), null); // missing rate: no guess
  assert.deepEqual(sane({ USD: 0.0172, bad: 1, EUR: -1, JPY: Infinity, GBP: '0.01', AED: 0.06 }), { USD: 0.0172, AED: 0.06 });
});
