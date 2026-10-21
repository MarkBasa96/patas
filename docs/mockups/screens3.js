/* Patas mockups, round 2: Log, List, Settings (Gastos-style), entry details and edit pop-ups, pickers, FAQ, feedback,
   brand previews. Fake data only. Pop-up pattern copied from Gastos: centered cards over a blurred screen for
   "check before it happens" and details, bottom sheets for pickers. */
(function (root) {
  const U = root.PatasUI, E = root.PatasEngine, TH = root.PatasThemes, SC = root.PatasScreens;
  const { ic, money, moneyNum, sym, fd, fdowy, plural, esc, subHdr, homeHdr, field, input, seg3, sheet, dialog, confirmBox, skelBlock, errorCard, bar6, datePick, settledBadge, nameCls } = U;
  const { debtRow, TYPE, counts } = SC._shared;
  const S3 = {};
  const dlong = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${U.MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
  const dateWord = (iso, today) => (iso === today ? 'Today' : iso === addDays(today, -1) ? 'Yesterday' : fdowy(iso, today));

  // ---------- LOG: tap what's due, then Save ----------
  // "Today, Fri Oct 2": the confirm pop-up shows the real date (Erina r2 #19)
  const dateFull = (iso, today) => {
    const w = iso === today ? 'Today' : iso === addDays(today, -1) ? 'Yesterday' : '';
    const d = new Date(iso + 'T00:00:00Z');
    return w ? `${w}, ${U.DOW[d.getUTCDay()]} ${U.MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` : fdowy(iso, today);
  };
  function tileFor(X, d, sel) {
    const c = X.c(d), n = c.next, today = X.today;
    let sub = '', sub2 = '';
    if (c.type === 'tab') { sub = U.moneyO(c.remaining); sub2 = 'tab'; }
    else if (d.type === 'open') { sub = U.moneyO(c.remaining); sub2 = n && n.due ? `pay by ${U.fd(n.due)}` : 'any time'; }
    else if (n) {
      sub = U.moneyO(n.short);
      sub2 = n.overdueDays > 0 ? `<span class="rdot"></span> overdue` : n.dueToday ? 'due today' : E.diffDays(n.due, today) <= 7 ? `due ${U.DOW[new Date(n.due + 'T00:00:00Z').getUTCDay()]}` : `due ${U.fd(n.due)}`;
    }
    // the name is how people choose, so it wraps (two lines at most) and is never cut by the tick, which sits on the tile's corner
    return `<button class="tile ${sel === d.id ? 'on' : ''}" data-act="logsel" data-id="${d.id}" aria-pressed="${sel === d.id}" aria-label="${esc(d.person)}">
      <span class="tick">${ic('check')}</span><span class="nm clamp2">${esc(d.person)}</span><span class="subs"><span class="sub num ell" style="display:block">${sub}</span><span class="sub ell" style="display:block">${sub2}</span></span></button>`;
  }
  S3.log = (X) => {
    const S = X.S, F = X.F, today = X.today;
    const pay = S.logDir !== 'recv', dirKey = pay ? 'owe' : 'owed';
    const hdr = homeHdr('Log', S.cond);
    if (S.cond === 'loading') return `<div class="screen hasnav">${hdr}<div class="stack">${skelBlock(52)}${skelBlock(160)}${skelBlock(64)}${skelBlock(52)}</div></div>`;
    if (S.cond === 'error') return `<div class="screen hasnav">${hdr}${errorCard('your debts')}</div>`;
    const offline = S.cond === 'offline' ? `<div class="banner" style="margin-bottom:12px">${ic('info')}<span>You're offline. Saves wait on this phone and sync later.</span></div>` : '';
    // First run: no form at all. A form with nothing to log is a cold welcome (Erina r2 #2.4).
    if (X.db.debts.length === 0) return `<div class="screen hasnav" data-log>${hdr}${offline}<div class="stack"><div class="card stack" style="gap:8px;text-align:center;align-items:center;padding:28px 20px">
      <div class="t20 sb">Add your first debt to start logging.</div><div class="t13 muted" style="max-width:260px">Once a debt is in, each payment is one tap here.</div><button class="btn primary" style="margin-top:8px" data-go="debtAdd">${ic('plus')} Add a debt</button></div></div></div>`;
    const act = X.db.debts.filter((d) => !d.settledOn && X.c(d).effectiveDirection === dirKey);
    const key = (d) => { const n = X.c(d).next; return n && n.due ? n.due : '9999'; };
    act.sort((a, b) => key(a).localeCompare(key(b)));
    const selId = S.logSel, selDebt = selId ? X.byId(selId) : null;
    let shown = act.slice(0, 5);
    if (selDebt && !shown.includes(selDebt) && act.includes(selDebt)) shown[4] = selDebt;
    const c = selDebt ? X.c(selDebt) : null;
    const dirSwitch = seg3('f-ldir', [['pay', `${ic('out')} I paid`], ['recv', `${ic('in')} I received`]], pay ? 'pay' : 'recv');
    // This side has nothing to log: the switch and one plain sentence, no dead Amount field or Save button.
    if (act.length === 0) return `<div class="screen hasnav" data-log>${hdr}${offline}<div class="stack">${dirSwitch}
      <div class="card t13 muted" style="text-align:center">${pay ? 'Nothing to pay right now.' : 'Nobody owes you right now.'}<div style="margin-top:8px"><button class="link" style="margin:0 auto" data-go="debtAdd">${ic('plus')} Add a debt</button></div></div></div></div>`;
    let hint = '';
    if (selDebt && c) {
      if (selDebt.type === 'tab') hint = `Tab balance ${U.moneyO(c.remaining)}`;
      else if (selDebt.type === 'open') hint = `Open balance · ${U.moneyO(c.remaining)} left · any amount`;
      else if (c.next) { const ins = c.items.filter((n) => n.kind === 'inst'); hint = `Installment ${ins.indexOf(c.next) + 1} of ${ins.length} · due ${U.fdow(c.next.due)}${c.next.status === 'partly' ? ` · ${U.moneyO(c.next.amount - c.next.short)} already paid` : ''}`; }
    }
    // The two tab choices are small chips under the Amount label, lighter than the main switch (Erina r2 #3)
    const tabKinds = selDebt && selDebt.type === 'tab'
      ? (pay ? [['paid', 'Paying back'], ['add', 'Borrowed more']] : [['paid', 'Paid me back'], ['add', 'Lent more']]) : null;
    const kindNow = F('f-tabkind', 'paid');
    const kindChips = tabKinds ? `<div class="kindchips" role="group" aria-label="What kind of entry">${tabKinds.map(([k, l]) => `<button class="kc ${kindNow === k ? 'on' : ''}" data-seg="f-tabkind" data-v="${k}" aria-pressed="${kindNow === k}"><span>${l}</span></button>`).join('')}</div>` : '';
    const amount = F('f-lamount', '');
    const ready = !!selDebt && E && parseFloat(String(amount).replace(/[,\s]/g, '')) > 0;
    const qr = selDebt ? X.qrOf(selDebt) : null;
    const date = F('f-ldate', today);
    const hintLine = `<div class="hint hintrow" id="lhint"><span>${hint || 'Tap what you paid. The amount fills in.'}</span>${qr ? `<span aria-hidden="true">·</span><button class="link tinylink" data-go="showQr" data-id="${qr.id}" data-from="${selDebt.id}">Show QR ${ic('right')}</button>` : ''}</div>`;
    // Log is one job: pick, check the amount, Save. Save is pinned just above the tabs so it is never hidden (Erina r2 #2).
    return `<div class="screen hasnav logscreen" data-log>${hdr}${offline}
      <div class="stack">
        ${dirSwitch}
        <div><div class="lbl" style="margin-bottom:6px">${pay ? 'What did you pay?' : 'Who paid you?'}</div>
          <div class="tiles">${shown.map((d) => tileFor(X, d, selId)).join('')}<button class="tile other" data-sheet="otherdebt" aria-label="Other debt">${ic('more')}<span class="nm">Other</span></button></div></div>
        <div class="field"><label for="f-lamount">Amount</label>${kindChips}<div class="amount"><span>${sym()}</span><input id="f-lamount" inputmode="decimal" placeholder="0.00" value="${esc(amount)}" ${selDebt ? '' : 'disabled'}></div>${hintLine}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="chip" data-sheet="logdate">${ic('cal')} ${dateWord(date, today)} ${ic('down')}</button></div>
        <div class="notefield">${ic('file')}<input id="f-lnote" placeholder="Add a note (optional)" value="${esc(F('f-lnote', ''))}" aria-label="Note"></div>
      </div></div>
      <div class="savebar"><button class="btn primary big block" id="logsave" data-sheet="confirmlog" ${ready ? '' : 'disabled'}>${pay ? 'Save payment' : 'Save received'}</button></div>`;
  };

  // ---------- LIST: everything, with filters (Gastos's History) ----------
  function listFilter(X) {
    const f = X.S.lf, today = X.today;
    let ds = X.db.debts.slice();
    ds = ds.filter((d) => {
      const c = X.c(d), settled = !!d.settledOn, dir = settled ? d.direction : c.effectiveDirection;
      if (f.dir !== 'all' && dir !== f.dir) return false;
      if (f.type !== 'any' && d.type !== f.type) return false;
      if (f.person !== 'any' && d.person !== f.person) return false;
      if (f.q && !(d.person + ' ' + d.label).toLowerCase().includes(f.q.toLowerCase())) return false;
      if (f.status === 'open') return !settled;
      if (f.status === 'overdue') return !settled && c.overdueItems && c.overdueItems.length > 0;
      if (f.status === 'week') return !settled && c.next && c.next.due && c.next.overdueDays === 0 && E.diffDays(c.next.due, today) <= 7;
      if (f.status === 'settled') return settled;
      return true;
    });
    const nextKey = (d) => { const n = X.c(d).next; return n && n.due ? n.due : '9999'; };
    if (f.sort === 'amount') ds.sort((a, b) => X.c(b).remaining - X.c(a).remaining);
    else if (f.sort === 'name') ds.sort((a, b) => a.person.localeCompare(b.person));
    else ds.sort((a, b) => (a.settledOn ? 1 : 0) - (b.settledOn ? 1 : 0) || nextKey(a).localeCompare(nextKey(b)));
    return ds;
  }
  S3.list = (X) => {
    const S = X.S, f = S.lf;
    const hdr = `<div class="hdr"><h1>List</h1><button class="iconbtn r" data-act="lfsearch" aria-label="Search">${ic('search')}</button></div>`;
    if (S.cond === 'loading') return `<div class="screen hasnav">${hdr}<div class="stack">${skelBlock(44)}${skelBlock(88)}${skelBlock(56)}${skelBlock(56)}</div></div>`;
    if (S.cond === 'error') return `<div class="screen hasnav">${hdr}${errorCard('your list')}</div>`;
    const ds = listFilter(X);
    const chip = (k, v, l, cur) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="lf" data-k="${k}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`;
    const extra = (f.type !== 'any' ? 1 : 0) + (f.person !== 'any' ? 1 : 0) + (f.sort !== 'due' ? 1 : 0);
    const overdueMode = f.status === 'overdue';
    const lateAmt = (d) => (X.c(d).overdueItems || []).reduce((s, n) => s + n.short, 0);
    let groups = '';
    if (!ds.length) groups = `<div class="empty"><h2>No debts match</h2><p>Try a different filter, or clear them all.</p><button class="btn outline" data-act="lfclear">Clear filters</button></div>`;
    else if (f.status === 'settled') groups = `<div class="grouphead"><h2>Settled (${ds.length})</h2></div><div class="list">${ds.map((d) => debtRow(X, d)).join('')}</div>`;
    else {
      // The rule this app is built on: "I owe" and "Owed to me" are never mixed, never netted. Each section carries its own total (Erina r2 #1).
      const by = { owe: [], owed: [] };
      ds.forEach((d) => by[X.c(d).effectiveDirection].push(d));
      groups = ['owe', 'owed'].filter((k) => by[k].length).map((k) => {
        const arr = by[k], tot = arr.reduce((s, d) => s + (overdueMode ? lateAmt(d) : X.c(d).remaining), 0);
        return `<div class="grouphead"><h2 class="dirhead">${ic(k === 'owe' ? 'out' : 'in')} ${k === 'owe' ? 'I owe' : 'Owed to me'} (${arr.length}) · <span class="num">${money(tot)}${overdueMode ? ' overdue' : ''}</span></h2></div><div class="list">${arr.map((d) => debtRow(X, d, { late: overdueMode ? lateAmt(d) : 0 })).join('')}</div>`;
      }).join('');
    }
    return `<div class="screen hasnav">${hdr}${U.curNote()}
      ${f.search ? `<div class="searchbox" style="margin-bottom:12px">${ic('search')}<input id="lf-q" placeholder="Search by name or what it is for" value="${esc(f.q)}" aria-label="Search debts"></div>` : ''}
      <div class="chips tight" role="group" aria-label="Direction">${chip('dir', 'all', 'All', f.dir)}${chip('dir', 'owe', `${ic('out')} I owe`, f.dir)}${chip('dir', 'owed', `${ic('in')} Owed to me`, f.dir)}<button class="chip iconchip" data-sheet="lfilter" aria-label="More filters${extra ? ', ' + extra + ' on' : ''}">${ic('filter')}${extra ? `<span class="badge">${extra}</span>` : ''}</button></div>
      <div class="seg3" id="lfstatus" role="group" aria-label="Status" style="margin-top:8px">${[['open', 'Open'], ['overdue', 'Overdue'], ['week', 'This week'], ['settled', 'Settled']].map(([v, l]) => `<button data-act="lf" data-k="status" data-v="${v}" class="${f.status === v ? 'on' : ''}" aria-pressed="${f.status === v}">${l}</button>`).join('')}</div>
      ${groups}</div>`;
  };

  // ---------- SETTINGS (Gastos-style) ----------
  S3.settings = (X) => {
    const S = X.S, mode = X.mode;
    const on = (k, def) => (S.sw[k] === undefined ? def : S.sw[k]);
    const sw = (k, v) => `<button class="switch ${v ? 'on' : ''}" role="switch" aria-checked="${v}" data-sw="${k}" aria-label="${k}"></button>`;
    const row = (l, r, sub, extra) => `<div class="row static" ${extra || ''}><div class="grow"><div class="md">${l}</div>${sub ? `<div class="t12 muted">${sub}</div>` : ''}</div>${r || ''}</div>`;
    const link = (l, sub, attrs, right) => `<button class="row" ${attrs}><div class="grow"><div class="md">${l}</div>${sub ? `<div class="t12 muted">${sub}</div>` : ''}</div>${right || ic('right')}</button>`;
    const grp = (title, rows) => `<div class="grouphead"><h2>${title}</h2></div><div class="list">${rows.join('')}</div>`;
    const cur = U.curInfo(), th = TH.THEMES[S.theme] || TH.THEMES.ink;
    const dots = `<span class="dots">${TH.ORDER.slice(0, 5).map((k) => `<i style="background:${TH.tokens(k, mode)['--accent']}"></i>`).join('')}</span>`;
    const appear = [['system', 'sunmoon', 'Auto'], ['light', 'sun', 'Light'], ['dark', 'moon', 'Dark']];
    const people = new Set(X.db.debts.map((d) => d.person)).size;
    return `<div class="screen hasnav">${homeHdr('Settings', S.cond)}
      <div class="card"><div class="cardhead"><div class="sb" style="font-size:17px;line-height:24px">Backed up online</div><span style="color:var(--accent)">${ic('cloud')}</span></div>
        <div class="t13 muted" style="margin-top:2px">ana@example.com</div><div class="t13 muted" style="margin-top:8px">Last synced just now. Every entry saves to your phone first, then here.</div></div>
      ${grp('Security', [link('Set up app lock (MPIN)', 'One 4-digit PIN for all your phones. Off by default.', 'data-toast="App lock is a mockup"')])}
      <div class="grouphead"><h2>Preferences</h2></div><div class="list">
        <div class="row static"><div class="grow"><div class="md">Appearance</div><div class="t12 muted">${S.look === 'system' ? 'Follows your phone' : S.look === 'light' ? 'Always light' : 'Always dark'}</div></div>
          <div class="seg3" id="look" role="group" aria-label="Appearance" style="width:150px">${appear.map(([k, i, l]) => `<button data-seg="look" data-v="${k}" class="${S.look === k ? 'on' : ''}" aria-pressed="${S.look === k}" aria-label="${l}">${ic(i)}</button>`).join('')}</div></div>
        ${link('Color theme', esc(th.name), 'data-sheet="themepick"', dots + ic('right'))}
        ${link('Currency', 'Converts amounts at today’s rate', 'data-sheet="currency"', `<span class="chip" style="min-height:36px;pointer-events:none"><b>${cur.sym.trim()}</b> ${cur.code} ${ic('down')}</span>`)}
        ${row('Sounds', sw('sounds', on('sounds', false)), 'A soft tick when you save. Off until you turn it on.')}
        ${row('Reminders', sw('rem', on('rem', true)), on('rem', true) ? 'Day before and day of, at 8:00 AM' : 'Off')}</div>
      ${grp('Your data', [link('People', `${people} you have debts with`, 'data-go="people"'), link('QR codes', `${X.db.vault.length} saved`, 'data-go="vault"'), link('Back up to a file', '', 'data-toast="Back up is a mockup"', ic('download')), link('Restore from a file', '', 'data-toast="Restore is a mockup"', ic('upload')), link('Export CSV', 'Debts and payments, for a spreadsheet', 'data-toast="Export is a mockup"', ic('download')), row('Include QR codes in backups', sw('qrb', on('qrb', false)), 'Off. QR images stay out unless you turn this on.')])}
      ${grp('Help', [link('FAQ', 'Quick answers, works offline', 'data-sheet="faq"', ic('help')), link('Send feedback', 'Goes straight to the person who makes Patas', 'data-sheet="feedback"', ic('msg'))])}
      <div class="grouphead"><h2>Privacy</h2></div><div class="card t13" id="privacy"><p style="margin:0 0 8px">Your debts are private from other users. The person running this server can technically see stored data. They don't look at it, sell it or share it, and you can delete everything at any time.</p>
        <p style="margin:0 0 8px">A QR you save or share leaves Patas. Signing out or deleting your account doesn't remove that copy.</p><span class="muted t12">Draft wording. The final text is settled with the security review.</span></div>
      <div class="grouphead"><h2>Account</h2></div><div class="stack"><button class="btn outline block" style="color:var(--danger);border-color:var(--danger)" data-sheet="delaccount">${ic('trash')} Delete my account</button>
        <button class="btn ghost block" data-sheet="signout">Sign out</button>
        <button class="link" style="justify-content:center" data-go="importTool">Import from spreadsheet (owner tool)</button>
        <button class="link" style="justify-content:center" data-go="appicons">Brand previews</button>
        <p class="muted t12" style="text-align:center;margin:0">Patas mockup · invented data only</p></div></div>`;
  };

  // ---------- Brand previews (placeholders until Joe's own logo arrives) ----------
  S3.loading = (X) => `<div class="screen"><div style="min-height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;padding-block:120px"><div class="loader" role="img" aria-label="Loading"><i></i><i></i></div><div class="wordmark" style="font-size:24px;line-height:30px">Patas</div><p class="muted t13" style="margin:0">The short bar grows until the two are level: "patas".</p></div></div>`;
  S3.splash = (X) => `<div class="splash"><div class="logo" style="width:96px;height:96px;border-radius:26px;gap:11px"><i style="width:44px;height:8px"></i><i style="width:44px;height:8px"></i></div><div class="wordmark" style="font-size:30px">Patas</div></div>`;
  S3.appicons = (X) => {
    const opt = (title, body, note) => `<div class="card stack" style="gap:12px"><div class="sb">${title}</div>${body}<div class="t13 muted">${note}</div></div>`;
    const a = `<div class="appicon"><i class="b"></i><i class="b"></i></div>`;
    const b = `<div class="appicon"><svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 26l10 10L40 12"/></svg></div>`;
    const c = `<div class="appicon"><span style="font:700 36px/1 Poppins,sans-serif">P</span><i class="b" style="position:absolute;bottom:12px;width:26px;height:4px"></i></div>`;
    const mono = (inner) => `<div class="appicon mono">${inner}</div>`;
    const set = (icon, m, label) => `<div class="appgrid"><div>${icon}Home screen</div><div><div class="appicon" style="background:#1A1D24;color:#95ADE4;border:1px solid #2C313C">${m}</div>Dark</div><div>${mono(m)}Android one-colour</div></div>`;
    return `<div class="screen">${subHdr('Brand previews')}<div class="stack">
      <div class="banner">${ic('info')}<span>Placeholders only, so you can see how a logo sits in each place. Your own logo replaces these. Rules: ink-led, not like Gastos (no pig, coin, jar), still readable in one colour, and not a menu icon.</span></div>
      ${opt('A · Two level bars', set(a, '<i class="b" style="height:5px;width:26px;display:block;margin-bottom:6px"></i><i class="b" style="height:5px;width:26px;display:block"></i>'), 'Echoes "patas" (level) and the progress bar. Risk: reads as a menu icon if it sits in a corner, so the app never puts it there.')}
      ${opt('B · A tick', set(b, '<svg viewBox="0 0 48 48" width="30" height="30" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 26l10 10L40 12"/></svg>'), 'Means "all good" at a glance. Risk: generic, many apps use a tick.')}
      ${opt('C · P with a level line', set(c, '<span style="font:700 26px/1 Poppins,sans-serif">P</span>'), 'A letter you can recognise, with the line under it. Risk: a letter is easy to confuse with other P apps.')}
      <div class="grouphead" style="margin-top:4px"><h2>Loading and opening</h2></div>
      <div class="btns"><button class="btn outline" data-go="loading">Loading picture</button><button class="btn outline" data-go="splash">Splash</button></div></div></div>`;
  };

  // ---------- sheets and pop-ups ----------
  const SH = {};
  const itemOf = (d, k, i) => (k === 'pay' ? d.payments[i] : k === 'charge' ? d.charges[i] : k === 'line' ? d.lines[i] : d.writeoffs[i]);
  const KIND = { pay: 'Payment', charge: 'Charge', line: 'Tab line', wo: 'Written off' };
  const stamp = (it) => `${fd(it.date)}, 7:${(it.date.charCodeAt(9) % 5) + 1}2 PM`;

  SH.confirmlog = (X) => {
    const S = X.S, d = X.byId(S.logSel); if (!d) return '';
    const c = X.c(d), pay = S.logDir !== 'recv', date = X.F('f-ldate', X.today), note = X.F('f-lnote', ''), amt = X.F('f-lamount', '');
    const ins = c.items.filter((n) => n.kind === 'inst');
    let line = '';
    if (d.type === 'tab') line = (X.F('f-tabkind', 'paid') === 'paid') ? (pay ? '− Paying back' : '− Paid me back') : (pay ? '+ Borrowed more' : '+ Lent more');
    else if (c.next) line = d.type === 'open' ? 'Open balance' : `Installment ${ins.indexOf(c.next) + 1} of ${ins.length}`;
    return dialog(`<h3>${pay ? 'Save this payment?' : 'Save this payment received?'}</h3>
      <div class="card" style="background:var(--bg)"><div class="kv" style="align-items:center"><div class="grow" style="min-width:0"><div class="sb ell">${esc(d.person)}</div><div class="t13 muted wrap2">${esc(d.label)}</div><div class="t13 muted">${line ? `<span class="nw">${line}</span> · ` : ''}<span class="nw">${dateFull(date, X.today)}</span></div></div><div class="sb num t20" style="white-space:nowrap">${sym()}${esc(amt)}</div></div>
      ${note ? `<div class="notebox" style="margin-top:12px">${ic('file')}<span>${esc(note)}</span></div>` : ''}</div>
      <div class="btns"><button class="btn outline" data-act="closesheet">Cancel</button><button class="btn primary" data-act="savelog">Save it</button></div>`);
  };
  SH.logdate = (X) => {
    const t = X.today, y = addDays(t, -1), cur = X.F('f-ldate', t), other = cur !== t && cur !== y;
    return sheet(`<h3>When?</h3>
      <div class="seg3" role="group" aria-label="Day"><button data-act="setldate" data-v="${t}" class="${cur === t ? 'on' : ''}" aria-pressed="${cur === t}">Today</button><button data-act="setldate" data-v="${y}" class="${cur === y ? 'on' : ''}" aria-pressed="${cur === y}">Yesterday</button></div>
      <div class="picker datepick ${other ? 'picked' : ''}"><span id="f-pick-lbl">${other ? fdowy(cur, t) : 'Another day…'}</span>${ic('cal')}<input type="date" id="f-pick" value="${other ? cur : ''}" max="${t}" aria-label="Pick another day"></div>`);
  };
  SH.otherdebt = (X) => {
    const pay = X.S.logDir !== 'recv', dirKey = pay ? 'owe' : 'owed';
    const act = X.db.debts.filter((d) => !d.settledOn && X.c(d).effectiveDirection === dirKey);
    return sheet(`<h3>${pay ? 'Which debt?' : 'Who paid you?'}</h3><div class="searchbox">${ic('search')}<input id="oq" placeholder="Search" aria-label="Search debts"></div>
      <div class="list" id="otherlist">${act.map((d) => `<button class="row" data-act="logsel" data-id="${d.id}" data-q="${esc((d.person + ' ' + d.label).toLowerCase())}"><div class="grow"><div class="sb ell">${esc(d.person)}</div><div class="t13 muted ell">${esc(d.label)}</div></div></button>`).join('')}
      <button class="row" data-go="debtAdd">${ic('plus')}<div class="grow sb">New debt</div></button></div>`);
  };
  SH.lfilter = (X) => {
    const f = X.S.lf;
    const ch = (k, v, l, cur) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="lf" data-k="${k}" data-v="${v}" data-keep="1" aria-pressed="${cur === v}">${l}</button>`;
    return sheet(`<h3>Filters</h3>
      <div class="lbl">What kind</div><div class="chips" style="flex-wrap:wrap;overflow:visible">${[['any', 'Any'], ['fixed', 'Fixed plan'], ['uneven', 'Uneven plan'], ['open', 'Open balance'], ['tab', 'Tab']].map(([v, l]) => ch('type', v, l, f.type)).join('')}</div>
      <div class="lbl">Who</div><button class="picker" data-sheet="lfperson">${f.person === 'any' ? 'Anyone' : esc(f.person)}${ic('right')}</button>
      <div class="lbl">Sort by</div><div class="chips" style="flex-wrap:wrap;overflow:visible">${[['due', 'Due date'], ['amount', 'Amount'], ['name', 'Name']].map(([v, l]) => ch('sort', v, l, f.sort)).join('')}</div>
      <div class="btns"><button class="btn outline" data-act="lfclear" data-keep="1">Clear</button><button class="btn primary" data-act="closesheet">Done</button></div>`);
  };
  SH.lfperson = (X) => {
    const people = [...new Set(X.db.debts.map((d) => d.person))].sort((a, b) => a.localeCompare(b));
    const tk = `<span style="color:var(--accent);margin-left:auto">${ic('check')}</span>`;
    return sheet(`<h3>Who?</h3><div class="searchbox">${ic('search')}<input id="pq" placeholder="Search" aria-label="Search people"></div>
      <div class="list" id="personlist"><button class="row" data-act="lfpick" data-v="any" data-q="anyone">Anyone${X.S.lf.person === 'any' ? tk : ''}</button>${people.map((p) => `<button class="row" data-act="lfpick" data-v="${esc(p)}" data-q="${esc(p.toLowerCase())}">${esc(p)}${X.S.lf.person === p ? tk : ''}</button>`).join('')}</div>`);
  };

  // entry details (a pop-up with Edit on top) and edit (Delete inside, each asks first)
  // which installment a payment went to: payments fill the oldest unpaid installment first (SPEC A6)
  function paidFor(d, i) {
    if (d.type === 'open') return 'Open balance';
    const insts = (d.installments || []).slice().sort((a, b) => a.due.localeCompare(b.due));
    const pays = (d.payments || []).map((x, k) => ({ date: x.date, amount: x.amount, k })).sort((a, b) => a.date.localeCompare(b.date) || a.k - b.k);
    let before = 0; for (const x of pays) { if (x.k === i) break; before += x.amount; }
    let cum = 0; for (let n = 0; n < insts.length; n++) { cum += insts[n].amount; if (before < cum) return `Installment ${n + 1} of ${insts.length}`; }
    return 'Late fees and charges';
  }
  SH.entry = (X, p) => {
    const d = X.byId(p.id); if (!d) return '';
    const it = itemOf(d, p.k, +p.i); if (!it) return '';
    const c = X.c(d), recv = c.effectiveDirection === 'owed';
    const sign = p.k === 'line' ? (it.delta > 0 ? '+ ' : '− ') : p.k === 'charge' ? '+ ' : '';
    const amt = Math.abs(p.k === 'line' ? it.delta : it.amount);
    // a muted arrow on its own (a tick in a square looked like a checkbox you could tick)
    const glyph = p.k === 'charge' ? 'alert' : p.k === 'wo' ? 'cminus' : (p.k === 'line' ? (it.delta > 0) !== recv : recv) ? 'in' : 'out';
    const forRow = p.k === 'pay' ? `<div class="dl"><span>For</span><span>${paidFor(d, +p.i)}</span></div>` : '';
    return dialog(`<div class="entryhead"><div style="display:flex;gap:10px;align-items:center;min-width:0"><span class="muted" style="display:inline-flex">${ic(glyph)}</span><h3 style="margin:0">${KIND[p.k]}</h3></div>${p.k === 'wo' ? '' : `<button class="editpill" data-sheet="entryedit" data-id="${d.id}" data-k="${p.k}" data-i="${p.i}">${ic('pencil')} Edit</button>`}</div>
      <div class="t30 sb num" style="margin:4px 0 4px">${sign}${U.moneyO(amt)}</div>
      <div><div class="dl"><span>Debt</span><span>${esc(d.person)} · ${esc(d.label)}</span></div>${forRow}<div class="dl"><span>When</span><span>${fdowy(it.date, X.today)}</span></div><div class="dl"><span>Added</span><span>${stamp(it)}</span></div>${it.note ? `<div class="dl"><span>Note</span><span>${esc(it.note)}</span></div>` : ''}</div>
      <button class="btn outline block" data-act="closesheet">Close</button>`);
  };
  const centsOf = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? Math.round(n * 100) : NaN; };
  // what changed in the edit form, compared with what is saved
  function editDiff(X, d, p, it) {
    const F = X.F, before = Math.abs(p.k === 'line' ? it.delta : it.amount), out = [];
    const a = F('e-amount', U.moneyNumO(before)), dt = F('e-date', it.date), nt = F('e-note', it.note || '');
    if (centsOf(a) !== before) out.push({ l: 'Amount', v: `${U.moneyO(before)} → ${isFinite(centsOf(a)) ? U.moneyO(centsOf(a)) : '—'}` });
    if (dt !== it.date) out.push({ l: 'Date', v: `${fd(it.date)} → ${dt ? fd(dt) : '—'}` });
    if (nt !== (it.note || '')) out.push({ l: 'Note', v: `${it.note ? esc(it.note) : 'none'} → ${nt ? esc(nt) : 'none'}` });
    return out;
  }
  SH.entryedit = (X, p) => {
    const d = X.byId(p.id); if (!d) return '';
    const it = itemOf(d, p.k, +p.i); if (!it) return '';
    const amt0 = Math.abs(p.k === 'line' ? it.delta : it.amount), F = X.F, changed = editDiff(X, d, p, it).length > 0;
    return sheet(`<h3>Edit ${KIND[p.k].toLowerCase()}</h3><div class="field"><label for="e-amount">Amount</label><div class="amount"><span>${sym()}</span><input id="e-amount" inputmode="decimal" value="${esc(F('e-amount', U.moneyNumO(amt0)))}"></div></div>
      ${field('e-date', 'Date', datePick('e-date', F('e-date', it.date), 'Date', X.today))}${field('e-note', 'Note (optional)', input('e-note', F('e-note', it.note || '')))}
      <button class="btn primary big block" id="editsave" data-sheet="confirmedit" data-id="${d.id}" data-k="${p.k}" data-i="${p.i}" data-oa="${amt0}" data-od="${it.date}" data-on="${esc(it.note || '')}" ${changed ? '' : 'disabled'}>Save changes</button>
      <div style="text-align:center;margin-top:12px"><button class="link dellink" data-sheet="confirmdel" data-id="${d.id}" data-k="${p.k}" data-i="${p.i}">${ic('trash')} Delete this ${KIND[p.k].toLowerCase()}</button></div>`);
  };
  SH.confirmedit = (X, p) => {
    const d = X.byId(p.id), it = itemOf(d, p.k, +p.i), rows = editDiff(X, d, p, it);
    return dialog(`<h3>Save these changes?</h3><div class="card" style="background:var(--bg)">${rows.map((r, i) => `<div class="dl" style="${i ? '' : 'border:0;padding-top:0;'}${i === rows.length - 1 ? 'padding-bottom:0' : ''}"><span>${r.l}</span><span class="num">${r.v}</span></div>`).join('')}</div>
      <div class="btns"><button class="btn outline" data-act="closesheet">Cancel</button><button class="btn primary" data-act="saveentry" data-id="${d.id}" data-k="${p.k}" data-i="${p.i}">Save it</button></div>`);
  };
  SH.confirmdel = (X, p) => {
    const d = X.byId(p.id), it = itemOf(d, p.k, +p.i), amt = Math.abs(p.k === 'line' ? it.delta : it.amount);
    return confirmBox(`Delete this ${KIND[p.k].toLowerCase()}?`, `<div class="card" style="background:var(--bg)"><div class="kv"><div><div class="sb">${esc(d.person)}</div><div class="t13 muted">${fd(it.date)}</div></div><div class="sb num">${U.moneyO(amt)}</div></div></div><p class="muted t13" style="margin:0">It is removed from all your phones. The balance is worked out again without it.</p>`, 'Delete', 'delentry', `data-id="${d.id}" data-k="${p.k}" data-i="${p.i}"`, true);
  };

  // confirmations for the rest (Gastos: check before it happens)
  SH.settle = (X, p) => {
    const d = X.byId(p.id), c = X.c(d), left = d.type === 'tab' ? Math.abs(c.balance) : c.remaining;
    return dialog(`<h3>Mark as settled?</h3><div class="card" style="background:var(--bg)"><div class="sb">${esc(d.person)} · ${esc(d.label)}</div></div>${left > 0 ? `<p class="muted" style="margin:0">${U.moneyO(left)} is still left. Write it off as a discount or forgiven amount? It is kept as its own line, so the history stays true.</p>
      <div class="kv"><span class="muted">Written off</span><span class="num sb t20">${U.moneyO(left)}</span></div>` : `<p class="muted" style="margin:0">Nothing is left to pay. This moves it to Settled.</p>`}
      <button class="btn primary big block" data-act="settle" data-id="${d.id}">${left > 0 ? 'Write off and settle' : 'Settle'}</button><button class="btn outline block" data-act="closesheet">Cancel</button>`);
  };
  SH.signout = () => confirmBox('Sign out of Patas?', '<p class="muted" style="margin:0">Anything not synced yet stays on this phone and uploads next time you sign in.</p>', 'Sign out', 'signout', '', false);
  SH.rename = (X, p) => sheet(`<h3>Rename</h3>${field('f-rename', 'Name', input('f-rename', X.F('f-rename', p.name), 'autocomplete="off"'))}<button class="btn primary big block" data-sheet="confirmrename" data-name="${esc(p.name)}">Save</button>`);
  SH.confirmrename = (X, p) => {
    const n = X.db.debts.filter((d) => d.person === p.name).length, nu = (X.F('f-rename', p.name) || '').trim();
    return confirmBox(`Rename ${esc(p.name)}?`, `<div class="card" style="background:var(--bg)"><div class="sb">${esc(p.name)} → ${esc(nu)}</div><div class="t13 muted">Changes ${plural(n, 'debt')}. Old history keeps working under the new name.</div></div>`, 'Rename', 'dorename', `data-name="${esc(p.name)}"`, false);
  };
  SH.personmenu = (X, p) => U.menuSheet(esc(p.name), [U.menuRow('pencil', 'Rename', `data-sheet="rename" data-name="${esc(p.name)}"`)]);
  SH.qredit = (X, p) => {
    const v = X.db.vault.find((q) => q.id === p.id), F = X.F;
    return sheet(`<h3>Edit QR details</h3>${field('qe-label', 'Label', input('qe-label', F('qe-label', v.label)))}
      ${field('qe-wallet', 'Wallet', `<div class="seg3" id="qe-wallet" style="flex-wrap:wrap">${['GCash', 'Maya', 'GoTyme', 'Bank', 'Other'].map((w) => `<button data-seg="qe-wallet" data-v="${w}" class="${F('qe-wallet', v.wallet) === w ? 'on' : ''}" style="flex:1 1 28%">${w}</button>`).join('')}</div>`)}
      ${field('qe-account', 'Account name', input('qe-account', F('qe-account', v.account)), 'Names only. Patas never stores account numbers in its own fields.')}<button class="btn primary big block" data-act="saveqredit" data-id="${v.id}">Save</button>`);
  };
  SH.confirmqrdel = (X, p) => { const v = X.db.vault.find((q) => q.id === p.id); return confirmBox(`Remove ${esc(v.label)}?`, `<p class="muted" style="margin:0">The QR is deleted from your vault. Debts linked to it keep their history.</p>`, 'Remove', 'delqr', `data-id="${v.id}"`, true); };
  SH.qrmenu = (X, p) => U.menuSheet('QR options', [U.menuRow('pencil', 'Edit label and name', `data-sheet="qredit" data-id="${p.id}"`), U.menuRow('refresh', 'Replace the QR image', `data-act="replaceqr" data-id="${p.id}"`), U.menuRow('trash', 'Remove from vault', `data-sheet="confirmqrdel" data-id="${p.id}"`, true)]);

  SH.themepick = (X) => {
    const mode = X.mode, cur = X.S.theme;
    return sheet(`<h3>Color theme</h3><p class="muted" style="margin:0">Pick the color you like. Light and dark both follow it, on every phone you sign in on.</p>
      <div class="themes" role="radiogroup">${TH.ORDER.map((k) => {
        const t = TH.tokens(k, mode), on = k === cur;
        return `<button class="theme ${on ? 'on' : ''}" data-act="settheme" data-v="${k}" role="radio" aria-checked="${on}" aria-label="${esc(TH.THEMES[k].name)}" style="--accent:${t['--accent']}"><div class="mini" style="background:${t['--bg']};--tglass:${t['--glass']}"><div class="m"><b style="width:90px;height:70px;left:-24px;top:-26px;background:${t['--mesh1']}"></b><b style="width:80px;height:60px;right:-14px;bottom:-24px;background:${t['--mesh2']}"></b><b style="width:50px;height:40px;right:12px;top:-16px;background:${t['--mesh3']};opacity:.8"></b></div><span class="t15 sb num" style="color:${t['--text']}">${money(748500)}</span><div class="acbar" style="background:${t['--border']}"><i style="background:${t['--accent']}"></i></div></div><div class="nm" style="color:${t['--text']}">${esc(TH.THEMES[k].name)}</div>${on ? `<span class="tk" style="background:${t['--accent-fill']};color:#fff">${ic('check')}</span>` : ''}</button>`;
      }).join('')}</div>`);
  };
  SH.currency = (X) => {
    const cur = U.curInfo(), off = X.S.cond === 'offline';
    const rows = (list) => list.map((c) => `<button class="row ${off ? 'off' : ''}" ${off ? 'disabled' : ''} data-act="setcur" data-v="${c.code}" data-q="${(c.code + ' ' + c.name).toLowerCase()}"><div class="grow"><div class="md">${c.code} <span class="muted">· ${c.name}</span></div></div><b>${c.sym.trim()}</b>${c.code === cur.code ? `<span style="color:var(--accent)">${ic('check')}</span>` : ''}</button>`).join('');
    const top = U.CURRENCIES.filter((c) => c.top), rest = U.CURRENCIES.filter((c) => !c.top);
    return sheet(`<h3>Currency</h3><p class="muted" style="margin:0">Every amount is shown in the currency you pick, at today's rate. Your original amounts are always kept, so switching back is exact. <span class="t12">(Sample rates in this mockup.)</span></p>
      ${off ? `<div class="plainnote">${ic('info')}<span>Needs internet to change.</span></div>` : ''}
      <div class="searchbox">${ic('search')}<input id="cq" placeholder="Search currencies" aria-label="Search currencies"></div>
      <div class="list" id="curlist">${rows(top)}${rows(rest)}</div>`);
  };

  const FAQ = [
    ['Where are my debts saved?', 'On this phone first, so Patas works with no signal. When you are signed in they also back up to your account and show on your other phones.'],
    ['How safe is my data?', 'Each account can only see its own debts: the database itself enforces that, not just the app. Sign-in uses a one-time code sent to your email, so there is no password to leak. QR images are stored privately and are never put in a web link. The app lock keeps casual eyes out; keep your phone\'s own screen lock on too.'],
    ['Is there a backup?', 'Yes, two kinds. Sign in and everything backs up to your account by itself. You can also save a backup file from Settings, and bring it back with Restore. "Add what\'s missing" only adds; it never overwrites newer entries.'],
    ['What does "3 waiting" mean?', 'Those entries are saved on this phone but have not reached your account yet, usually because you are offline. They upload by themselves when you are back online.'],
    ['Can I use Patas with no internet?', 'Yes. It opens, logs and shows your QR codes with no signal, and syncs later. Only changing the currency and sending feedback need the internet.'],
    ['How do I log a payment?', 'On the Log tab, tap the debt you paid. The amount fills in with what is due. Change it if you paid less, then tap Save.'],
    ['How do I edit or delete a payment?', 'Open the debt, tap the line in its history, then tap Edit at the top. From there you can change it or delete it. Just looking never changes anything.'],
    ['Why did my QR show a warning?', 'If a saved QR was replaced in the last 14 days, Patas tells you, because a swapped QR is the main way money goes to the wrong person. Check the account name before you pay.'],
    ['Will I get reminders?', 'Yes, the day before and the day of a due date, at 8:00 AM. On an iPhone, add Patas to your Home Screen first. Reminders can be turned off in Settings.'],
    ['How do I change the color or the currency?', 'Settings, then Color theme or Currency. The whole app follows your choice. Currency shows your amounts at today\'s rate; the original amounts are always kept.'],
    ['How do I install Patas on my phone?', 'Android: open Patas in Chrome and choose Add to Home screen. iPhone: open it in Safari, tap Share, then Add to Home Screen.'],
  ];
  SH.faq = () => sheet(`<h3>FAQ</h3><p class="muted" style="margin:0">Quick answers about Patas.</p>
    <div class="searchbox">${ic('search')}<input id="fq" placeholder="Search questions" aria-label="Search questions"></div>
    <div class="list" id="faqlist">${FAQ.map(([q, a], i) => `<div data-q="${esc((q + ' ' + a).toLowerCase())}"><button class="faq-q ${i === 0 ? 'open' : ''}" data-act="faqtoggle" aria-expanded="${i === 0}"><span style="flex:1">${esc(q)}</span>${ic(i === 0 ? 'up' : 'down')}</button><div class="faq-a" ${i === 0 ? '' : 'hidden'}>${esc(a)}</div></div>`).join('')}</div>
    <p class="muted t13" id="faqnone" hidden style="margin:0">No question matches. Try another word, or send feedback.</p>
    <button class="btn outline block" data-sheet="feedback">Still stuck? Send feedback</button>`);
  SH.feedback = (X) => {
    const sent = X.S.form.fbSent, off = X.S.cond === 'offline';
    if (sent) return sheet(`<h3>Sent. Thank you!</h3><p class="muted" style="margin:0">It went straight to the person who makes Patas.</p><div style="text-align:center;color:var(--accent)"><svg class="i" viewBox="0 0 24 24" style="width:48px;height:48px">${'<path d="M20 6 9 17l-5-5"/>'}</svg></div><button class="btn primary big block" data-act="closesheet">Done</button>`);
    return sheet(`<h3>Send feedback</h3><p class="muted" style="margin:0">Goes straight to the person who makes Patas. Every message gets read.</p>
      ${off ? `<div class="banner">${ic('info')}<span>Needs internet to send. Your words stay here until you are online.</span></div>` : ''}
      <div class="field"><label for="f-fb">What's on your mind?</label><textarea id="f-fb" maxlength="1000" placeholder="Something broke, something is confusing, or an idea.">${esc(X.F('f-fb', ''))}</textarea><div class="hint num" id="fbcount">${(X.F('f-fb', '') || '').length} / 1000</div></div>
      <button class="btn primary big block" id="fbsend" data-act="sendfb" ${off || !(X.F('f-fb', '') || '').trim() ? 'disabled' : ''}>Send</button>`);
  };

  const prev = SC.sheet;
  SC.sheet = (X, name, p) => (SH[name] ? SH[name](X, p || {}) : prev(X, name, p));
  root.PatasScreens = Object.assign(SC, S3);
})(window);
