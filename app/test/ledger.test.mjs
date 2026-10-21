// Phase 6a checks: money, installment plans, balance rules, the Add debt form, sync merging.
// Fake data only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { balance } from '../src/balance.ts';
import { buildDebt, emptyForm, isCleanLine, isCleanNote, validateForm } from '../src/ledger.ts';
import { newId } from '../src/ids.ts';
import { mergePulled } from '../src/merge.ts';
import { formatPesos, parsePesos, pesosToInput } from '../src/money.ts';
import { addMonths, buildPlan, isIsoDate, stepDate, todayIso } from '../src/plan.ts';
import { OfflineError, isDataError, pushWithFallback } from '../src/syncCore.ts';

// ---- money ----
test('parsePesos: plain amounts to exact centavos, junk refused', () => {
  assert.equal(parsePesos('1200'), 120000);
  assert.equal(parsePesos('1,200.50'), 120050);
  assert.equal(parsePesos('₱ 0.5'), 50);
  assert.equal(parsePesos('.99'), 99);
  assert.equal(parsePesos('0.1'), 10); // the classic float trap: 0.1 * 100 style errors must not happen
  assert.equal(parsePesos('19.99'), 1999);
  for (const bad of ['', '.', '0', '0.00', '-5', '1.234', 'abc', '12a', '1e5', '999999999.99'.replace('9', '99'), '1 000 000 000.00']) assert.equal(parsePesos(bad), null, JSON.stringify(bad));
  assert.equal(parsePesos('999,999,999.99'), 99999999999);
});

test('formatPesos and pesosToInput round-trip', () => {
  assert.equal(formatPesos(120000), '₱1,200');
  assert.equal(formatPesos(120050), '₱1,200.50');
  assert.equal(formatPesos(5), '₱0.05');
  assert.equal(formatPesos(-310000), '−₱3,100');
  for (const c of [1, 99, 100, 120050, 99999999999]) assert.equal(parsePesos(pesosToInput(c)), c);
});

// ---- dates and plans ----
test('dates: real dates only, month ends clamp, no drift', () => {
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2028-02-29'), true);
  assert.equal(isIsoDate('2026-1-5'), false);
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(stepDate('2026-01-31', 'monthly', 2), '2026-03-31'); // counted from the first date, so it does not stay stuck on the 28th
  assert.equal(stepDate('2026-01-01', 'weekly', 2), '2026-01-15');
  assert.equal(stepDate('2026-01-01', 'biweekly', 2), '2026-01-29');
  assert.equal(todayIso(new Date(2026, 0, 5, 23, 59)), '2026-01-05'); // local calendar date, not UTC
});

test('buildPlan: adds up to exactly what was borrowed', () => {
  const p = buildPlan(120000 * 3, 120000, 'monthly', '2026-10-20');
  assert.deepEqual(p?.map((r) => [r.seq, r.due_on, r.amount_centavos]), [[1, '2026-10-20', 120000], [2, '2026-11-20', 120000], [3, '2026-12-20', 120000]]);
  const odd = buildPlan(1000000, 300000, 'monthly', '2026-10-31'); // 10,000 in 3,000s: last one smaller
  assert.deepEqual(odd?.map((r) => r.amount_centavos), [300000, 300000, 300000, 100000]);
  assert.equal(odd?.reduce((s, r) => s + r.amount_centavos, 0), 1000000);
  assert.equal(buildPlan(100, 101, 'monthly', '2026-10-20'), null); // payment bigger than the debt
  assert.equal(buildPlan(100000, 100, 'monthly', '2026-10-20'), null); // 1,000 payments: refused
  assert.equal(buildPlan(60000, 100, 'monthly', '2026-10-20')?.length, 600); // exactly the limit is fine
  assert.equal(buildPlan(100, 10, 'monthly', 'nope'), null);
});

// ---- balance: the SPEC section 14 numbers ----
const inst = (seq, due_on, amount_centavos) => ({ seq, due_on, amount_centavos });
const line = (id, kind, amount_centavos, on_date, extra = {}) => ({ id, kind, amount_centavos, on_date, created_at: 1, ...extra });
const plan3 = [inst(1, '2026-10-20', 120000), inst(2, '2026-11-20', 120000), inst(3, '2026-12-20', 120000)];

test('balance: SPEC 14 steps 2-4 (3,600 then 3,100 then 3,200)', () => {
  assert.equal(balance(plan3, []).remaining, 360000);
  const paid = balance(plan3, [line('p1', 'payment', 50000, '2026-10-20')]);
  assert.equal(paid.remaining, 310000);
  assert.equal(paid.statuses[0].status, 'partly paid');
  assert.equal(paid.statuses[0].short, 70000);
  assert.equal(paid.next?.seq, 1);
  const fee = balance(plan3, [line('p1', 'payment', 50000, '2026-10-20'), line('c1', 'charge', 10000, '2026-10-25', { charge_kind: 'late_fee' })]);
  assert.equal(fee.remaining, 320000);
});

