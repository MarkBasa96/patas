// Phase 6g checks: backup contents, restore (add / replace, QR links), CSV safety and sums, share text.
// Fake data only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { liveViews } from '../src/derive.ts';
import { csvCell, debtSummary, debtsCsv, linesCsv, makeBackup, overallSummary, parseBackup, restorePlan } from '../src/exportData.ts';

const T = 1760000000000;
const debt = (id, extra = {}) => ({ id, direction: 'i_owe', kind: 'one_time', person_name: 'Test Lender', title: 'Loan', due_on: null, opened_on: '2026-10-01', settled_on: null, remind: true, qr_id: null, qr_linked_at: null, note: '', created_at: T, deleted: false, updated_at: '2026-10-01T00:00:00Z', ...extra });
const line = (id, debt_id, kind, amount, extra = {}) => ({ id, debt_id, kind, charge_kind: null, adjust_sign: null, amount_centavos: amount, on_date: '2026-10-02', note: '', method: '', created_at: T, deleted: false, updated_at: '2026-10-02T00:00:00Z', ...extra });
const inst = (id, debt_id, seq, amount, due) => ({ id, debt_id, seq, due_on: due, amount_centavos: amount, created_at: T, deleted: false, updated_at: '2026-10-01T00:00:00Z' });

const data = () => ({
  debts: [debt('d1', { qr_id: 'q1', qr_linked_at: '2026-10-01T00:00:00Z' }), debt('d2', { kind: 'installments', person_name: 'Test Friend' }), debt('dX', { deleted: true })],
  installments: [inst('i1', 'd2', 1, 120000, '2026-10-20'), inst('i2', 'd2', 2, 120000, '2026-11-20'), inst('iX', 'dX', 1, 5000, '2026-10-20')],
  lines: [line('l1', 'd1', 'principal', 300000), line('l2', 'd1', 'payment', 50000, { method: 'GCash' }), line('l3', 'd2', 'payment', 50000), line('lX', 'dX', 'principal', 9900), line('lD', 'd1', 'charge', 700, { deleted: true, charge_kind: 'late_fee' })],
});
const totals = (d) => liveViews(d.debts, d.installments, d.lines, '2026-10-20').map((v) => `${v.debt.id}:${v.bal.owed}/${v.bal.paid}/${v.bal.remaining}`).sort().join(' ');

test('backup: live rows only, no server-only fields, no QR fingerprint, no user id', () => {
  const b = makeBackup(data(), { currency: 'PHP', cash: { income: 100, expenses: 50 }, madeAt: '2026-10-20T00:00:00Z' });
  assert.deepEqual(b.debts.map((d) => d.id), ['d1', 'd2']);
  assert.deepEqual(b.installments.map((i) => i.id), ['i1', 'i2'], "a deleted debt's plan stays out");
  assert.deepEqual(b.lines.map((l) => l.id), ['l1', 'l2', 'l3'], 'deleted lines and lines of deleted debts stay out');
  const s = JSON.stringify(b);
  for (const word of ['payload_sha256', 'user_id', 'updated_at', 'qr_linked_at', 'storage_path']) assert.equal(s.includes(word), false, word);
  assert.equal(b.qrs.length, 0, 'QR pictures only when chosen');
});

test('restore into an empty account gives identical totals; a second "add" restore adds nothing', () => {
  const src = data();
  const b = parseBackup(JSON.stringify(makeBackup(src, { currency: 'PHP', cash: { income: 0, expenses: 0 }, madeAt: 'x' })));
  assert.ok('backup' in b);
  const empty = { debts: [], installments: [], lines: [] };
  const plan = restorePlan(empty, b.backup, 'add', new Map(), new Set());
  assert.equal(totals(plan), totals({ ...src, debts: src.debts.filter((d) => !d.deleted) }));
  assert.equal(plan.debts.find((d) => d.id === 'd1').qr_id, null, 'a QR that is not in this account is unlinked (no broken link)');
  const again = restorePlan(plan, b.backup, 'add', new Map(), new Set());
  assert.equal(again.debts.length + again.installments.length + again.lines.length, 0, 'safe to run twice');
});

