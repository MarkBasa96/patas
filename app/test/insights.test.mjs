// Round 4 insights (Home, people, ledger, ticking, reports, calendar) against the approved mockup's engine.
// The engine's figures were worked out by hand (docs/mockups-v4/_check/engine.test.mjs); here the same invented
// sample account is turned into the app's real rows, so the app must reach the same numbers. Fake data only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import { debtView } from '../src/derive.ts';
import { DEBT_DEFAULTS } from '../src/ledger.ts';
import { coverOf, homeInsights, monthRows, people, period, personKey, personLedger, report, sameOnly, sumOf, tickUpTo } from '../src/insights.ts';
import { formatMoney, formatPesos } from '../src/money.ts';
import { photoFromServer, photoIdFor } from '../src/photo.ts';

const E = createRequire(import.meta.url)('../../docs/mockups-v4/engine.js');
const TODAY = E.TODAY;
const P = (pesos) => Math.round(pesos * 100);

/** The engine's sample debts as the app's rows (debts, installments, lines), then as views. */
function appViews(debts = E.sample().debts, today = TODAY) {
  return debts.map((d, i) => {
    const row = {
      id: d.id, direction: 'i_owe', kind: d.kind, person_name: d.person, title: d.title, due_on: d.due ?? null, opened_on: d.opened,
      settled_on: d.settledOn ?? null, remind: !!d.remind?.on, qr_id: null, note: '', created_at: i, deleted: false, ...DEBT_DEFAULTS,
      ...(d.kind === 'recurring' ? { recurring_amount_centavos: d.amount, recurring_every: d.freq, recurring_first: d.first, recurring_until: null } : {}),
    };
    const inst = (d.plan ?? []).map((p) => ({ id: `${d.id}i${p.seq}`, debt_id: d.id, seq: p.seq, due_on: p.due, amount_centavos: p.amt, created_at: 0, deleted: false }));
    const lines = d.lines.map((l, k) => ({ id: l.id, debt_id: d.id, kind: l.kind, charge_kind: l.kind === 'charge' ? 'late_fee' : null, adjust_sign: null, amount_centavos: l.amt, on_date: l.date, note: l.note ?? '', method: l.method ?? '', created_at: k, deleted: false }));
    return debtView(row, inst, lines, today);
  });
}
const PHP = sameOnly('PHP');
const views = appViews();
const byId = (id) => views.find((v) => v.debt.id === id);
const { cash } = E.sample();

test('each debt: same owed, paid, remaining as the hand-checked engine', () => {
  for (const d of E.sample().debts) {
    const c = E.calc(d), v = byId(d.id);
    assert.deepEqual([v.bal.owed, Math.min(v.bal.paid, v.bal.owed), v.bal.remaining], [c.owed, Math.min(c.paid, c.owed), c.remaining], d.id);
  }
  assert.equal(byId('d5').state, 'overdue');
  assert.equal(byId('d7').state, 'settled');
});

test('Home: totals, due (left and paid), paid this month, overdue, cash remaining', () => {
  const h = homeInsights(views, cash, TODAY, PHP, 'PHP');
  assert.equal(h.owed.total, P(24806));
  assert.equal(h.activeCount, 7);
  assert.equal(h.dueThisMonth.total, P(15555.5));
  assert.equal(h.dueThisMonthPaid.total, P(7397.5));
  assert.equal(h.paidThisMonth.total, P(7397.5));
  assert.equal(h.paid.length, 4);
  assert.equal(h.paid[0].line.on_date >= h.paid[3].line.on_date, true); // newest first
  assert.deepEqual([h.overdueCount, h.overdueAmount.total], [1, P(3562.5)]);
  assert.equal(h.cashRemaining, P(19959.65));
  assert.equal(h.owed.approx, false);
});

test('Home: an overdue date from an earlier month is carried into "due this month"', () => {
  const late = appViews(E.sample().debts, '2026-11-20');
  const h = homeInsights(late, cash, '2026-11-20', PHP, 'PHP');
  const carried = h.due.filter((d) => d.carried);
  assert.ok(carried.length > 0);
  assert.ok(carried.every((d) => d.due < '2026-11-01' && d.short > 0));
});

test('people: same name in any case and spacing is one person; ledger has every entry', () => {
  const ppl = people(views, PHP, 'PHP');
  const tm = ppl.find((p) => p.key === 'tita merly');
  assert.deepEqual([tm.borrowed.total, tm.paid.total, tm.remaining.total], [P(12380), P(6200), P(6180)]);
  const ol = ppl.find((p) => p.key === 'online lending app');
  assert.deepEqual([ol.borrowed.total, ol.remaining.total], [P(16135), P(9145)]);
  assert.equal(personKey('  Tita   MERLY '), 'tita merly');
  const extra = appViews([...E.sample().debts, { ...E.sample().debts[7], id: 'd9', person: '  tita  merly ', lines: [{ id: 'x', kind: 'principal', amt: P(100), date: '2026-10-21' }] }]);
  assert.equal(people(extra, PHP, 'PHP').find((p) => p.key === 'tita merly').views.length, 3);
  const led = personLedger(views, 'tita merly', TODAY);
  assert.equal(led.length, 6);
  assert.ok(led.every((e, i) => i === 0 || led[i - 1].date >= e.date)); // newest first
});

