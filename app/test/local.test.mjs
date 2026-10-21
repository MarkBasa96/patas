// Phase 6a checks: the on-phone copy, what the screens derive, and editing. Fake data only.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { byDueSoonest, debtView, formFromDebt, hasCredits, liveViews } from '../src/derive.ts';
import { editDebt } from '../src/edit.ts';
import { buildDebt, emptyForm, validateForm } from '../src/ledger.ts';
import { applyPulled, applyPushed, emptyLocal, pendingCount, pendingRows, putRows, reviveLocal } from '../src/local.ts';

const TODAY = '2026-10-19';
let n = 0;
const mk = (f) => buildDebt(f, { debt: `d${++n}`, child: () => `c${++n}` }, 1000 + n, TODAY);
const oneForm = (o = {}) => ({ ...emptyForm(), person: 'Test Lender', title: 'Loan', amount: '1200', ...o });
const instForm = (o = {}) => ({ ...emptyForm(), person: 'Test Bank', title: 'Plan', amount: '3600', kind: 'installments', payment: '1200', first: '2026-10-20', ...o });

// ---- the phone copy ----
test('putRows marks rows waiting; a send clears only what was not edited again meanwhile', () => {
  let l = emptyLocal();
  const { debt } = mk(oneForm());
  l = putRows(l, 'debts', [debt]);
  assert.equal(pendingCount(l), 1);
  const { rows, revs } = pendingRows(l, 'debts');
  assert.equal(rows.length, 1);
  // user edits the same row while the send is in flight
  l = putRows(l, 'debts', [{ ...debt, title: 'Edited' }]);
  const after = applyPushed(l, 'debts', revs, [debt.id]);
  assert.equal(pendingCount(after), 1, 'the newer edit must stay waiting');
  const { revs: revs2 } = pendingRows(after, 'debts');
  assert.equal(pendingCount(applyPushed(after, 'debts', revs2, [debt.id])), 0);
  assert.equal(after.data.debts[0].title, 'Edited');
});

test('applyPulled: server rows come in, unsent local edits survive, cursor moves', () => {
  let l = emptyLocal();
  const a = mk(oneForm()).debt;
  const b = mk(oneForm({ person: 'Other' })).debt;
  l = putRows(l, 'debts', [a]);
  const out = applyPulled(l, 'debts', [{ ...a, title: 'SERVER' }, b], { t: '2026-10-19T01:00:00Z', id: b.id });
  assert.equal(out.data.debts.find((d) => d.id === a.id).title, 'Loan');
  assert.ok(out.data.debts.find((d) => d.id === b.id));
  assert.equal(out.cursors.debts.id, b.id);
});

test('reviveLocal survives junk in storage', () => {
  for (const junk of [null, 5, 'x', [], { data: 7, dirty: [], cursors: 'no', rev: 'a' }]) {
    const l = reviveLocal(junk);
    assert.deepEqual(l.data.debts, []);
    assert.equal(l.rev, 0);
    assert.equal(l.cursors.debts.id, '');
  }
});

// ---- derived views ----
test('debtView: next due, state, and "pay when I can"', () => {
  const inst = mk(instForm());
  const v = debtView(inst.debt, inst.installments, inst.lines, TODAY);
  assert.equal(v.state, 'upcoming');
  assert.equal(v.next.date, '2026-10-20');
  assert.equal(v.bal.remaining, 360000);
  assert.equal(debtView(inst.debt, inst.installments, inst.lines, '2026-10-20').state, 'today');
  assert.equal(debtView(inst.debt, inst.installments, inst.lines, '2026-10-21').state, 'overdue');

  const open = mk(oneForm());
  assert.equal(debtView(open.debt, [], open.lines, TODAY).state, 'open');
  assert.equal(debtView(open.debt, [], open.lines, TODAY).next, null);
  const dated = mk(oneForm({ due: '2026-10-01' }));
  assert.equal(debtView(dated.debt, [], dated.lines, TODAY).state, 'overdue');
  const settled = { ...dated.debt, settled_on: '2026-10-10' };
  assert.equal(debtView(settled, [], dated.lines, TODAY).state, 'settled');
});

