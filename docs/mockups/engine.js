/* Patas mockup money engine. Fake data only.
   All money is whole centavos. Remaining and status are always calculated from
   lines and payments, never stored (SPEC section 4.2). Same maths the real app will use. */
(function (root) {
  const DAY = 86400000;
  const sum = (a) => (a || []).reduce((s, x) => s + x.amount, 0);
  const t = (iso) => Date.parse(iso + 'T00:00:00Z');
  const diffDays = (a, b) => Math.round((t(a) - t(b)) / DAY); // a minus b, in days
  const pad = (n) => String(n).padStart(2, '0');

  // One installment per month on the start day (clamped to month end).
  function genFixed(startISO, amount, count) {
    const [y, m, d] = startISO.split('-').map(Number);
    const out = [];
    for (let i = 0; i < count; i++) {
      const mm = m - 1 + i;
      const yy = y + Math.floor(mm / 12);
      const mo = ((mm % 12) + 12) % 12;
      const last = new Date(Date.UTC(yy, mo + 1, 0)).getUTCDate();
      out.push({ id: 'i' + (i + 1), due: `${yy}-${pad(mo + 1)}-${pad(Math.min(d, last))}`, amount });
    }
    return out;
  }

  // Split a total over n installments; the extra centavos go to the first ones.
  function splitTotal(total, n) {
    const base = Math.floor(total / n);
    const extra = total - base * n;
    return Array.from({ length: n }, (_, i) => base + (i < extra ? 1 : 0));
  }

  /* compute(debt, today) -> everything the screens show.
     debt: { type: 'fixed'|'uneven'|'open'|'tab', direction: 'owe'|'owed',
             installments[], principal, payments[], charges[], writeoffs[], lines[] (tab), settledOn } */
  function compute(debt, today) {
    const r = { id: debt.id, type: debt.type, direction: debt.direction, items: [] };
    const charges = sum(debt.charges);
    const writeoffs = sum(debt.writeoffs);
    const paid = sum(debt.payments);

    if (debt.type === 'tab') {
      const lines = (debt.lines || []).map((l, i) => ({ ...l, _i: i })).sort((a, b) => a.date.localeCompare(b.date) || a._i - b._i);
      let run = 0;
      r.ledger = lines.map((l) => ({ ...l, balance: (run += l.delta) }));
      const bal = run;
      r.balance = bal;
      r.added = lines.filter((l) => l.delta > 0).reduce((s, l) => s + l.delta, 0);
      r.paidIn = -lines.filter((l) => l.delta < 0).reduce((s, l) => s + l.delta, 0);
      r.flipped = bal < 0;
      r.effectiveDirection = bal < 0 ? (debt.direction === 'owe' ? 'owed' : 'owe') : debt.direction;
      r.remaining = Math.abs(bal);
      r.total = r.added;
      r.paid = r.paidIn;
      r.settled = !!debt.settledOn;
      r.overpaid = 0;
      r.next = null;
      return r;
    }

    const principal = debt.type === 'open' ? debt.principal : sum(debt.installments);
    const total = principal + charges - writeoffs;
    const remaining = total - paid;
    r.principal = principal;
    r.charges = charges;
    r.writeoffs = writeoffs;
    r.total = principal + charges;
    r.paid = paid;
    r.remaining = remaining > 0 ? remaining : 0;
    r.overpaid = remaining < 0 ? -remaining : 0;
    r.effectiveDirection = debt.direction;
    r.settled = !!debt.settledOn;

    // Waterfall: credits (payments, then write-offs) by date, applied to the oldest unpaid item first.
    const needs = [];
    if (debt.type === 'open') {
      needs.push({ kind: 'open', id: 'open', due: debt.payBy || null, amount: debt.principal });
    } else {
      debt.installments.slice().sort((a, b) => a.due.localeCompare(b.due)).forEach((i) => needs.push({ kind: 'inst', ...i }));
    }
    (debt.charges || []).slice().sort((a, b) => a.date.localeCompare(b.date)).forEach((c, i) => needs.push({ kind: 'charge', id: 'c' + i, due: null, date: c.date, amount: c.amount, note: c.note }));
    needs.forEach((n) => { n.paidAmt = 0; n.woAmt = 0; n.completedOn = null; n.completedBy = null; });

    const credits = []
      .concat((debt.payments || []).map((p) => ({ ...p, how: 'pay' })))
      .concat((debt.writeoffs || []).map((w) => ({ ...w, how: 'wo' })))
      .sort((a, b) => a.date.localeCompare(b.date) || (a.how === 'pay' ? -1 : 1));
    let k = 0;
    for (const c of credits) {
      let left = c.amount;
      while (left > 0 && k < needs.length) {
        const n = needs[k];
        const room = n.amount - n.paidAmt - n.woAmt;
        const put = Math.min(room, left);
        if (c.how === 'pay') n.paidAmt += put; else n.woAmt += put;
        left -= put;
        if (n.paidAmt + n.woAmt >= n.amount) { n.completedOn = c.date; n.completedBy = c.how; k++; }
      }
    }
    needs.forEach((n) => {
      const covered = n.paidAmt + n.woAmt;
      n.short = n.amount - covered;
      if (covered >= n.amount) n.status = n.completedBy === 'wo' && n.paidAmt === 0 ? 'writtenoff' : 'paid';
      else if (covered > 0) n.status = 'partly';
      else n.status = 'unpaid';
      n.lateDays = n.status === 'paid' && n.due && n.completedOn > n.due ? diffDays(n.completedOn, n.due) : 0;
      n.overdueDays = n.status !== 'paid' && n.status !== 'writtenoff' && n.due && n.due < today ? diffDays(today, n.due) : 0;
      n.dueToday = n.status !== 'paid' && n.status !== 'writtenoff' && n.due === today;
    });
    r.items = needs;
    const open = needs.filter((n) => n.kind !== 'charge' && (n.status === 'unpaid' || n.status === 'partly'));
    r.next = r.settled ? null : (open[0] || null);
    r.overdueItems = open.filter((n) => n.overdueDays > 0);
    r.chargeOwing = needs.filter((n) => n.kind === 'charge' && n.short > 0).reduce((s, n) => s + n.short, 0);
    return r;
  }

  // Totals for Home. Two directions, never netted. Tabs count by their effective direction.
  function portfolio(debts, today) {
    const month = today.slice(0, 7);
    const out = { owe: 0, owed: 0, dueMonth: 0, dueMonthPaid: 0, carried: 0, overdue: [], next: null, nextOwed: null, upcoming: [] };
    const active = debts.filter((d) => !d.settledOn).map((d) => compute(d, today));
    for (const c of active) {
      if (c.remaining > 0) out[c.effectiveDirection] += c.remaining;
      if (c.direction === 'owe' && c.type !== 'tab') {
        for (const n of c.items) {
          if (n.kind === 'charge') continue;
          const inMonth = n.due && n.due.slice(0, 7) === month;
          const carried = n.due && n.due < month + '-01' && n.short > 0;
          if (inMonth || carried) {
            out.dueMonth += carried ? n.short : n.amount;
            if (carried) out.carried += n.short;
            out.dueMonthPaid += carried ? 0 : n.amount - n.short;
          }
        }
        for (const n of c.items) {
          if (n.kind !== 'charge' && (n.status === 'unpaid' || n.status === 'partly')) {
            out.upcoming.push({ debt: c, item: n });
            break; // only the first open item of each debt
          }
        }
      }
      if (c.direction === 'owed' && c.type === 'open' && c.next && c.next.due) {
        if (!out.nextOwed || c.next.due < out.nextOwed.item.due) out.nextOwed = { debt: c, item: c.next };
      }
    }
    // queue: EVERY open installment of "I owe" plans, by date (the hero's "then" lines must not skip a payment
    // just because another one of the same debt is already in the hero)
    out.queue = [];
    for (const c of active) {
      if (c.direction !== 'owe' || c.type === 'tab') continue;
      for (const n of c.items) if (n.kind !== 'charge' && (n.status === 'unpaid' || n.status === 'partly')) out.queue.push({ debt: c, item: n });
    }
    out.queue.sort((a, b) => (a.item.due || '9').localeCompare(b.item.due || '9'));
    out.upcoming.sort((a, b) => (a.item.due || '9').localeCompare(b.item.due || '9'));
    out.next = out.upcoming[0] || null;
    out.overdue = out.upcoming.filter((u) => u.item.overdueDays > 0);
    out.computed = active;
    return out;
  }

  const api = { compute, portfolio, genFixed, splitTotal, diffDays, sum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PatasEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
