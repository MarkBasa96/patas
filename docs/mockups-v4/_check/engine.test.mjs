// The v4 mockup engine against figures worked out by hand from the sample data (engine.js `sample()`).
//   node --test docs/mockups-v4/_check/engine.test.mjs
import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';

const E = createRequire(import.meta.url)('../engine.js');
const { debts, cash } = E.sample();
const by = (id) => debts.find((d) => d.id === id);
const P = (pesos) => Math.round(pesos * 100);

test('each debt: owed, paid, remaining, state', () => {
  const want = {
    d1: [8450, 4700, 3750, 'upcoming'], d2: [3930, 1500, 2430, 'upcoming'], d3: [7485, 4990, 2495, 'upcoming'],
    d4: [10146, 4227.5, 5918.5, 'upcoming'], d5: [13800, 10237.5, 3562.5, 'overdue'], d6: [4350, 4350, 0, 'upcoming'],
    d7: [8950, 8950, 0, 'settled'], d8: [8650, 2000, 6650, 'none'],
  };
  for (const [id, [owed, paid, rem, state]] of Object.entries(want)) {
    const c = E.calc(by(id));
    assert.deepEqual([c.owed, c.paid, c.remaining, c.state], [P(owed), P(paid), P(rem), state], id);
  }
});

test('12 x 845.50 adds up exactly to 10,146.00', () => {
  assert.equal(by('d4').plan.length, 12);
  assert.ok(by('d4').plan.every((p) => p.amt === 84550));
});

test('recurring counts only what has fallen due; next one is upcoming', () => {
  const c = E.calc(by('d6'));
  assert.equal(c.next.due, '2026-11-15');
  assert.equal(c.next.short, P(1450));
});

test('ticking installments runs from the oldest unpaid', () => {
  assert.deepEqual(E.tickUpTo(by('d3'), 0).rows.map((r) => r.due), ['2026-11-28']); // 4 of 6 paid: Nov is next
  const all = E.tickUpTo(by('d3'), 1);
  assert.equal(all.total, P(2495)); // Nov + Dec = Select all = the whole remaining balance
  assert.equal(all.total, E.calc(by('d3')).remaining);
  assert.equal(E.tickUpTo(by('d4'), 2).total, P(2536.5)); // 3 x 845.50
  assert.equal(E.tickUpTo(by('d5'), 1).total, P(3562.5)); // overdue installment, then the late fee after it
});

test('Home numbers', () => {
  const h = E.home(debts, cash);
  assert.equal(h.owed, P(24806));
  assert.equal(h.activeCount, 7);
  assert.equal(h.dueThisMonth, P(15555.5));
  assert.equal(h.dueThisMonthPaid, P(7397.5));
  assert.equal(h.dueThisMonth - h.dueThisMonthPaid, P(8158)); // "left" on the Due card
  assert.equal(h.paidThisMonth, P(7397.5)); // 3,200 + 1,500 + 1,247.50 + 1,450
  assert.equal(h.paidRows.length, 4);
  assert.deepEqual([h.overdueCount, h.overdueAmount], [1, P(3562.5)]);
  assert.equal(h.cashRemaining, P(19959.65)); // 43,217.40 - 15,860.25 - 7,397.50
});

test('person ledger groups the same name, ignoring case and spaces', () => {
  const extra = [...debts, { ...by('d8'), id: 'd9', person: '  tita  merly ', lines: [{ id: 'x', kind: 'principal', amt: P(100), date: '2026-10-21' }] }];
  assert.equal(E.people(extra).find((p) => p.key === 'tita merly').debts.length, 3);
  const tm = E.people(debts).find((p) => p.key === 'tita merly');
  assert.deepEqual([tm.borrowed, tm.paid, tm.remaining], [P(12380), P(6200), P(6180)]);
  const ol = E.people(debts).find((p) => p.key === 'online lending app');
  assert.deepEqual([ol.borrowed, ol.remaining], [P(16135), P(9145)]);
  assert.equal(E.ledger(debts, 'tita merly').length, 6);
});

test('report periods and the debt trend (falls from May to today)', () => {
  assert.deepEqual(E.period('month'), { from: '2026-10-01', to: '2026-10-23' });
  assert.deepEqual(E.period('last_month'), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(E.period('week'), { from: '2026-10-19', to: '2026-10-23' }); // Monday to today (Friday)
  const r = E.report(debts, cash, E.period('month'));
  assert.equal(r.debtPaid, P(7397.5));
  assert.equal(r.remaining, P(24806));
  assert.deepEqual(r.trend.map((t) => t.remaining), [54695.5, 50560, 42264.5, 34969, 26673.5, 24806].map(P));
  assert.deepEqual([r.totalOwed, r.totalPaidAll, r.progressPct], [P(56811), P(32005), 56]);
});

test('what one payment paid for, oldest first', () => {
  const d3 = by('d3'), third = d3.lines.filter((l) => l.kind === 'payment')[2];
  assert.deepEqual(E.coverOf(d3, third.id).rows.map((r) => [r.seq, r.amt]), [[3, P(1247.5)]]);
  const d1 = by('d1'), pay = d1.lines.find((l) => l.kind === 'payment');
  assert.deepEqual(E.coverOf(d1, pay.id).rows.map((r) => [r.seq, r.amt, r.of]), [[1, P(1500), P(8450)]]);
});

test('reminder dates: one per switched-on offset, for the next unpaid amount', () => {
  assert.deepEqual(E.reminderDates(by('d1')), ['2026-10-24', '2026-10-25']); // due Oct 25: 1 day before + on the day
  assert.deepEqual(E.reminderDates(by('d6')), []); // reminders off
  assert.deepEqual(E.reminderDates({ ...by('d3'), remind: { on: true, offsets: [7, 3], custom: '2026-10-26', time: '09:00' } }), ['2026-10-26', '2026-11-21', '2026-11-25']);
});

test('a recurring debt shows one "due" line per month; same day: the borrowing comes before the payment', () => {
  const rows = E.ledger(debts, 'kuya ramil').slice().reverse(); // oldest first
  let bal = 0; const negative = [];
  for (const r of rows) { bal += r.kind === 'payment' ? -r.amt : r.amt; if (bal < 0) negative.push(r.date); }
  assert.equal(rows.filter((r) => r.kind === 'borrowed').length, 3); // Aug, Sep, Oct
  assert.deepEqual(negative, ['2026-10-14']); // October paid a day early: shown as "ahead", the only one
  assert.equal(bal, 0);
});