test('liveViews hides deleted debts; byDueSoonest puts "pay when I can" last', () => {
  const a = mk(oneForm({ due: '2026-12-01' }));
  const b = mk(oneForm({ due: '2026-11-01' }));
  const c = mk(oneForm());
  const gone = mk(oneForm());
  const debts = [a.debt, b.debt, c.debt, { ...gone.debt, deleted: true }];
  const lines = [...a.lines, ...b.lines, ...c.lines, ...gone.lines];
  const views = liveViews(debts, [], lines, TODAY);
  assert.equal(views.length, 3);
  assert.deepEqual(views.sort(byDueSoonest).map((v) => v.debt.id), [b.debt.id, a.debt.id, c.debt.id]);
});

test('formFromDebt reads back what was typed (and the form validates)', () => {
  const inst = mk(instForm({ repeat: 'weekly', payment: '1000', amount: '3500' }));
  const f = formFromDebt(debtView(inst.debt, inst.installments, inst.lines, TODAY));
  assert.deepEqual([f.kind, f.amount, f.payment, f.repeat, f.first], ['installments', '3500', '1000', 'weekly', '2026-10-20']);
  assert.deepEqual(validateForm(f), {});
  const one = mk(oneForm({ amount: '1200.50', due: '2026-12-01', note: 'hi' }));
  const g = formFromDebt(debtView(one.debt, [], one.lines, TODAY));
  assert.deepEqual([g.amount, g.due, g.note], ['1200.5'.replace('.5', '.50'), '2026-12-01', 'hi']);
});

// ---- editing ----
test('edit: name/notes change only the debt row; one-time amount changes only the principal line', () => {
  const one = mk(oneForm({ due: '2026-12-01' }));
  const v = debtView(one.debt, [], one.lines, TODAY);
  const r1 = editDebt(v, { ...formFromDebt(v), person: 'Renamed' }, () => 'new', 5, TODAY);
  assert.equal(r1.debt.person_name, 'Renamed');
  assert.equal(r1.lines.length, 0);
  assert.equal(r1.installments.length, 0);
  const r2 = editDebt(v, { ...formFromDebt(v), amount: '2000', due: '' }, () => 'new', 5, TODAY);
  assert.equal(r2.lines.length, 1);
  assert.equal(r2.lines[0].id, one.lines[0].id);
  assert.equal(r2.lines[0].amount_centavos, 200000);
  assert.equal(r2.debt.due_on, null);
});

test('edit: a changed plan is rebuilt (old rows soft-deleted); unchanged plan sends nothing; blocked after a payment', () => {
  const inst = mk(instForm());
  const v = debtView(inst.debt, inst.installments, inst.lines, TODAY);
  const nothing = editDebt(v, formFromDebt(v), () => 'x', 5, TODAY);
  assert.equal(nothing.installments.length, 0);
  let k = 0;
  const changed = editDebt(v, { ...formFromDebt(v), payment: '1800' }, () => `n${++k}`, 5, TODAY);
  assert.equal(changed.installments.filter((i) => i.deleted).length, 3);
  const fresh = changed.installments.filter((i) => !i.deleted);
  assert.deepEqual(fresh.map((i) => i.amount_centavos), [180000, 180000]);
  assert.equal(new Set(changed.installments.map((i) => i.id)).size, changed.installments.length);

  const payment = { id: 'p1', debt_id: inst.debt.id, kind: 'payment', charge_kind: null, adjust_sign: null, amount_centavos: 50000, on_date: TODAY, note: '', created_at: 9, deleted: false };
  const vp = debtView(inst.debt, inst.installments, [payment], TODAY);
  assert.equal(hasCredits(vp.lines), true);
  const blocked = editDebt(vp, { ...formFromDebt(vp), payment: '1800' }, () => 'z', 5, TODAY);
  assert.ok(blocked.error);
  const okName = editDebt(vp, { ...formFromDebt(vp), person: 'Renamed' }, () => 'z', 5, TODAY);
  assert.equal(okName.debt.person_name, 'Renamed');
});
