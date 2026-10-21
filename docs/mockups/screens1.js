/* Patas mockups: Welcome, Overview (direction A's Home), Debt detail (direction A). Fake data only.
   Round 2 (2026-10-02): Home became the Log tab; this Overview is the glance. Direction B was dropped. */
(function (root) {
  const U = root.PatasUI, E = root.PatasEngine;
  const { ic, money, moneyNum, fd, fdow, plural, esc, timing, itemState, bar6, bar4, frac, segBar, homeHdr, subHdr, skelBlock, errorCard, settledBadge, nameCls } = U;
  const TYPE = { fixed: 'Fixed plan', uneven: 'Uneven plan', open: 'Open balance', tab: 'Tab' };
  const S1 = {};
  const monthName = (X) => U.MONTHS_LONG[+X.today.slice(5, 7) - 1];

  // ---------- shared pieces ----------
  function typeDesc(d, c) {
    if (d.type === 'fixed') return `Fixed plan · ${c.items.filter((n) => n.kind === 'inst').length} × ${money(d.installments[0].amount)}`;
    if (d.type === 'uneven') return `Uneven plan · ${plural(d.installments.length, 'installment')}`;
    if (d.type === 'open') return 'Open balance' + (d.payBy ? ` · pay by ${fd(d.payBy)}` : '');
    return 'Tab';
  }
  function rowRight(X, d, c) {
    const dir = c.effectiveDirection;
    if (d.settledOn) return settledBadge(d.settledOn);
    if (c.type === 'tab') return `<span class="quiet">${plural(c.ledger.length, 'line')}${c.flipped ? ' · now reversed' : ''}</span>`;
    if (c.overpaid) return `<span class="pill soft">${ic('info')}Overpaid ${money(c.overpaid)}</span>`;
    if (c.next) {
      if (c.next.overdueDays > 0 || c.next.dueToday) return timing(c.next, dir, X.today);
      if (d.type === 'open') return `<span class="quiet">${c.next.due ? 'Pay by ' + fd(c.next.due) : 'Pay any time'}</span>`;
      return `<span class="quiet num">Next ${money(c.next.short)} · ${fd(c.next.due)}</span>`;
    }
    return '';
  }
  function debtRow(X, d, o) {
    const c = X.c(d), late = o && o.late > 0;
    const bar = d.settledOn ? `<div class="rowbar">${bar4(1)}</div>` : c.type === 'tab' ? '' : `<div class="rowbar">${bar4(frac(c))}</div>`;
    return `<div class="rw"><button class="row" data-go="debt" data-id="${d.id}">
      <div class="grow"><div class="sb ell ${nameCls(d)}">${esc(d.person)}</div><div class="t13 muted ell">${esc(d.label)} · ${TYPE[d.type]}</div></div>
      <div class="end">${late ? `<div class="sb num">${money(o.late)} overdue</div><div class="t12 muted num">${money(c.remaining)} left</div>` : `<div class="sb num ${nameCls(d)}">${money(d.settledOn ? c.total : c.remaining)}</div>${rowRight(X, d, c)}`}</div></button>${bar}</div>`;
  }
  function counts(X) {
    const act = X.db.debts.filter((d) => !d.settledOn);
    const by = { owe: [], owed: [] };
    act.forEach((d) => by[X.c(d).effectiveDirection].push(d));
    return { act, by, settledN: X.db.debts.length - act.length };
  }
  function dueMonthBlock(X, p) {
    const left = p.dueMonth - p.dueMonthPaid;
    const f = p.dueMonth > 0 ? p.dueMonthPaid / p.dueMonth : 0;
    return `<div class="kv"><span class="t15 md">Due this month</span><span class="t15 sb num">${money(p.dueMonth)}</span></div>
      <div style="margin:8px 0 6px">${bar6(f)}</div>
      <div class="t12 muted num">${money(p.dueMonthPaid)} paid · ${money(left)} to go</div>
      ${p.carried ? `<div class="t12 muted num" style="margin-top:2px">Includes ${money(p.carried)} overdue from earlier months</div>` : ''}`;
  }
  function owedCard(X, p) {
    const nx = p.nextOwed;
    return `<div class="card" data-glance="owed"><div class="kv"><span class="dir">${ic('in')} Owed to me</span><span class="t20 sb num" style="font-size:18px;line-height:24px">${money(p.owed)}</span></div>
      ${nx ? `<div class="t12 muted ell" style="margin-top:4px">Next: ${esc(X.byId(nx.debt.id).person)} · ${money(nx.item.short)} · ${fd(nx.item.due)}</div>` : `<div class="t12 muted" style="margin-top:4px">${p.owed ? 'Nothing due to you soon' : 'Nobody owes you right now'}</div>`}</div>`;
  }
  function condBanner(X) {
    if (X.S.cond === 'offline') return `<div class="banner" style="margin-bottom:12px">${ic('info')}<span>You're offline. Changes save on this phone and sync when you're back online.</span></div>`;
    return '';
  }

  // ---------- Welcome ----------
  S1.welcome = (X, step) => {
    if (step === 1) return `<div class="screen ctr"><div class="stack">${subHdr('Sign in')}
      <div class="stack" style="margin-top:8px"><div><div class="t22 sb">What's your email?</div><p class="muted" style="margin:4px 0 0">We'll send a 6-digit code. No password to remember.</p></div>
      ${U.field('email', 'Email', U.input('email', 'ana@example.com', 'type="email" inputmode="email" autocomplete="email"'))}
      <div class="turnstile"><b>${ic('check')}</b><span>Verification complete</span><span class="muted t12" style="margin-left:auto">Bot check</span></div>
      <button class="btn primary big block" data-go="welcome" data-step="2">Send code</button></div></div></div>`;
    if (step === 2) return `<div class="screen ctr"><div class="stack">${subHdr('Enter your code')}
      <div class="stack" style="margin-top:8px"><div><div class="t22 sb">Check your email</div><p class="muted" style="margin:4px 0 0">We sent a 6-digit code to ana@example.com.</p></div>
      <div class="otp" aria-label="6-digit code"><div>4</div><div>8</div><div>1</div><div class="cur"></div><div></div><div></div></div>
      <button class="btn primary big block" data-go="log" data-reset="1">Continue</button>
      <p class="muted t13" style="margin:0;text-align:center">Resend code in 0:42</p></div></div></div>`;
    return `<div class="screen ctr"><div class="stack" style="min-height:100%;justify-content:space-between;padding:96px 0 24px">
      <div class="stack" style="gap:16px"><div class="brand"><div class="logo" aria-label="Placeholder logo"><i></i><i></i></div><h1 class="wordmark">Patas</h1></div>
        <p class="t20" style="margin:8px 0 0;font-weight:500">Know who you owe, who owes you, and what's next.</p>
        <p class="muted" style="margin:0 auto;max-width:300px">Patas means "even". It tracks your installments and loans, reminds you before they're due, and keeps the QR codes you pay with.</p></div>
      <div class="stack"><button class="btn primary big block" data-go="welcome" data-step="1">Continue with email</button>
        <p class="muted t12" style="margin:0;text-align:center">Your debts are private to you.</p><button class="link" style="justify-content:center;font-size:13px" data-go="settings" data-focus="privacy">How we handle your data</button></div></div></div>`;
  };

  // ---------- Overview (the glance) ----------
  function heroA(X, p) {
    const { today } = X;
    if (!p.next) {
      const none = X.db.debts.length === 0, settled = !none && X.db.debts.every((d) => d.settledOn);
      return `<div class="hero" data-glance="next"><div class="mesh"><b></b><b></b><b></b></div>
        <div class="stack" style="gap:8px">${settled ? '' : `<div class="t13 hm">${none ? 'Nothing here yet' : 'Due next'}</div>`}
        <div class="t22 sb">${none ? 'Add your first debt' : settled ? 'Patas na.' : 'Nothing due soon'}</div>
        <div class="t13 hm">${none ? 'Track what you owe, what you\'re owed, and when the next payment is due.' : settled ? 'Everything you owed is settled.' : 'You\'re clear for the next while.'}</div>
        ${none ? `<button class="btn primary block" data-go="debtAdd" style="margin-top:4px">${ic('plus')} Add a debt</button>` : ''}</div></div>`;
    }
    const m = p.next, d = X.byId(m.debt.id), c = m.debt, it = m.item, qr = X.qrOf(d);
    const insts = c.items.filter((n) => n.kind === 'inst');
    const paidPart = it.status === 'partly' ? ` · ${ic('half')} ${money(it.amount - it.short)} paid` : '';
    const sub = d.type === 'open' ? (it.due ? `Pay by ${fdow(it.due)} · any amount` : 'No due date · pay any time')
      : `Installment ${insts.indexOf(it) + 1} of ${insts.length} · ${it.status === 'partly' ? fd(it.due) : fdow(it.due)}${paidPart}`;
    const top = it.overdueDays > 0 || it.dueToday ? timing(it, 'owe', today) : `<span class="t12 hm">${U.rel(it.due || '', today) || ''}</span>`;
    const thens = p.queue.filter((u) => u.item !== it).filter((u) => u.item.overdueDays > 0 || (u.item.due && E.diffDays(u.item.due, today) <= 7));
    const shown = thens.slice(0, 2), more = thens.length - shown.length;
    return `<div class="hero" data-glance="next"><div class="mesh"><b></b><b></b><b></b></div>
      <button data-go="debt" data-id="${d.id}" style="all:unset;display:block;width:100%;cursor:pointer" aria-label="Open ${esc(d.person)}">
        <div class="kv" style="align-items:center"><span class="t13 hm">Due next</span>${top}</div>
        <div class="t15 sb ell" style="margin-top:6px">${esc(d.person)}</div>
        <div class="t13 hm clamp2">${esc(d.label)}</div>
        <div class="t30 sb num" style="margin-top:4px">${money(it.short)}</div>${U.curInfo().rate === 1 ? '' : `<div class="t13 hm num">${U.moneyO(it.short)}</div>`}
        <div class="t13 hm" style="margin-top:2px;display:flex;gap:4px;align-items:center;flex-wrap:wrap">${sub}</div></button>
      <div class="btns" style="margin-top:12px">${qr ? `<button class="btn primary" data-go="showQr" data-id="${qr.id}" data-from="${d.id}">Pay</button>` : ''}<button class="btn ${qr ? 'outline' : 'primary'}" data-act="logfor" data-id="${d.id}">Record payment</button></div>
      ${shown.length ? `<div class="thens">${shown.map((u, i) => `<button class="kv t13 then" data-go="debt" data-id="${u.debt.id}" style="all:unset;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:44px;cursor:pointer;${i ? 'border-top:1px solid var(--border)' : ''}"><span class="hm ell">then  ${esc(X.byId(u.debt.id).person)}</span><span class="num hm" style="white-space:nowrap">${money(u.item.short)} · ${fd(u.item.due)}</span></button>`).join('')}${more > 0 ? `<button class="t13 hm" data-go="list" style="all:unset;box-sizing:border-box;display:flex;align-items:center;min-height:44px;width:100%;cursor:pointer">+${more} more · <span style="text-decoration:underline;margin-left:4px">See all</span></button>` : ''}</div>` : ''}</div>`;
  }

  S1.overview = (X) => {
    const c = X.S.cond, p = X.port, { act, by, settledN } = counts(X);
    const hdr = `${homeHdr(monthName(X), c === 'loading' ? 'loading' : c)}${U.curNote()}${condBanner(X)}`;
    if (c === 'loading') return `<div class="screen hasnav">${hdr}<div class="stack">${skelBlock(190)}${skelBlock(150)}${skelBlock(64)}</div></div>`;
    if (c === 'error') return `<div class="screen hasnav">${hdr}${errorCard('your overview')}</div>`;
    if (X.db.debts.length === 0) return `<div class="screen hasnav">${hdr}<div class="stack">${heroA(X, p)}
      <p class="muted t13" style="margin:4px 4px 0">Once you add a debt, this page shows what's due next, what you still owe, what's due this month, and what others owe you.</p></div></div>`;
    const oweCard = by.owe.length ? `<div class="card" data-glance="owe"><div class="dir">${ic('out')} I owe</div>
          <div class="kv" style="margin-top:6px"><span class="t15">Total I still owe</span><span class="t20 sb num">${money(p.owe)}</span></div>
          <hr class="hr">${dueMonthBlock(X, p)}</div>` : '';
    const owedC = act.length ? owedCard(X, p) : '';
    const allDone = X.db.debts.every((d) => d.settledOn);
    return `<div class="screen hasnav">${hdr}<div class="stack">${heroA(X, p)}${oweCard}${owedC}${allDone ? `<button class="link" style="align-self:flex-start" data-go="debtAdd">${ic('plus')} Add a debt</button>` : ''}</div></div>`;
  };

  // ---------- Debt detail ----------
  function actionButtons(X, d, c) {
    const qr = X.qrOf(d), dir = c.effectiveDirection;
    if (d.settledOn) return '';
    if (d.type === 'tab') {
      const w = dir === 'owe' ? ['+ Borrowed', '− I paid'] : ['+ Lent', '− They paid'];
      return `<div class="btns"><button class="btn outline" data-act="logfor" data-id="${d.id}" data-kind="add">${w[0]}</button><button class="btn primary" data-act="logfor" data-id="${d.id}" data-kind="paid">${w[1]}</button></div>`;
    }
    const rec = dir === 'owed' ? 'Record payment received' : 'Record payment';
    if (dir === 'owe' && qr) return `<div class="btns"><button class="btn primary" data-go="showQr" data-id="${qr.id}" data-from="${d.id}">Pay</button><button class="btn outline" data-act="logfor" data-id="${d.id}">${rec}</button></div>`;
    if (dir === 'owed' && qr) return `<div class="btns"><button class="btn outline" data-go="showQr" data-id="${qr.id}" data-from="${d.id}">Show my QR</button><button class="btn primary" data-act="logfor" data-id="${d.id}">${rec}</button></div>`;
    return `<button class="btn primary block" data-act="logfor" data-id="${d.id}">${rec}</button>`;
  }
  function qrChangedBanner(X, d) {
    const q = X.qrOf(d);
    if (!q || !q.changedOn || E.diffDays(X.today, q.changedOn) > 14) return '';
    return `<div class="banner warn">${ic('shield')}<span>QR changed on ${U.fdy(q.changedOn, X.today)}. Check the account name before you pay.</span></div>`;
  }
  function nextLine(X, d, c) {
    const n = c.next; if (!n || d.settledOn || c.type === 'tab') return '';
    const dir = c.effectiveDirection;
    const when = n.overdueDays > 0 ? `${dir === 'owed' ? 'late' : 'overdue'} since ${fdow(n.due)}` : n.dueToday ? 'due today' : n.due ? `${d.type === 'open' ? 'pay by' : 'due'} ${fdow(n.due)}` : 'pay any time';
    return `<div class="t13">Next: <b class="num">${money(n.short)}</b> · ${when}</div>`;
  }
  function moreBtn(d) { return `<button class="iconbtn r" data-sheet="debtmenu" data-id="${d.id}" aria-label="More options for this debt">${ic('more')}</button>`; }
  function settleBtn(X, d, c) {
    const can = !d.settledOn && (c.remaining > 0 || c.overpaid > 0 || (c.type === 'tab' && c.balance !== 0));
    return can ? `<div style="margin-top:20px"><button class="btn outline block" data-sheet="settle" data-id="${d.id}">Mark as settled</button></div>` : '';
  }
  function rowState(n, d, today) {
    if (n.status === 'unpaid') {
      if (n.overdueDays > 0 || n.dueToday) return itemState(n, d.direction, today, true);
      return `<span class="quiet">${U.rel(n.due, today) || 'Upcoming'}</span>`;
    }
    return itemState(n, d.direction, today, true);
  }
  function planRows(X, d, c) {
    const insts = c.items.filter((n) => n.kind === 'inst');
    if (!insts.length) return '';
    const paidN = insts.filter((n) => n.status === 'paid').length, show = !!X.S.form.showpaid;
    const rows = insts.map((n, i) => ({ n, i })).filter((r) => show || r.n.status !== 'paid');
    return `<div class="grouphead"><h2>Installments</h2><span class="t12 muted">${paidN} of ${insts.length} paid</span></div>
      <div class="list">${paidN ? `<button class="row" data-act="togglepaid" style="min-height:44px"><span class="grow quiet ok" style="font-size:13px;line-height:18px">${ic('check')}${show ? 'Hide' : 'Show'} ${paidN} paid</span>${ic(show ? 'down' : 'right')}</button>` : ''}
      ${rows.map(({ n, i }) => `<div class="row static" style="${n.status === 'paid' ? 'opacity:.78' : ''}"><div class="grow"><div class="sb num">#${i + 1} · ${fdow(n.due)}</div><div style="margin-top:2px">${rowState(n, d, X.today)}</div></div><div class="sb num">${U.moneyO(n.amount)}</div></div>`).join('')}</div>`;
  }
  function chargeRows(X, d) {
    const ch = (d.charges || []);
    return `<div class="grouphead"><h2>Charges</h2><button class="link" data-go="charge" data-id="${d.id}">${ic('plus')} Add</button></div>
      ${ch.length ? `<div class="list">${ch.map((x, i) => `<button class="row" data-sheet="entry" data-id="${d.id}" data-k="charge" data-i="${i}"><div class="grow"><div class="sb">${esc(x.note || 'Charge')}</div><div class="t12 muted">${fd(x.date)}</div></div><div class="sb num">+${U.moneyO(x.amount)}</div></button>`).join('')}</div>` : `<p class="muted t13" style="margin:0">None. A late fee or penalty goes here when the lender actually charges one.</p>`}`;
  }
  function tabRows(X, d, c) {
    const rows = c.ledger.slice().reverse();
    return `<div class="grouphead"><h2>Lines</h2><span class="t12 muted">Tap one to see or edit it</span></div><div class="list">${rows.map((l) => `<button class="row" data-sheet="entry" data-id="${d.id}" data-k="line" data-i="${l._i}"><div class="grow"><div class="sb ell">${esc(l.note || (l.delta > 0 ? 'Added' : 'Paid'))}</div><div class="t12 muted">${fd(l.date)}</div></div><div class="end"><div class="sb num">${l.delta > 0 ? '+' : '−'} ${money(Math.abs(l.delta))}</div><div class="t12 muted">${l.delta > 0 ? 'added' : 'paid'}</div></div></button>`).join('')}</div>`;
  }
  function notesCard(d) { return d.notes ? `<div class="grouphead"><h2>Notes</h2></div><div class="card t13" style="padding:12px 16px">${esc(d.notes)}</div>` : ''; }
  function debtHead(X, d, c) { return c.effectiveDirection === 'owe' ? `You owe ${d.person}` : `${d.person} owes you`; }
  function topStatus(X, d, c) {
    if (d.settledOn) return settledBadge(d.settledOn);
    if (c.overpaid) return `<span class="pill soft">${ic('info')}Overpaid ${money(c.overpaid)}</span>`;
    if (c.next && (c.next.overdueDays > 0 || c.next.dueToday)) return timing(c.next, c.effectiveDirection, X.today);
    return '';
  }
  // the dated running-balance ledger (a page of the notebook). Payment and charge lines open their details.
  function ledgerCard(X, d, c) {
    let rows = [];
    if (c.type === 'tab') rows = c.ledger.map((l) => ({ date: l.date, what: l.note || (l.delta > 0 ? 'Added' : 'Paid'), amt: l.delta, bal: Math.abs(l.balance), src: { k: 'line', i: l._i } }));
    else {
      const start = d.type === 'open' ? (d.payments && d.payments[0] ? d.payments[0].date : X.today) : d.installments[0].due;
      const ev = [{ date: '0000', what: d.type === 'open' ? 'Agreed' : `Plan total (${c.items.filter((n) => n.kind === 'inst').length})`, amt: c.principal }]
        .concat((d.charges || []).map((x, i) => ({ date: x.date, what: x.note || 'Charge', amt: x.amount, src: { k: 'charge', i } })))
        .concat((d.payments || []).map((x, i) => ({ date: x.date, what: x.note || 'Payment', amt: -x.amount, src: { k: 'pay', i } })))
        .concat((d.writeoffs || []).map((x, i) => ({ date: x.date, what: x.note || 'Written off', amt: -x.amount, src: { k: 'wo', i } })))
        .sort((a, b) => (a.date === '0000' ? -1 : b.date === '0000' ? 1 : a.date.localeCompare(b.date)));
      let run = 0; rows = ev.map((e) => { run += e.amt; return { date: e.date === '0000' ? start : e.date, what: e.what, amt: e.amt, bal: run, src: e.src }; });
    }
    return `<div class="card" style="padding:4px 12px 8px;overflow-x:hidden"><table class="ledger"><thead><tr><th>Date</th><th>What</th><th class="r">Amount${U.curInfo().rate === 1 ? '' : ' ₱'}</th><th class="r">Left${U.curInfo().rate === 1 ? '' : ' ₱'}</th></tr></thead><tbody>${rows.map((r, i) => `<tr class="${i === rows.length - 1 ? 'cur' : ''} ${r.src ? 'tap' : ''}" ${r.src ? `role="button" tabindex="0" data-sheet="entry" data-id="${d.id}" data-k="${r.src.k}" data-i="${r.src.i}" aria-label="${esc(r.what)}, ${fd(r.date)}. Open details"` : ''}><td class="num" style="white-space:nowrap">${fd(r.date)}</td><td class="wrap2">${esc(r.what)}</td><td class="r num">${r.amt > 0 ? '+' : '−'}${U.moneyNumO(Math.abs(r.amt))}</td><td class="r num">${U.moneyNumO(r.bal)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function amountLine(c, d) {
    const word = d.settledOn ? 'settled' : c.effectiveDirection === 'owe' ? 'left to pay' : 'left to collect';
    return `<div style="display:flex;align-items:baseline;gap:8px"><span class="t22 sb num ${nameCls(d)}">${money(d.settledOn ? c.total : c.remaining)}</span><span class="t13 muted">${word}</span></div>`;
  }

  function debtA(X, d) {
    const c = X.c(d), dir = c.effectiveDirection, tab = c.type === 'tab';
    let bar = d.settledOn ? bar6(1) : '';
    if (!tab && !d.settledOn) bar = d.type === 'fixed' && c.items.filter((n) => n.kind === 'inst').length <= 24 ? segBar(c) : bar6(frac(c));
    const flipNote = tab && c.flipped ? `<div class="banner">${ic('info')}<span>This tab crossed zero. Now ${dir === 'owed' ? esc(d.person) + ' owes you' : 'you owe ' + esc(d.person)}.</span></div>` : '';
    const top = `<div class="card stack" style="gap:12px">
      <div class="cardhead"><span class="dir">${ic(dir === 'owe' ? 'out' : 'in')} ${dir === 'owe' ? 'I owe' : 'Owed to me'}</span>${topStatus(X, d, c)}</div>
      <div><div class="sb wrap2 ${nameCls(d)}">${esc(d.label)}</div><div class="t13 muted">${typeDesc(d, c)}</div></div>
      ${nextLine(X, d, c)}
      ${amountLine(c, d)}
      ${bar}
      <div class="t13 muted num">${tab ? `Added ${money(c.added)} · paid ${money(c.paidIn)}` : `${money(c.paid)} paid of ${money(c.total)}${c.writeoffs ? ` · ${money(c.writeoffs)} written off` : ''}`}</div>
      ${actionButtons(X, d, c)}</div>`;
    return `<div class="screen">${subHdr(debtHead(X, d, c), moreBtn(d))}<div class="stack">${qrChangedBanner(X, d)}${flipNote}${top}</div>
      ${tab ? tabRows(X, d, c) : `<div class="grouphead"><h2>History</h2><span class="t12 muted">Tap a line to see or edit it</span></div>${ledgerCard(X, d, c)}${planRows(X, d, c)}${chargeRows(X, d)}`}${notesCard(d)}${settleBtn(X, d, c)}</div>`;
  }

  S1.debt = (X, id) => {
    const d = X.byId(id);
    if (!d) return `<div class="screen">${subHdr('Debt')}<div class="empty"><h2>That debt isn't here</h2><p>It may have been deleted.</p></div></div>`;
    if (X.S.cond === 'loading') return `<div class="screen">${subHdr(d.person)}<div class="stack">${skelBlock(230)}${skelBlock(120)}${skelBlock(180)}</div></div>`;
    if (X.S.cond === 'error') return `<div class="screen">${subHdr(d.person)}${errorCard('this debt')}</div>`;
    return debtA(X, d);
  };

  root.PatasScreens = Object.assign(root.PatasScreens || {}, S1, { _shared: { debtRow, typeDesc, TYPE, qrChangedBanner, counts, monthName } });
})(window);
