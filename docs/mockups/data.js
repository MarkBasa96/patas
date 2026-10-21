/* Patas mockup data. EVERYTHING here is invented. No real people, amounts or accounts.
   Mock "today" is Fri 2 Oct 2026. Amounts are whole centavos. */
(function (root) {
  const E = root.PatasEngine;
  const TODAY = '2026-10-02';

  const fixed = (id, person, label, start, amount, count, paidDates, extra) => ({
    id, direction: 'owe', type: 'fixed', person, label,
    installments: E.genFixed(start, amount, count),
    payments: paidDates.map((d, i) => ({ date: d, amount: typeof d === 'object' ? d.amount : amount, note: '' })),
    charges: [], writeoffs: [], ...extra,
  });

  const VAULT = [
    { id: 'v1', label: 'Home Credit collections', wallet: 'GCash', kind: 'ewallet', account: 'HOME CREDIT COLLECTIONS', changedOn: null, cached: true, link: 'd1' },
    { id: 'v2', label: 'Tita Merly', wallet: 'GoTyme', kind: 'bank', account: 'MERLY R. SANTILLAN', changedOn: '2026-09-28', savedCopyOn: '2026-09-25', cached: true, link: 'd3' },
    { id: 'v3', label: 'Credit Coop payments', wallet: 'Bank', kind: 'bank', account: 'LAGUNA TEACHERS CREDIT COOP', changedOn: null, savedCopyOn: '2026-10-02', cached: true, link: 'd4' },
    { id: 'v4', label: 'My Maya (for collecting)', wallet: 'Maya', kind: 'ewallet', account: 'ANA M. REYES', changedOn: null, cached: false, link: 'e2' },
  ];

  function normal() {
    const debts = [
      fixed('d1', 'Home Credit', 'Redmi Note 13', '2026-06-04', 124750, 10, ['2026-06-04', '2026-07-03', '2026-08-04', '2026-09-05'],
        { notes: 'Work phone. Autodebit is off, so pay by the 4th.', qr: 'v1' }),
      { id: 'd2', direction: 'owe', type: 'uneven', person: 'Lazada PayLater', label: 'Air fryer',
        installments: [{ id: 'i1', due: '2026-10-08', amount: 112000 }, { id: 'i2', due: '2026-11-08', amount: 98000 }, { id: 'i3', due: '2026-12-08', amount: 98000 }, { id: 'i4', due: '2027-01-08', amount: 64050 }],
        payments: [], charges: [], writeoffs: [], notes: '', qr: null },
      { id: 'd3', direction: 'owe', type: 'open', person: 'Tita Merly', label: 'Tuition help', principal: 820000, payBy: '2026-12-15',
        payments: [{ date: '2026-08-30', amount: 100000, note: 'First share' }, { date: '2026-09-27', amount: 100000, note: 'Second share' }],
        charges: [], writeoffs: [], notes: 'No rush, she said. Pay by December.', qr: 'v2' },
      fixed('d4', 'Credit Coop', 'Salary loan', '2026-08-09', 231875, 12, ['2026-08-09', '2026-09-09'], { notes: '', qr: 'v3' }),
      fixed('d5', 'Atome', 'Sneakers', '2026-08-18', 143333, 4, ['2026-08-18', '2026-09-18', '2026-10-01'], { notes: '', qr: null }),
      { id: 'd6', direction: 'owe', type: 'tab', person: 'Kuya Jun', label: 'Gas money',
        lines: [{ date: '2026-09-12', delta: 150000, note: 'Gas and load' }, { date: '2026-09-28', delta: -50000, note: 'Sent by GCash' }], notes: '', qr: null },
      { id: 'e1', direction: 'owed', type: 'tab', person: 'Carlo', label: 'Lunch tab',
        lines: [{ date: '2026-09-20', delta: 30000, note: 'Lunch' }, { date: '2026-09-27', delta: 20000, note: 'Load' }, { date: '2026-10-01', delta: -15000, note: 'Paid back' }], notes: '', qr: null },
      { id: 'e2', direction: 'owed', type: 'open', person: 'Ate Gina', label: 'Short-term loan', principal: 285000, payBy: '2026-10-10',
        payments: [], charges: [], writeoffs: [], notes: 'Said she can pay on payday.', qr: 'v4' },
      // settled
      { id: 's1', direction: 'owe', type: 'fixed', person: 'Lazada PayLater', label: 'Rice cooker', installments: E.genFixed('2026-05-12', 78333, 3),
        payments: [{ date: '2026-05-12', amount: 78333 }, { date: '2026-06-10', amount: 78333 }, { date: '2026-07-12', amount: 78333 }], charges: [], writeoffs: [], settledOn: '2026-07-12', notes: '', qr: null },
      { id: 's2', direction: 'owe', type: 'tab', person: 'Kuya Jun', label: 'Birthday gift', lines: [{ date: '2026-07-02', delta: 90000, note: 'Gift' }, { date: '2026-07-30', delta: -90000, note: 'Paid in full' }], settledOn: '2026-07-30', notes: '' },
      { id: 's3', direction: 'owe', type: 'open', person: 'Credit Coop', label: 'Emergency loan', principal: 500000, payBy: null,
        payments: [{ date: '2026-06-15', amount: 487900, note: '' }], charges: [], writeoffs: [{ date: '2026-06-15', amount: 12100, note: 'Discount for closing early' }], settledOn: '2026-06-15', notes: '' },
    ];
    return { debts, vault: VAULT.map((v) => ({ ...v })) };
  }

  function overdue() {
    const s = normal();
    const d1 = s.debts[0];
    d1.payments = [{ date: '2026-06-04', amount: 124750 }, { date: '2026-07-03', amount: 124750 }, { date: '2026-08-04', amount: 124750 }, { date: '2026-09-20', amount: 50000, note: 'Partial' }];
    d1.charges = [{ date: '2026-09-20', amount: 10000, note: 'Late fee' }];
    return s;
  }

  function long() {
    const s = normal();
    s.debts[0].person = 'Home Credit Philippines Financing Corporation';
    s.debts[0].label = 'Redmi Note 13 Pro+ 5G 512GB Midnight Black (work phone)';
    s.debts[2].person = 'Tita Maria Mercedes Villanueva-Ocampo';
    s.debts[2].label = 'Tuition help for the whole second semester';
    s.debts[6].person = 'Carlo Emmanuel Bautista Jr.';
    s.vault[0].account = 'HOME CREDIT PHILIPPINES FINANCING CORPORATION COLLECTIONS ACCOUNT';
    s.vault[0].label = 'Home Credit Philippines Financing Corporation collections';
    return s;
  }

  function first() { return { debts: [], vault: [] }; }

  // the first plan is due TODAY (installment 5 falls on 2 Oct)
  function duetoday() {
    const s = normal(), d1 = s.debts[0];
    d1.installments = E.genFixed('2026-06-02', 124750, 10);
    d1.payments = ['2026-06-02', '2026-07-02', '2026-08-02', '2026-09-02'].map((d) => ({ date: d, amount: 124750, note: '' }));
    return s;
  }
  // the Atome plan was finished and then 500.00 extra was paid
  function overpaid() {
    const s = normal();
    s.debts[4].payments.push({ date: '2026-10-02', amount: 143333 + 50000, note: 'Paid the rest, plus extra' });
    return s;
  }

  function allSettled() {
    const s = normal();
    s.debts.forEach((d) => {
      if (d.settledOn) return;
      const c = E.compute(d, TODAY);
      if (d.type === 'tab') { if (c.balance !== 0) d.lines.push({ date: '2026-10-01', delta: -c.balance, note: 'Settled' }); }
      else if (c.remaining > 0) d.writeoffs.push({ date: '2026-10-01', amount: c.remaining, note: 'Written off at settling' });
      d.settledOn = '2026-10-01';
    });
    return s;
  }

  root.PatasData = { TODAY, build(name) { return ({ normal, overdue, long, first, settled: allSettled, duetoday, overpaid })[name](); } };
})(window);