test('balance: late, overpaid, write-off, deleted lines, one-time', () => {
  const late = balance(plan3, [line('p1', 'payment', 120000, '2026-10-21')]);
  assert.equal(late.statuses[0].status, 'paid late');
  const onTime = balance(plan3, [line('p1', 'payment', 120000, '2026-10-20')]);
  assert.equal(onTime.statuses[0].status, 'paid');
  const over = balance(plan3, [line('p1', 'payment', 400000, '2026-10-20')]);
  assert.equal(over.remaining, 0);
  assert.equal(over.overpaid, 40000);
  const wo = balance(plan3, [line('p1', 'payment', 100000, '2026-10-20'), line('w1', 'writeoff', 260000, '2026-10-21')]);
  assert.equal(wo.remaining, 0);
  const gone = balance(plan3, [line('p1', 'payment', 100000, '2026-10-20', { deleted: true })]);
  assert.equal(gone.remaining, 360000);
  const one = balance([], [line('a', 'principal', 30000, '2026-10-01'), line('b', 'addition', 20000, '2026-10-05'), line('c', 'payment', 15000, '2026-10-06')]);
  assert.equal(one.remaining, 35000);
  assert.equal(one.pct, 30);
  const adj = balance([], [line('a', 'principal', 10000, '2026-10-01'), line('j1', 'adjustment', 500, '2026-10-02', { adjust_sign: 1 }), line('j2', 'adjustment', 200, '2026-10-02', { adjust_sign: -1 })]);
  assert.equal(adj.remaining, 10300);
});

// ---- the Add debt form ----
const goodOne = () => ({ ...emptyForm(), person: 'Test Lender', title: 'Test loan', amount: '1,200' });
const goodInst = () => ({ ...emptyForm(), person: 'Test Lender', title: 'Test plan', amount: '3600', kind: 'installments', payment: '1200', first: '2026-10-20' });

test('form: valid forms pass, every bad input is caught with a message', () => {
  assert.deepEqual(validateForm(goodOne()), {});
  assert.deepEqual(validateForm({ ...goodOne(), due: '' }), {}); // "pay when I can" is allowed (Joe, 2026-10-17)
  assert.deepEqual(validateForm(goodInst()), {});
  const bad = (patch, key) => assert.ok(validateForm({ ...goodOne(), ...patch })[key], `${key} for ${JSON.stringify(patch)}`);
  bad({ person: '   ' }, 'person');
  bad({ person: 'x'.repeat(61) }, 'person');
  bad({ person: 'Ana\u0007' }, 'person');
  bad({ person: 'Ana' + String.fromCharCode(0x202e) + 'xyz' }, 'person'); // right-to-left override
  bad({ title: 'y'.repeat(61) }, 'title');
  bad({ note: 'n'.repeat(501) }, 'note');
  bad({ amount: '' }, 'amount');
  bad({ amount: '0' }, 'amount');
  bad({ amount: '12.345' }, 'amount');
  bad({ due: '2026-02-30' }, 'due');
  assert.deepEqual(validateForm({ ...goodOne(), note: 'line1\nline2' }), {}); // newlines are fine in notes
  const badI = (patch, key) => assert.ok(validateForm({ ...goodInst(), ...patch })[key], `${key} for ${JSON.stringify(patch)}`);
  badI({ payment: '' }, 'payment');
  badI({ payment: '3601' }, 'payment');
  badI({ payment: '1' }, 'payment'); // 3,600 payments
  badI({ first: '' }, 'first');
  badI({ first: '2026-13-01' }, 'first');
});

test('text rules match the database: clean lines and notes', () => {
  assert.equal(isCleanLine('Maria Santos', 60), true);
  assert.equal(isCleanLine('a\tb', 60), false);
  assert.equal(isCleanNote('a\tb\nc', 500), true);
  assert.equal(isCleanNote('a' + String.fromCharCode(0x2067) + 'b', 500), false);
  assert.equal(isCleanNote('a' + String.fromCharCode(0x200f), 500), false);
});

