/* Patas mockups v4 (round 4, 2026-10-23): the money engine and the invented sample data.
   Same rules as the real app (app/src/balance.ts, derive.ts, home.ts): money is whole centavos, payments apply
   oldest-first, remaining and status are always worked out from the lines, never typed. New for round 4: the
   person ledger, ticking several installments at once, "recurring" debts, report periods.
   Works in the browser (window.PatasEngine) and in Node (module.exports) so _check/engine.test.mjs can test it. */
(function (root) {
  'use strict';
  const TODAY = '2026-10-23';

  // ---------- dates (plain YYYY-MM-DD text, UTC maths so a time zone never shifts a due date) ----------
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = parse(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  function addMonths(s, n) {
    const d = parse(s), day = d.getUTCDate();
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
    t.setUTCDate(Math.min(day, new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()));
    return iso(t);
  }
  const step = (first, freq, i) => (freq === 'weekly' ? addDays(first, 7 * i) : freq === 'biweekly' ? addDays(first, 14 * i) : addMonths(first, i));
  const ym = (s) => s.slice(0, 7);
  const monthEnd = (m) => iso(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)));
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

  /** "Borrowed 12,000, paying 2,000 monthly from Oct 28": full payments and a smaller last one, adding up exactly. */
  function buildPlan(total, payment, freq, first) {
    if (!(total > 0 && payment > 0 && payment <= total)) return [];
    const n = Math.ceil(total / payment);
    return Array.from({ length: n }, (_, i) => ({ seq: i + 1, due: step(first, freq, i), amt: i < n - 1 ? payment : total - payment * (n - 1) }));
  }

  // ---------- one debt ----------
  // kind: one_time | installments | recurring. Lines: principal / addition (borrowed more) / charge / payment / writeoff.
  /** The dated amounts this debt asks for. Recurring has no end: every month up to `until` (default: 3 months ahead). */
  function schedule(d, until) {
    if (d.kind === 'installments') return d.plan.map((p) => ({ ...p }));
    if (d.kind === 'recurring') {
      const end = until || addMonths(TODAY, 3), out = [];
      for (let i = 0; ; i++) { const due = step(d.first, d.freq || 'monthly', i); if (due > end || (d.stoppedOn && due > d.stoppedOn)) break; out.push({ seq: i + 1, due, amt: d.amount }); }
      return out;
    }
    return d.due ? [{ seq: 1, due: d.due, amt: 0 }] : [];
  }
  const sum = (a, f) => a.reduce((n, x) => n + f(x), 0);
  const lines = (d, kind) => d.lines.filter((l) => !l.deleted && l.kind === kind);

  function calc(d, today = TODAY) {
    const charges = sum(lines(d, 'charge'), (l) => l.amt);
    const paid = sum(lines(d, 'payment'), (l) => l.amt);
    const written = sum(lines(d, 'writeoff'), (l) => l.amt);
    let rows = schedule(d);
    let owed;
    if (d.kind === 'one_time') {
      owed = sum(lines(d, 'principal'), (l) => l.amt) + sum(lines(d, 'addition'), (l) => l.amt) + charges;
      rows = d.due ? [{ seq: 1, due: d.due, amt: owed }] : [];
    } else if (d.kind === 'installments') {
      owed = sum(rows, (r) => r.amt) + charges; // the installments are the principal; charges sit after the last one
      if (charges) rows.push({ seq: rows.length + 1, due: rows.length ? rows[rows.length - 1].due : today, amt: charges, charge: true });
    } else {
      // recurring: only what has fallen due so far counts as owed; later months are shown as upcoming
      owed = sum(rows.filter((r) => r.due <= today), (r) => r.amt) + charges;
    }
    // oldest-first: each payment fills the earliest unpaid amount
    let pool = paid + written;
    const statuses = rows.map((r) => {
      const covered = Math.min(r.amt, Math.max(0, pool)); pool -= covered;
      const short = r.amt - covered;
      const status = short === 0 ? 'paid' : covered > 0 ? 'partly paid' : r.due < today ? 'overdue' : r.due === today ? 'due today' : 'upcoming';
      return { ...r, covered, short, status };
    });
    const remaining = Math.max(0, owed - paid - written);
    const next = statuses.find((s) => s.short > 0) || null;
    const settled = !!d.settledOn || (d.kind !== 'recurring' && owed > 0 && remaining === 0);
    const state = settled ? 'settled' : !next ? 'none' : next.due < today ? 'overdue' : next.due === today ? 'today' : 'upcoming';
    const pct = owed > 0 ? Math.min(100, Math.floor(((paid + written) * 100) / owed)) : 0;
    return { owed, paid, written, charges, remaining, statuses, next, state, pct, overpaid: Math.max(0, paid + written - owed) };
  }

  /** Ticking installments: a tick runs from the oldest unpaid, so ticking row k ticks every unpaid row before it. */
  function tickUpTo(d, k) {
    const open = calc(d).statuses.filter((s) => s.short > 0);
    const n = Math.max(0, Math.min(open.length, k + 1));
    return { rows: open.slice(0, n), total: sum(open.slice(0, n), (s) => s.short), all: open.length };
  }

  /** What one payment paid for: walk the payments oldest first (by date, then entry order) through the rows. */
  function coverOf(d, lineId) {
    const rows = calc(d).statuses.map((s) => ({ seq: s.seq, due: s.due, amt: s.amt, charge: !!s.charge, left: s.amt }));
    const pays = d.lines.filter((l) => !l.deleted && (l.kind === 'payment' || l.kind === 'writeoff'))
      .map((l, i) => ({ l, i })).sort((a, b) => a.l.date.localeCompare(b.l.date) || a.i - b.i);
    for (const { l } of pays) {
      let pool = l.amt; const got = [];
      for (const r of rows) { if (pool <= 0) break; const k = Math.min(r.left, pool); if (k > 0) { got.push({ seq: r.seq, due: r.due, amt: k, of: r.amt, charge: r.charge }); r.left -= k; pool -= k; } }
      if (l.id === lineId) return { rows: got, extra: pool };
    }
    return { rows: [], extra: 0 };
  }

  /** The dates a debt's reminders fire for its next unpaid amount. remind = {on, offsets:[0,1,3,7], custom, time}. */
  function reminderDates(d, today = TODAY) {
    const c = calc(d, today), r = d.remind || {};
    if (!r.on || !c.next) return [];
    const out = (r.offsets || []).map((o) => addDays(c.next.due, -o)).concat(r.custom ? [r.custom] : []);
    return [...new Set(out)].filter((x) => x >= today).sort();
  }

  // ---------- many debts ----------
  const active = (debts) => debts.filter((d) => !d.deleted && calc(d).state !== 'settled');
  const personKey = (name) => name.trim().replace(/\s+/g, ' ').toLowerCase();

  function home(debts, cash, today = TODAY) {
    const m = ym(today), act = active(debts);
    const due = [], paidRows = [];
    let overdueCount = 0, overdueAmount = 0;
    for (const d of act) {
      const c = calc(d, today);
      for (const s of c.statuses) if (ym(s.due) === m || (s.due < today && s.short > 0 && ym(s.due) < m)) due.push({ d, due: s.due, amt: s.amt, short: s.short, status: s.status, carried: ym(s.due) < m, charge: !!s.charge });
      const late = c.statuses.filter((s) => s.short > 0 && s.due < today);
      if (late.length) { overdueCount++; overdueAmount += sum(late, (s) => s.short); }
    }
    for (const d of debts) if (!d.deleted) for (const l of lines(d, 'payment')) if (ym(l.date) === m) paidRows.push({ d, l });
    due.sort((a, b) => a.due.localeCompare(b.due));
    paidRows.sort((a, b) => b.l.date.localeCompare(a.l.date));
    const paidThisMonth = sum(paidRows, (x) => x.l.amt);
    const c = cash[m] || { income: 0, expenses: 0 };
    return {
      owed: sum(act, (d) => calc(d, today).remaining), activeCount: act.length,
      due, dueThisMonth: sum(due, (x) => x.amt), dueThisMonthPaid: sum(due, (x) => x.amt - x.short),
      paidRows, paidThisMonth, overdueCount, overdueAmount,
      income: c.income, expenses: c.expenses, cashRemaining: c.income - c.expenses - paidThisMonth,
    };
  }

  /** Everyone I owe, one row each, with every debt under the same name (trimmed, ignoring case). */
  function people(debts) {
    const map = new Map();
    for (const d of debts) {
      if (d.deleted) continue;
      const k = personKey(d.person);
      if (!map.has(k)) map.set(k, { key: k, name: d.person, debts: [] });
      map.get(k).debts.push(d);
    }
    return [...map.values()].map((p) => {
      const cs = p.debts.map((d) => calc(d));
      return { ...p, borrowed: sum(cs, (c) => c.owed), paid: sum(cs, (c) => c.paid), remaining: sum(cs, (c) => c.remaining), open: cs.filter((c) => c.state !== 'settled').length };
    }).sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name));
  }

  /** The person's mini ledger: every borrowing and payment, newest first. */
  function ledger(debts, key) {
    const out = [];
    for (const d of debts) {
      if (d.deleted || personKey(d.person) !== key) continue;
      if (d.kind === 'installments') out.push({ date: d.opened, kind: 'borrowed', amt: sum(d.plan, (p) => p.amt), d, text: `Added debt${d.title ? ': ' + d.title : ''}` });
      if (d.kind === 'recurring') for (const r of schedule(d).filter((r) => r.due <= TODAY)) out.push({ date: r.due, kind: 'borrowed', amt: r.amt, d, text: `Due${d.title ? ': ' + d.title : ''}` });
      for (const l of d.lines) {
        if (l.deleted) continue;
        if (l.kind === 'principal') out.push({ date: l.date, kind: 'borrowed', amt: l.amt, d, l, text: `Added debt${d.title ? ': ' + d.title : ''}` });
        if (l.kind === 'addition') out.push({ date: l.date, kind: 'borrowed', amt: l.amt, d, l, text: 'Borrowed more' + (l.note ? ': ' + l.note : '') });
        if (l.kind === 'charge') out.push({ date: l.date, kind: 'charge', amt: l.amt, d, l, text: 'Charge' + (l.note ? ': ' + l.note : '') });
        if (l.kind === 'payment') out.push({ date: l.date, kind: 'payment', amt: l.amt, d, l, text: 'Payment' + (l.method ? ' · ' + l.method : '') });
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date) || (b.kind === 'payment') - (a.kind === 'payment'));
  }

  // ---------- reports ----------
  /** Inclusive [from, to] for a period key. */
  function period(key, today = TODAY, custom) {
    const m = ym(today);
    const first = (s) => s.slice(0, 8) + '01';
    if (key === 'week') { const dow = (parse(today).getUTCDay() + 6) % 7; return { from: addDays(today, -dow), to: today }; }
    if (key === 'last_month') { const f = addMonths(first(today), -1); return { from: f, to: monthEnd(ym(f)) }; }
    if (key === '3m') return { from: addMonths(m + '-01', -2), to: today };
    if (key === '6m') return { from: addMonths(m + '-01', -5), to: today };
    if (key === 'year') return { from: today.slice(0, 4) + '-01-01', to: today };
    if (key === 'custom' && custom) return custom;
    return { from: m + '-01', to: today };
  }
  const monthsIn = (r) => { const out = []; for (let m = ym(r.from); m <= ym(r.to); m = ym(addMonths(m + '-01', 1))) out.push(m); return out; };

  function report(debts, cash, range, today = TODAY) {
    const live = debts.filter((d) => !d.deleted);
    const pays = live.flatMap((d) => lines(d, 'payment').map((l) => ({ d, l }))).filter((x) => x.l.date >= range.from && x.l.date <= range.to);
    const months = monthsIn(range);
    // a one-month period still draws the last 6 months for the trend charts, so a line is never a single dot
    const trendMonths = months.length >= 3 ? months : monthsIn({ from: addMonths(ym(range.to) + '-01', -5), to: range.to });
    const paidIn = (m) => sum(live.flatMap((d) => lines(d, 'payment')).filter((l) => ym(l.date) === m), (l) => l.amt);
    const remainingAt = (date) => sum(live, (d) => {
      const cut = { ...d, lines: d.lines.filter((l) => l.date <= date), plan: d.plan, settledOn: d.settledOn && d.settledOn <= date ? d.settledOn : null };
      const opened = d.opened <= date;
      return opened ? calc(cut, date).remaining : 0;
    });
    const byPerson = people(live).filter((p) => p.remaining > 0).map((p) => ({ name: p.name, amt: p.remaining }));
    const totalOwed = sum(active(live), (d) => calc(d, today).owed);
    const totalPaidAll = sum(active(live), (d) => calc(d, today).paid);
    const totIncome = sum(months, (m) => (cash[m] || {}).income || 0);
    const totExpenses = sum(months, (m) => (cash[m] || {}).expenses || 0);
    const debtPaid = sum(pays, (x) => x.l.amt);
    return {
      range, months, debtPaid, payCount: pays.length,
      remaining: sum(active(live), (d) => calc(d, today).remaining),
      totalOwed, totalPaidAll, progressPct: totalOwed ? Math.floor((totalPaidAll * 100) / totalOwed) : 0,
      income: totIncome, expenses: totExpenses, cashRemaining: totIncome - totExpenses - debtPaid,
      byPerson,
      monthly: trendMonths.map((m) => ({ m, paid: paidIn(m), income: (cash[m] || {}).income || 0, expenses: (cash[m] || {}).expenses || 0 })),
      trend: trendMonths.map((m) => ({ m, remaining: remainingAt(m < ym(today) ? monthEnd(m) : today) })),
    };
  }

  // ---------- money text ----------
  const peso = (c, opt = {}) => {
    const neg = c < 0, a = Math.abs(Math.round(c));
    const whole = Math.floor(a / 100).toLocaleString('en-US'), cents = a % 100;
    return (neg ? '−' : '') + '₱' + whole + (cents || opt.cents ? '.' + String(cents).padStart(2, '0') : '');
  };
  const compact = (c) => { const p = Math.abs(c) / 100; return '₱' + (p >= 1e6 ? (p / 1e6).toFixed(1) + 'M' : p >= 1e3 ? (p / 1e3).toFixed(p >= 1e4 ? 0 : 1) + 'k' : Math.round(p)); };

  // ---------- the invented sample account ("Alex"); no real person or figure ----------
  let n = 0;
  const L = (kind, amt, date, extra) => ({ id: 'l' + ++n, kind, amt, date, method: '', note: '', ...extra });
  function sample() {
    n = 0;
    const debts = [
      { id: 'd1', person: 'Tita Merly', title: 'Emergency loan', kind: 'one_time', opened: '2026-05-04', due: '2026-10-25',
        lines: [L('principal', 845000, '2026-05-04'), L('payment', 150000, '2026-06-30', { method: 'GCash' }), L('payment', 320000, '2026-10-05', { method: 'GCash' })], remind: { on: true, offsets: [0, 1], custom: null, time: '08:00' } },
      { id: 'd2', person: 'Tita Merly', title: 'School fees', kind: 'one_time', opened: '2026-10-12', due: '2026-11-15',
        lines: [L('principal', 275000, '2026-10-12'), L('addition', 118000, '2026-10-18', { note: 'uniform' }), L('payment', 150000, '2026-10-18', { method: 'Cash' })], remind: { on: true, offsets: [3], custom: null, time: '18:00' } },
      { id: 'd3', person: 'Online lending app', title: 'Phone, 128GB', kind: 'installments', opened: '2026-04-28', freq: 'monthly',
        plan: buildPlan(748500, 124750, 'monthly', '2026-07-28'),
        lines: [L('payment', 124750, '2026-07-27', { method: 'Bank' }), L('payment', 124750, '2026-08-28', { method: 'Bank' }), L('payment', 124750, '2026-09-26', { method: 'Bank' }), L('payment', 124750, '2026-10-20', { method: 'Bank' })], remind: { on: true, offsets: [3], custom: null, time: '09:00' } },
      { id: 'd4', person: 'Dental clinic', title: 'Braces', kind: 'installments', opened: '2026-04-30', freq: 'monthly',
        plan: buildPlan(1014600, 84550, 'monthly', '2026-05-30'),
        lines: ['2026-05-30', '2026-06-30', '2026-07-30', '2026-08-29', '2026-09-30'].map((d) => L('payment', 84550, d, { method: 'GCash' })), remind: { on: true, offsets: [0], custom: null, time: '08:00' } },
      { id: 'd5', person: 'Office credit coop', title: 'Cash loan', kind: 'installments', opened: '2026-04-10', freq: 'monthly',
        plan: buildPlan(1365000, 341250, 'monthly', '2026-07-10'),
        lines: [L('payment', 341250, '2026-07-10', { method: 'Maya' }), L('payment', 341250, '2026-08-12', { method: 'Maya' }), L('payment', 341250, '2026-09-10', { method: 'Maya' }), L('charge', 15000, '2026-10-15', { note: 'late fee' })], remind: { on: true, offsets: [7], custom: null, time: '12:00' } },
      { id: 'd6', person: 'Kuya Ramil', title: 'Motorbike share', kind: 'recurring', opened: '2026-08-15', first: '2026-08-15', freq: 'monthly', amount: 145000,
        lines: [L('payment', 145000, '2026-08-15', { method: 'Cash' }), L('payment', 145000, '2026-09-15', { method: 'Cash' }), L('payment', 145000, '2026-10-14', { method: 'Cash' })], remind: { on: false, offsets: [1], custom: null, time: '08:00' } },
      { id: 'd7', person: 'Appliance store', title: 'Washing machine', kind: 'installments', opened: '2026-04-07', freq: 'monthly', settledOn: '2026-09-07',
        plan: buildPlan(895000, 179000, 'monthly', '2026-05-07'),
        lines: [5, 6, 7, 8, 9].map((mo) => L('payment', 179000, `2026-0${mo}-07`, { method: 'GCash' })), remind: { on: false, offsets: [1], custom: null, time: '08:00' } },
      { id: 'd8', person: 'Online lending app', title: 'Laptop', kind: 'one_time', opened: '2026-03-20', due: null,
        lines: [L('principal', 865000, '2026-03-20'), L('payment', 100000, '2026-07-15', { method: 'Bank' }), L('payment', 100000, '2026-09-15', { method: 'Bank' })], remind: { on: false, offsets: [1], custom: null, time: '08:00' } },
    ];
    const cash = {
      '2026-05': { income: 3812040, expenses: 1653025 }, '2026-06': { income: 3812040, expenses: 1720880 },
      '2026-07': { income: 4108575, expenses: 1584310 }, '2026-08': { income: 3812040, expenses: 1906450 },
      '2026-09': { income: 4251990, expenses: 1612775 }, '2026-10': { income: 4321740, expenses: 1586025 },
    };
    return { debts, cash };
  }

  const api = { TODAY, addDays, addMonths, ym, monthEnd, daysBetween, buildPlan, schedule, calc, coverOf, reminderDates, tickUpTo, active, personKey, home, people, ledger, period, report, peso, compact, sample };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PatasEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
