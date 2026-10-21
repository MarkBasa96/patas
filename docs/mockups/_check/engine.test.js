// Run: node engine.test.js   (fake data only)
const E = require('../engine.js');
let fails = 0;
const money = (c) => '₱' + (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function expect(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + label + '  ->  ' + (typeof actual === 'number' ? money(actual) : JSON.stringify(actual)) + (ok ? '' : '   expected ' + (typeof expected === 'number' ? money(expected) : JSON.stringify(expected))));
  return ok;
}

// negative control: the checker must be able to fail
const before = fails;
const controlCaught = !expect('CONTROL (this line must FAIL: 3,600 vs 3,599)', 360000, 359900);
fails = before; // the control's failure does not count against the run
console.log(controlCaught ? 'control caught the wrong number: the test can fail\n' : 'CONTROL BROKEN: test cannot fail\n');
if (!controlCaught) process.exit(2);

const today = '2026-10-02';
const plan = { id: 'a', type: 'fixed', direction: 'owe', installments: E.genFixed('2026-10-04', 120000, 3), payments: [], charges: [], writeoffs: [] };
const tab = { id: 'b', type: 'tab', direction: 'owed', lines: [{ date: '2026-09-20', delta: 30000, note: 'a' }, { date: '2026-09-27', delta: 20000, note: 'b' }, { date: '2026-10-01', delta: -15000, note: 'c' }] };

console.log('SPEC section 14');
let p = E.portfolio([plan], today);
expect('step 2: total I owe', p.owe, 360000);
expect('step 2: due next amount', p.next.item.amount, 120000);
expect('step 2: due next date', p.next.item.due, '2026-10-04');
expect('step 2: due this month', p.dueMonth, 120000);
expect('step 2: paid this month', p.dueMonthPaid, 0);

plan.payments.push({ date: today, amount: 50000, note: 'partial' });
p = E.portfolio([plan], today);
let c = E.compute(plan, today);
expect('step 3: installment 1 status', c.items[0].status, 'partly');
expect('step 3: installment 1 short', c.items[0].short, 70000);
expect('step 3: total I owe', p.owe, 310000);

plan.charges.push({ date: today, amount: 10000, note: 'Late fee' });
p = E.portfolio([plan], today);
expect('step 4: total I owe with charge', p.owe, 320000);

p = E.portfolio([plan, tab], today);
expect('step 5: owed to me (+300 +200 -150)', p.owed, 35000);
expect('step 5: I owe unchanged (never netted)', p.owe, 320000);

const c2 = E.compute(plan, today);
plan.writeoffs.push({ date: today, amount: c2.remaining, note: 'Written off' });
plan.settledOn = today;
p = E.portfolio([plan, tab], today);
c = E.compute(plan, today);
expect('step 7: remaining after write-off', c.remaining, 0);
expect('step 7: total I owe after settle', p.owe, 0);
expect('step 7: write-off kept in history (3,600 + 100 charge - 500 paid = 3,200)', c.writeoffs, 320000);

console.log('\nTraps from the research');
expect('split 10,000.00 over 3 (extra centavo to the first)', E.splitTotal(1000000, 3), [333334, 333333, 333333]);
expect('split sums back to the total', E.splitTotal(1000000, 3).reduce((a, b) => a + b, 0), 1000000);

const flip = { id: 'f', type: 'tab', direction: 'owed', lines: [{ date: '2026-09-20', delta: 30000 }, { date: '2026-10-01', delta: -45000 }] };
const cf = E.compute(flip, today);
expect('tab crossing zero flips direction', cf.effectiveDirection, 'owe');
expect('tab crossing zero: amount', cf.remaining, 15000);
p = E.portfolio([flip], today);
expect('flipped tab lands in I owe, not owed', [p.owe, p.owed], [15000, 0]);

const over = { id: 'o', type: 'fixed', direction: 'owe', installments: E.genFixed('2026-10-04', 120000, 3), payments: [{ date: today, amount: 400000 }], charges: [], writeoffs: [] };
const co = E.compute(over, today);
expect('overpaid by 400.00 beyond the total', co.overpaid, 40000);
expect('overpaid: remaining is 0, not negative', co.remaining, 0);
expect('overpaid does not leak into the other total', E.portfolio([over], today).owed, 0);

const late = { id: 'l', type: 'fixed', direction: 'owe', installments: E.genFixed('2026-09-04', 120000, 2), payments: [{ date: '2026-09-10', amount: 120000 }], charges: [], writeoffs: [] };
const cl = E.compute(late, today);
expect('payment 6 days after due shows paid late by 6', [cl.items[0].status, cl.items[0].lateDays], ['paid', 6]);
expect('second installment overdue by days', cl.items[1].overdueDays, 0);
const early = JSON.parse(JSON.stringify(late));
early.payments[0].date = '2026-09-03';
expect('editing the payment date to earlier removes "late" (derived, not stored)', E.compute(early, today).items[0].lateDays, 0);

const od = { id: 'x', type: 'fixed', direction: 'owe', installments: E.genFixed('2026-06-04', 124750, 10), payments: [{ date: '2026-06-04', amount: 124750 }, { date: '2026-07-03', amount: 124750 }, { date: '2026-08-04', amount: 124750 }, { date: '2026-09-20', amount: 50000 }], charges: [{ date: '2026-09-20', amount: 10000, note: 'Late fee' }], writeoffs: [] };
const cod = E.compute(od, today);
expect('overdue preset: installment 4 short', cod.items[3].short, 74750);
expect('overdue preset: installment 4 overdue 28 days', cod.items[3].overdueDays, 28);
const pod = E.portfolio([od], today);
expect('due this month includes the carried-over shortfall + October', pod.dueMonth, 74750 + 124750);
expect('remaining = principal + charge - paid', cod.remaining, 1247500 + 10000 - (3 * 124750 + 50000));

console.log('\n' + (fails ? fails + ' FAILED' : 'ALL PASSED'));
process.exit(fails ? 1 : 0);