test('ticking runs from the oldest unpaid; Select all = the whole remaining, late fee included', () => {
  assert.deepEqual(tickUpTo(byId('d3'), 0).rows.map((r) => r.due_on), ['2026-11-28']);
  assert.equal(tickUpTo(byId('d3'), 1).total, byId('d3').bal.remaining);
  assert.equal(tickUpTo(byId('d4'), 2).total, P(2536.5));
  assert.equal(tickUpTo(byId('d5'), 1).total, P(3562.5)); // the overdue installment, then the late fee
  assert.equal(tickUpTo(byId('d5'), 99).total, byId('d5').bal.remaining);
  assert.equal(tickUpTo(byId('d5'), -1).total, 0);
});

test('what one payment paid for', () => {
  const d3 = byId('d3'), third = d3.lines.filter((l) => l.kind === 'payment')[2];
  assert.deepEqual(coverOf(d3, third.id).rows.map((r) => [r.seq, r.amount]), [[3, P(1247.5)]]);
  assert.equal(coverOf(d3, 'nope').rows.length, 0);
});

test('reports: periods, totals and the trend match the engine', () => {
  assert.deepEqual(period('month', TODAY), { from: '2026-10-01', to: '2026-10-23' });
  assert.deepEqual(period('last_month', TODAY), { from: '2026-09-01', to: '2026-09-30' });
  assert.deepEqual(period('week', TODAY), { from: '2026-10-19', to: '2026-10-23' });
  assert.deepEqual(period('custom', TODAY, { from: '2026-10-09', to: '2026-10-01' }), { from: '2026-10-01', to: '2026-10-23' }); // backwards range refused
  const r = report(views, cash, period('month', TODAY), TODAY, PHP, 'PHP');
  const e = E.report(E.sample().debts, cash, E.period('month'));
  assert.equal(r.debtPaid.total, e.debtPaid);
  assert.equal(r.remaining.total, e.remaining);
  assert.deepEqual(r.trend.map((t) => t.remaining), e.trend.map((t) => t.remaining));
  assert.deepEqual([r.totalOwed.total, r.totalPaidAll.total, r.progressPct], [e.totalOwed, e.totalPaidAll, e.progressPct]);
  assert.deepEqual(r.byPerson.map((p) => p.amount), e.byPerson.map((p) => p.amt));
  assert.deepEqual(r.monthly.map((m) => m.paid), e.monthly.map((m) => m.paid));
});

test('calendar: a month has its dated rows with the right dots', () => {
  const oct = monthRows(views, '2026-10', TODAY);
  assert.ok(oct.some((r) => r.state === 'paid'));
  assert.ok(oct.some((r) => r.state === 'overdue' && r.view.debt.id === 'd5'));
  assert.ok(oct.some((r) => r.state === 'upcoming' && r.due === '2026-10-25'));
  assert.ok(oct.every((r) => r.due.startsWith('2026-10')));
});

test('other currencies: converted totals are approximate, and an unknown rate never hides money', () => {
  const conv = (a, from) => (from === 'PHP' ? a : from === 'USD' ? a * 58 : null);
  assert.deepEqual(sumOf([{ amount: 100, currency: 'PHP' }, { amount: 100, currency: 'USD' }], conv, 'PHP'), { total: 5900, approx: true });
  assert.deepEqual(sumOf([{ amount: 100, currency: 'PHP' }, { amount: 100, currency: 'XYZ' }], conv, 'PHP'), { total: 200, approx: true });
  assert.deepEqual(sumOf([{ amount: 100, currency: 'PHP' }], conv, 'PHP'), { total: 100, approx: false });
});

test('money always shows centavos; each currency its own symbol', () => {
  assert.equal(formatPesos(120000, '₱'), '₱1,200.00');
  assert.equal(formatMoney(12000, 'USD'), '$120.00');
  assert.equal(formatMoney(120000, 'AED'), 'AED 1,200.00');
  assert.equal(formatMoney(-5, 'PHP'), '−₱0.05');
});

test('photo ids: fixed by the name key, same sum as the server; server rows checked', async () => {
  const { createHash } = await import('node:crypto');
  const want = 'p-' + createHash('sha256').update('tita merly', 'utf8').digest('hex').slice(0, 16);
  assert.equal(await photoIdFor('tita merly'), want);
  assert.notEqual(await photoIdFor('tita merly'), await photoIdFor('kuya ramil'));
  const uid = '00000000-0000-0000-0000-000000000001';
  assert.ok(photoFromServer({ id: 'me', person_key: '', storage_path: `${uid}/me.jpg` }, uid));
  assert.equal(photoFromServer({ id: 'me', person_key: '', storage_path: `other/me.jpg` }, uid), null);
  assert.equal(photoFromServer({ id: want, person_key: '', storage_path: `${uid}/${want}.jpg` }, uid), null); // a person photo needs its key
  assert.equal(photoFromServer({ id: '../x', person_key: 'a', storage_path: `${uid}/../x.jpg` }, uid), null);
});