test('buildDebt: one-time gets one principal line; installments get the plan and no principal line', () => {
  let n = 0;
  const ids = { debt: 'debt1', child: () => `c${++n}` };
  const one = buildDebt({ ...goodOne(), due: '2026-12-01' }, ids, 1000, '2026-10-19');
  assert.equal(one.debt.kind, 'one_time');
  assert.equal(one.debt.due_on, '2026-12-01');
  assert.equal(one.installments.length, 0);
  assert.deepEqual(one.lines.map((l) => [l.kind, l.amount_centavos, l.debt_id]), [['principal', 120000, 'debt1']]);
  assert.equal(balance(one.installments, one.lines).remaining, 120000);

  const two = buildDebt(goodInst(), { debt: 'debt2', child: () => `i${++n}` }, 1000, '2026-10-19');
  assert.equal(two.debt.due_on, null); // installments carry their own dates
  assert.equal(two.lines.length, 0);
  assert.equal(two.installments.length, 3);
  assert.equal(balance(two.installments, two.lines).remaining, 360000);
  assert.equal(new Set(two.installments.map((i) => i.id)).size, 3);

  const open = buildDebt(goodOne(), { debt: 'debt3', child: () => 'x' }, 1, '2026-10-19');
  assert.equal(open.debt.due_on, null);
  assert.throws(() => buildDebt({ ...goodOne(), amount: 'abc' }, ids, 1, '2026-10-19'));
  assert.throws(() => buildDebt({ ...goodInst(), payment: '' }, ids, 1, '2026-10-19'));
});

test('ids match the database rule and do not collide', () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const id = newId();
    assert.match(id, /^[A-Za-z0-9_-]{1,40}$/);
    seen.add(id);
  }
  assert.equal(seen.size, 2000);
});

// ---- sync ----
test('mergePulled: server wins, except for rows with unsent local edits', () => {
  const local = [{ id: 'a', v: 'local-a' }, { id: 'b', v: 'local-b' }];
  const pulled = [{ id: 'a', v: 'server-a' }, { id: 'b', v: 'server-b' }, { id: 'c', v: 'server-c' }];
  const out = Object.fromEntries(mergePulled(local, pulled, new Set(['b'])).map((r) => [r.id, r.v]));
  assert.deepEqual(out, { a: 'server-a', b: 'local-b', c: 'server-c' });
});

test('pushWithFallback: a bad row is set aside, offline stops the run, good rows still go', async () => {
  const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
  const sentBatches = [];
  const send = async (batch) => {
    sentBatches.push(batch.map((r) => r.id));
    return batch.some((r) => r.id === '2') ? { code: '23514', message: 'bad' } : null;
  };
  const res = await pushWithFallback(rows, send);
  assert.deepEqual(res, { sent: ['1', '3'], rejected: ['2'] });
  await assert.rejects(() => pushWithFallback(rows, async () => ({ message: 'TypeError: Failed to fetch' })), OfflineError);
  assert.equal(isDataError({ code: '42501' }), true);
  assert.equal(isDataError({ message: 'Failed to fetch' }), false);
});

test('currency is display only: the symbol changes, the centavos never do', async () => {
  const { CURRENCIES, formatPesos: f, isCurrency, setCurrency, currencySymbol } = await import('../src/money.ts');
  assert.equal(f(120050), '₱1,200.50');
  setCurrency('USD');
  assert.equal(currencySymbol(), '$');
  assert.equal(f(120050), '$1,200.50');
  assert.equal(parsePesos('1,200.50'), 120050); // parsing ignores the symbol and the currency
  setCurrency('nonsense');
  assert.equal(currencySymbol(), '$'); // unknown codes are ignored
  assert.equal(isCurrency('toString'), false); // not tricked by object prototype names
  assert.equal(isCurrency('EUR'), true);
  assert.equal(Object.keys(CURRENCIES).length, 7);
  setCurrency('PHP');
  assert.equal(f(5), '₱0.05');
});

test('compactPesos: chart labels stay short at phone width', async () => {
  const { compactPesos } = await import('../src/money.ts');
  assert.equal(compactPesos(85000, '₱'), '₱850');
  assert.equal(compactPesos(734750, '₱'), '₱7.3k');
  assert.equal(compactPesos(284750, '₱'), '₱2.8k');
  assert.equal(compactPesos(1200000, '₱'), '₱12k');
  assert.equal(compactPesos(100000, '₱'), '₱1k');
  assert.equal(compactPesos(99_949_900, '₱'), '₱999k');
  assert.equal(compactPesos(99_950_000, '₱'), '₱1M');
  assert.equal(compactPesos(123_456_700, '₱'), '₱1.2M');
  assert.equal(compactPesos(0, '₱'), '₱0');
  for (const c of [85000, 734750, 1200000, 99_949_900, 123_456_700]) assert.ok(compactPesos(c, '₱').length <= 6, `${c} short`);
});