test('restore remaps QR links and "replace" deletes what the backup does not have', () => {
  const b = parseBackup(JSON.stringify(makeBackup(data(), { currency: 'PHP', cash: { income: 0, expenses: 0 }, madeAt: 'x' }))).backup;
  const mapped = restorePlan({ debts: [], installments: [], lines: [] }, b, 'add', new Map([['q1', 'q9']]), new Set());
  assert.equal(mapped.debts.find((d) => d.id === 'd1').qr_id, 'q9');
  const kept = restorePlan({ debts: [], installments: [], lines: [] }, b, 'add', new Map(), new Set(['q1']));
  assert.equal(kept.debts.find((d) => d.id === 'd1').qr_id, 'q1', 'same account: the existing QR stays linked');
  const current = { debts: [debt('other')], installments: [], lines: [line('o1', 'other', 'principal', 100)] };
  const rep = restorePlan(current, b, 'replace', new Map(), new Set());
  assert.equal(rep.debts.find((d) => d.id === 'other').deleted, true);
  assert.equal(rep.lines.find((l) => l.id === 'o1').deleted, true);
  assert.equal(rep.debts.filter((d) => !d.deleted).length, 2);
  assert.equal(restorePlan(current, b, 'add', new Map(), new Set()).debts.some((d) => d.deleted), false, '"add" never deletes');
});

test('parseBackup refuses junk and skips bad rows, and counts them', () => {
  assert.ok('error' in parseBackup('not json'));
  assert.ok('error' in parseBackup(JSON.stringify({ app: 'other', format: 1 })));
  assert.ok('error' in parseBackup(JSON.stringify({ app: 'patas', format: 99 })));
  const r = parseBackup(JSON.stringify({ app: 'patas', format: 1, debts: [debt('ok'), { id: 5 }], installments: [inst('i', 'missing', 1, 1, '2026-01-01')], lines: [line('l', 'ok', 'nonsense', 1)], qrs: [{ id: 'q', wallet: 'gcash', png: 'not base64!!' }] }));
  assert.ok('backup' in r);
  assert.equal(r.backup.debts.length, 1);
  assert.equal(r.skipped, 4);
});

test('CSV: formulas are defused, quotes doubled, amounts plain, sums match the app', () => {
  assert.equal(csvCell('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  assert.equal(csvCell('+1'), `"'+1"`);
  assert.equal(csvCell('@SUM'), `"'@SUM"`);
  assert.equal(csvCell('Ana "Tita" Reyes'), '"Ana ""Tita"" Reyes"');
  const d = data();
  d.debts[0] = { ...d.debts[0], note: '=cmd|calc' };
  const views = liveViews(d.debts, d.installments, d.lines, '2026-10-20');
  const out = debtsCsv(views);
  assert.equal(out.charCodeAt(0), 0xfeff, 'BOM so Excel reads UTF-8');
  assert.ok(out.includes(`"'=cmd|calc"`));
  const rows = out.slice(1).trim().split('\r\n').slice(1).map((r) => r.split('","'));
  const remainingSum = rows.reduce((n, r) => n + Math.round(Number(r[8]) * 100), 0);
  assert.equal(remainingSum, views.reduce((n, v) => n + v.bal.remaining, 0));
  const l = linesCsv(views);
  assert.ok(l.includes('"Payment"') && l.includes('"Paid down"') && l.includes('"GCash"'));
  assert.equal(l.slice(1).trim().split('\r\n').length, 1 + 3, 'header + 3 live lines');
});

test('CSV: charge type shows the label people picked, never the stored key', () => {
  const d = data();
  d.lines.push(line('lC', 'd1', 'charge', 10000, { charge_kind: 'late_fee' }), line('lP', 'd1', 'charge', 500, { charge_kind: 'penalty' }));
  const l = linesCsv(liveViews(d.debts, d.installments, d.lines, '2026-10-20'));
  assert.ok(l.includes('"Late fee"') && l.includes('"Penalty"'), 'labels');
  assert.equal(l.includes('late_fee'), false, 'no raw key');
});

test('share summary: amounts and dates only, never a QR or account name', () => {
  const views = liveViews(data().debts, data().installments, data().lines, '2026-10-20');
  const s = debtSummary(views.find((v) => v.debt.id === 'd2'), '2026-10-20');
  assert.match(s, /Total: ₱2,400/);
  assert.match(s, /Paid: ₱500/);
  assert.match(s, /Left: ₱1,900/);
  assert.match(s, /Next due: ₱700 on Oct 20, 2026/);
  assert.equal(/qr|png|account/i.test(s), false);
  assert.match(overallSummary(views, '2026-10-20'), /Active debts: 2/);
});
