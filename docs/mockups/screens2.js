/* Patas mockups: forms, People, Settled, Pay vault, Show QR, Settings, Share summary, Import, sheets. Fake data only.
   Show QR save-or-share strings are Kenshin's, from his ruling of 2026-10-02 (S1 to S15).
   Revised after Erina's review of the rendered screens (2026-10-02). */
(function (root) {
  const U = root.PatasUI, E = root.PatasEngine;
  const { ic, money, menuRow, menuSheet, fd, fdy, fdow, plural, esc, subHdr, homeHdr, field, input, seg3, sheet, dialog, skelBlock, errorCard, qrSvg, bar6, frac, datePick } = U;
  const { debtRow, typeDesc, TYPE } = root.PatasScreens._shared;
  const S2 = {};
  const dlong = (iso) => { const d = new Date(iso + 'T00:00:00Z'); return `${d.getUTCDate()} ${U.MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  const amt = (c) => (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ---------- Add / edit debt ----------
  S2.debtAdd = (X, id) => {
    const edit = id ? X.byId(id) : null, F = X.F;
    const dir = F('f-dir', edit ? edit.direction : 'owe'), type = F('f-type', edit ? edit.type : 'fixed');
    const people = [...new Set(X.db.debts.map((d) => d.person))].slice(0, 4);
    const typeFields = {
      fixed: `${field('f-amount', 'Amount each time', `<div class="amount"><span>${U.sym()}</span><input id="f-amount" inputmode="decimal" value="${esc(F('f-amount', '1,247.50'))}"></div>`)}
        <div class="btns">${field('f-count', 'How many', input('f-count', F('f-count', '10'), 'inputmode="numeric"'))}${field('f-start', 'First due date', datePick('f-start', F('f-start', '2026-11-04'), 'First due date', X.today))}</div>
        <p class="muted t13" id="prev" style="margin:0">Patas makes the installments for you, one a month on the same day.</p>`,
      uneven: `${field('f-lines', 'Due dates and amounts', `<textarea id="f-lines" placeholder="One per line: date, amount">${esc(F('f-lines', '2026-11-08, 980.00\n2026-12-08, 980.00\n2027-01-08, 640.50'))}</textarea>`, 'One per line: date, amount. You can paste from a note or a spreadsheet.')}`,
      open: `${field('f-amount', 'Total owed', `<div class="amount"><span>${U.sym()}</span><input id="f-amount" inputmode="decimal" value="${esc(F('f-amount', '8,200.00'))}"></div>`)}
        ${field('f-start', 'Pay by (optional)', datePick('f-start', F('f-start', ''), 'Pay by date', X.today, true), 'Leave empty if there is no date. You can pay any amount, any time.')}`,
      tab: `<div class="banner">${ic('info')}<span>A tab starts at ₱0.00. After saving, add lines: "+ added" when something is borrowed, "− paid" when something is paid back.</span></div>`,
    }[type];
    return `<div class="screen">${subHdr(edit ? 'Edit debt' : 'Add a debt')}<div class="stack">
      ${field('f-dir', 'Who owes whom', seg3('f-dir', [['owe', `${ic('out')} I owe`], ['owed', `${ic('in')} Owed to me`]], dir))}
      ${field('f-person', 'Person or company', input('f-person', F('f-person', edit ? edit.person : ''), 'placeholder="Name"'))}
      ${people.length ? `<div class="btns" style="flex-wrap:wrap;margin-top:-4px">${people.map((p) => `<button class="btn outline" style="min-height:44px;flex:none;font-weight:500" data-fill="f-person" data-v="${esc(p)}">${esc(p)}</button>`).join('')}</div>` : ''}
      ${field('f-label', 'What is it for?', input('f-label', F('f-label', edit ? edit.label : ''), 'placeholder="Phone, tuition, groceries…"'))}
      ${edit ? '' : field('f-type', 'Type', `<div class="seg3" id="f-type" style="flex-wrap:wrap">${[['fixed', 'Fixed plan'], ['uneven', 'Uneven plan'], ['open', 'Open balance'], ['tab', 'Tab']].map(([k, l]) => `<button data-seg="f-type" data-v="${k}" class="${k === type ? 'on' : ''}" aria-pressed="${k === type}" style="flex:1 1 40%">${l}</button>`).join('')}</div>`)}
      ${edit ? '' : typeFields}
      ${field('f-notes', 'Notes (optional)', `<textarea id="f-notes" style="min-height:72px">${esc(F('f-notes', edit ? edit.notes || '' : ''))}</textarea>`)}
      <button class="btn primary big block" data-act="savedebt" ${edit ? `data-id="${edit.id}"` : ''}>${edit ? 'Save changes' : 'Save debt'}</button></div></div>`;
  };

  // ---------- Add a charge (payments are logged on the Log tab now) ----------
  S2.charge = (X, id) => {
    const d = X.byId(id), F = X.F;
    return `<div class="screen">${subHdr('Add a charge')}<div class="stack">
      <div class="card"><div class="sb ell">${esc(d.person)} · ${esc(d.label)}</div><div class="t13 muted">Only add what the lender actually charged. Patas does not work out fees by itself.</div></div>
      ${field('f-ckind', 'What kind?', seg3('f-ckind', [['Late fee', 'Late fee'], ['Penalty', 'Penalty'], ['Interest', 'Interest']], F('f-ckind', 'Late fee')))}
      <div class="field"><label for="f-camount">Amount</label><div class="amount"><span>${U.sym()}</span><input id="f-camount" inputmode="decimal" value="${esc(F('f-camount', '100.00'))}"></div></div>
      ${field('f-cdate', 'Date charged', datePick('f-cdate', F('f-cdate', X.today), 'Date charged', X.today))}
      ${field('f-cnote', 'Note (optional)', input('f-cnote', F('f-cnote', '')))}
      <button class="btn primary big block" data-act="savecharge" data-id="${d.id}">Add charge</button></div></div>`;
  };

  // ---------- People: two grouped cards in a fixed order, each figure led by its arrow ----------
  function personTotals(X) {
    const m = {};
    X.db.debts.filter((d) => !d.settledOn).forEach((d) => {
      const c = X.c(d); const p = (m[d.person] = m[d.person] || { name: d.person, owe: 0, owed: 0, nOwe: 0, nOwed: 0 });
      p[c.effectiveDirection] += c.remaining; p[c.effectiveDirection === 'owe' ? 'nOwe' : 'nOwed']++;
    });
    return Object.values(m).sort((a, b) => a.name.localeCompare(b.name));
  }
  S2.people = (X) => {
    if (X.S.cond === 'loading') return `<div class="screen hasnav">${homeHdr('People', 'loading')}<div class="stack">${skelBlock(64)}${skelBlock(64)}${skelBlock(64)}</div></div>`;
    if (X.S.cond === 'error') return `<div class="screen hasnav">${homeHdr('People', 'error')}${errorCard('your people')}</div>`;
    const ps = personTotals(X), owe = ps.filter((p) => p.nOwe), owed = ps.filter((p) => p.nOwed);
    const grp = (title, glyph, list, key, n) => list.length ? `<div class="grouphead"><h2>${ic(glyph)} ${title} (${list.length})</h2></div><div class="list">${list.map((p) => `<button class="row" data-go="person" data-name="${esc(p.name)}"><div class="grow"><div class="sb ell">${esc(p.name)}</div><div class="t12 muted">${plural(p[n], 'debt')}</div></div><div class="sb num">${money(p[key])}</div>${ic('right')}</button>`).join('')}</div>` : '';
    const body = ps.length ? grp('I owe', 'out', owe, 'owe', 'nOwe') + grp('Owed to me', 'in', owed, 'owed', 'nOwed')
      : `<div class="empty"><h2>No one yet</h2><p>People show up here when you add a debt with them.</p><button class="btn primary" data-go="debtAdd">${ic('plus')} Add a debt</button></div>`;
    return `<div class="screen hasnav">${homeHdr('People', X.S.cond)}${U.curNote()}${body}</div>`;
  };
  S2.person = (X, name) => {
    const ds = X.db.debts.filter((d) => d.person === name && !d.settledOn);
    const tot = { owe: 0, owed: 0 }; ds.forEach((d) => { const c = X.c(d); tot[c.effectiveDirection] += c.remaining; });
    return `<div class="screen">${subHdr(name, `<button class="iconbtn r" data-sheet="personmenu" data-name="${esc(name)}" aria-label="More options for ${esc(name)}">${ic('more')}</button>`)}<div class="stack">
      <div class="card"><div class="dir">${ic('out')} I owe</div><div class="t20 sb num" style="margin-top:4px">${money(tot.owe)}</div></div>
      <div class="card"><div class="dir">${ic('in')} Owed to me</div><div class="t20 sb num" style="margin-top:4px">${money(tot.owed)}</div></div></div>
      <div class="grouphead"><h2>Debts</h2></div><div class="list">${ds.map((d) => debtRow(X, d)).join('') || '<div class="row static muted">No open debts.</div>'}</div></div>`;
  };

  // (The Settled list is now a filter inside the List tab.)

  // ---------- Pay vault ----------
  S2.vault = (X) => {
    if (X.S.cond === 'loading') return `<div class="screen hasnav">${homeHdr('Pay vault', 'loading')}<div class="stack">${skelBlock(64)}${skelBlock(64)}</div></div>`;
    if (X.S.cond === 'error') return `<div class="screen hasnav">${homeHdr('Pay vault', 'error')}${errorCard('your QR codes')}</div>`;
    const items = X.db.vault;
    const body = items.length ? `<div class="list">${items.map((v) => {
      const link = v.link ? X.byId(v.link) : null, recent = v.changedOn && E.diffDays(X.today, v.changedOn) <= 14;
      const off = X.S.cond === 'offline' && !v.cached;
      return `<button class="row" data-go="showQr" data-id="${v.id}"><div class="grow"><div class="sb ell">${esc(v.label)}</div><div class="t13 muted ell">${v.wallet} · ${esc(v.account)}</div>
        ${recent ? `<div class="quiet" style="margin-top:2px;color:var(--due)">${ic('shield')}QR changed ${fd(v.changedOn)}</div>` : link ? `<div class="t12 muted ell" style="margin-top:2px">For ${esc(link.person)}</div>` : ''}${off ? `<div class="quiet" style="margin-top:2px">Not on this phone yet</div>` : ''}</div>${ic('right')}</button>`;
    }).join('')}</div>` : `<div class="empty"><h2>No QR codes yet</h2><p>Save the QR you pay with. When a payment is due, it's one tap away.</p><button class="btn primary" data-go="qrAdd">${ic('plus')} Add a QR</button></div>`;
    return `<div class="screen hasnav">${homeHdr('Pay vault', X.S.cond)}${X.S.cond === 'offline' ? `<div class="banner" style="margin-bottom:12px">${ic('info')}<span>You're offline. QR codes you opened before still show.</span></div>` : ''}${items.length ? `<div class="grouphead" style="margin-top:0"><h2>${plural(items.length, 'code')}</h2><button class="link" data-go="qrAdd">${ic('plus')} Add</button></div>` : ''}${body}</div>`;
  };

  S2.showQr = (X, id, from, block) => {
    const v = X.db.vault.find((q) => q.id === id), d = from ? X.byId(from) : null;
    if (!v) return `<div class="screen">${subHdr('QR')}<div class="empty"><h2>QR not found</h2></div></div>`;
    const c = d ? X.c(d) : null, nx = c && c.next, due = nx && c.effectiveDirection === 'owe' ? nx : null;
    const recent = v.changedOn && E.diffDays(X.today, v.changedOn) <= 14;
    const offUncached = X.S.cond === 'offline' && !v.cached;
    const stale = v.savedCopyOn && recent && v.savedCopyOn < v.changedOn;
    const blocked = block || (offUncached ? 'offline' : '');
    const banner = stale ? `<div class="banner warn">${ic('shield')}<span>QR changed on ${dlong(v.changedOn)}. You saved a copy of the old QR on ${dlong(v.savedCopyOn)}. Delete it so you don't pay from it by mistake.</span></div>`
      : recent ? `<div class="banner warn">${ic('shield')}<span>QR changed on ${dlong(v.changedOn)}. Check the account name below before you pay.</span></div>` : '';
    const mismatch = block === 'nomatch' ? `<div class="banner">${ic('alert')}<span>This QR does not match what you saved. Saving a copy is turned off.</span></div>` : '';
    const body = offUncached
      ? `<div class="empty" style="min-height:300px"><h2>Waiting for a connection</h2><p>This code will appear once the phone is online again.</p></div>`
      : `<div class="qrframe">${qrSvg(v.id + v.account)}</div>`;
    const reasons = { nomatch: 'This QR does not match what you saved. Saving a copy is turned off.', offline: 'Open this QR once while online to save a copy.' };
    const saveShare = blocked
      ? `<div style="text-align:center"><button class="btn outline" disabled>${ic('share')} Save or share</button>${blocked === 'offline' ? `<div class="t12" style="color:#5A6170;margin-top:6px">${reasons.offline}</div>` : ''}</div>`
      : `<div style="text-align:center"><button class="link" data-sheet="qrshare" data-id="${v.id}" data-state="${recent ? 'changed' : 'ready'}" style="color:#161A22">${ic('share')}&nbsp;Save or share</button>${v.savedCopyOn && !stale ? `<div class="t12" style="color:#5A6170">You saved a copy on ${dlong(v.savedCopyOn)}. Delete it after you pay.</div>` : ''}</div>`;
    return `<div class="qrscreen" data-mode="light"><div class="hdr sub" style="background:#fff;height:56px;margin:0 -16px;padding:0 16px"><button class="iconbtn" data-act="back" aria-label="Close">${ic('x')}</button>
        <h1 style="text-align:center;font-size:15px;font-weight:600;display:flex;gap:6px;align-items:center;justify-content:center">${ic(v.kind === 'bank' ? 'bank' : 'wallet')} ${v.wallet}</h1><button class="iconbtn r" data-sheet="qrmenu" data-id="${v.id}" aria-label="More">${ic('more')}</button></div>
      <div class="stack" style="gap:12px;padding-top:4px">${banner}${mismatch}${body}
        ${offUncached ? '' : `<div style="text-align:center"><div class="t12" style="color:#5A6170">Account name</div><div class="qrname">${esc(v.account)}</div></div>
        <div class="btns" style="justify-content:center"><button class="btn outline" data-act="copy" style="flex:0 1 200px">${ic('copy')} Copy name</button></div>`}
        ${due && !offUncached ? `<div class="card" style="border-color:#DEDFE2"><div class="kv" style="align-items:center"><div><div class="t12 muted">Amount to pay</div><div class="sb num t20">${U.moneyO(due.short)}</div><div class="t12 muted">due ${fd(due.due)}</div></div><button class="btn outline" data-act="copy">${ic('copy')} Copy</button></div></div>` : ''}
        ${saveShare}</div>
      <div style="flex:1;min-height:12px"></div>
      <div style="padding-top:12px"><button class="btn primary big block" ${d ? `data-act="logfor" data-id="${d.id}"` : 'data-act="back"'}>${d && c.effectiveDirection === 'owed' ? 'Got paid? Record it' : 'Paid? Record it'}</button></div></div>`;
  };

  // S14: the picture that leaves the app. Margin of 4+ squares on every side; the caption sits below that margin.
  S2.qrExport = (X) => {
    const v = X.db.vault[0] || { id: 'v1', account: 'X' };
    return `<div class="screen">${subHdr('What the saved copy looks like')}<div class="stack">
      <div class="card" id="export" style="background:#fff;border-color:#DEDFE2;padding:26px"><div id="exportqr" style="width:100%;aspect-ratio:1;max-width:260px;margin:0 auto">${qrSvg(v.id + v.account)}</div>
        <div id="exportcap" class="t12" style="text-align:center;margin-top:33px;color:#5A6170">Copy from Patas · ${dlong(X.today)}</div></div>
      <div class="banner">${ic('info')}<span>Solid white, a clear margin of at least 4 squares on every side, and a small caption with the app name and date below that margin. No label, no amount, no account name. File name: <b class="num">qr-2026-10-02-k7m2.png</b>, with no payee or wallet in it.</span></div>
      <div class="banner">${ic('shield')}<span>Before offering the file, Patas reads it back and checks it matches the stored code. If it doesn't, nothing is offered.</span></div></div></div>`;
  };

  S2.qrAdd = (X) => {
    const F = X.F, picked = F('qr-picked', '') === '1';
    return `<div class="screen">${subHdr('Add a QR')}<div class="stack">
      ${picked ? `<div class="card" style="text-align:center"><div style="width:160px;margin:0 auto">${qrSvg('new-sample')}</div><button class="link" data-fill="qr-picked" data-v="" style="margin:0 auto">Choose another photo</button></div>
        <div class="banner">${ic('info')}<span>We read the account name from the code: <b>ANA M. REYES</b>. Check that it is the person or company you mean to pay.</span></div>`
        : `<button class="card" data-fill="qr-picked" data-v="1" style="border-style:dashed;min-height:180px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;width:100%;text-align:center">${ic('image')}<span class="sb">Choose a photo of the QR</span><span class="t13 muted">Screenshots from your wallet app work well.</span></button>`}
      ${field('qr-label', 'Label', input('qr-label', F('qr-label', picked ? 'My Maya' : ''), 'placeholder="Who is this for?"'))}
      ${field('qr-wallet', 'Wallet', `<div class="seg3" id="qr-wallet" style="flex-wrap:wrap">${['GCash', 'Maya', 'GoTyme', 'Bank', 'Other'].map((w) => `<button data-seg="qr-wallet" data-v="${w}" class="${F('qr-wallet', 'Maya') === w ? 'on' : ''}" style="flex:1 1 28%">${w}</button>`).join('')}</div>`)}
      ${field('qr-account', 'Account name', input('qr-account', F('qr-account', picked ? 'ANA M. REYES' : ''), 'placeholder="Name shown on the code"'), 'Names only. Patas never stores account numbers in its own fields.')}
      ${field('qr-link', 'Link to (optional)', `<button class="picker" id="qr-link" data-sheet="linkpick">${esc(F('qr-link-lbl', 'No link'))}${ic('right')}</button>`)}
      <button class="btn primary big block" data-act="saveqr">Save to vault</button></div></div>`;
  };

  // (Settings moved to screens3.js, Gastos-style.)

  // ---------- Share summary ----------
  S2.shareSummary = (X, id) => {
    const d = X.byId(id), c = X.c(d);
    return `<div class="screen">${subHdr('Share summary')}<div class="stack">
      <div class="card stack" style="gap:10px;padding:20px"><div class="tag">Patas</div><div class="t20 sb wrap2">${esc(d.person)} · ${esc(d.label)}</div>
        <div class="num t13">${money(c.total)} · paid ${money(c.paid)} · <b>${money(c.remaining)} left</b></div>${c.type === 'tab' ? '' : bar6(frac(c))}
        <div class="t12 muted">${typeDesc(d, c)}${c.next ? ` · next ${fd(c.next.due)}` : ''}</div></div>
      <div class="btns"><button class="btn primary" data-toast="Summary image ready to share">${ic('share')} Share image</button><button class="btn outline" data-toast="Summary text copied">${ic('copy')} Copy as text</button></div>
      <div class="plainnote">${ic('info')}<span>The summary never includes a QR code or an account name.</span></div></div></div>`;
  };

  // ---------- Import (owner tool). Example numbers are invented. ----------
  S2.importTool = (X) => `<div class="screen">${subHdr('Import from spreadsheet')}<div class="stack">
      <div class="banner">${ic('lock')}<span>Reads your spreadsheet and never changes it. Nothing is saved until you tap Import. <b>Example data only.</b></span></div>
      <div class="grouphead" style="margin:4px 0 0"><h2>What we found</h2></div>
      <div class="list">${[['Family tab', '24 lines', '₱18,420.00'], ['Phone plan tab', '10 lines', '₱6,310.50'], ['Shopping tab', '7 lines', '₱4,205.25']].map(([a, b, c]) => `<div class="row static"><div class="grow"><div class="sb">${a}</div><div class="t12 muted">${b} · ${c}</div></div><span class="quiet ok">${ic('check')}Matches</span></div>`).join('')}</div>
      <div class="card"><div class="kv"><span class="sb">Opening adjustments</span><span class="num">2</span></div><div class="t13 muted" style="margin-top:4px">Numbers that were hidden inside formulas. They come over as labelled lines so totals match.</div></div>
      <div class="grouphead" style="margin:4px 0 0"><h2>Needs your answer (3)</h2></div>
      <div class="list">${['A loan from 2019 with nothing paid. Still owed?', 'Six payments, no total recorded. Open balance or tab?', 'A monthly amount with no start date. When did it begin?'].map((t) => `<div class="row static"><div class="grow t13">${t}</div><span class="pill dot">Answer</span></div>`).join('')}</div>
      <button class="btn primary big block" aria-disabled="true">Answer 3 items to import</button></div></div>`;

  // ---------- Sheets ----------
  S2.sheet = (X, name, p) => {
    const d = p.id ? X.byId(p.id) : null;
    if (name === 'tabline') {
      const c = X.c(d), add = p.kind === 'add', dir = c.effectiveDirection;
      const title = add ? (dir === 'owe' ? 'Add: I borrowed' : 'Add: I lent') : (dir === 'owe' ? 'I paid back' : 'They paid back');
      return sheet(`<h3>${title}</h3><div class="amount"><span>₱</span><input id="f-tamount" inputmode="decimal" placeholder="0.00" aria-label="Amount"></div>
        ${field('f-tnote', 'Note (optional)', input('f-tnote', '', 'placeholder="e.g. lunch"'))}
        <button class="btn primary big block" data-act="savetab" data-id="${d.id}" data-kind="${p.kind}">Save</button><button class="btn outline block" data-act="closesheet">Cancel</button>`);
    }
    if (name === 'settle') {
      const c = X.c(d), left = d.type === 'tab' ? Math.abs(c.balance) : c.remaining;
      return sheet(`<h3>Mark as settled?</h3>${left > 0 ? `<p class="muted" style="margin:0">${money(left)} is still left. Write it off as a discount or forgiven amount? It is kept as its own line, so the history stays true.</p>
        <div class="kv"><span class="muted">Written off</span><span class="num sb t20">${money(left)}</span></div><button class="btn primary big block" data-act="settle" data-id="${d.id}">Write off and settle</button>` : `<p class="muted" style="margin:0">Nothing is left to pay. This moves it to Settled.</p><button class="btn primary big block" data-act="settle" data-id="${d.id}">Settle</button>`}<button class="btn outline block" data-act="closesheet">Cancel</button>`);
    }
    if (name === 'debtmenu') {
      return menuSheet(`${esc(d.person)} · ${esc(d.label)}`, [
        menuRow('pencil', 'Edit', `data-go="debtAdd" data-id="${d.id}"`),
        menuRow('share', 'Share summary', `data-go="shareSummary" data-id="${d.id}"`),
        d.settledOn ? menuRow('refresh', 'Reopen this debt', `data-act="reopen" data-id="${d.id}"`) : '',
        menuRow('trash', 'Delete', `data-sheet="deldebt" data-id="${d.id}"`, true)]);
    }
    if (name === 'deldebt') return dialog(`<h3>Delete this debt?</h3><div class="card t13"><div class="sb">${esc(d.person)} · ${esc(d.label)}</div><div class="muted">${plural((d.payments || d.lines || []).length, 'entry')} will be removed.</div></div><p class="muted t13" style="margin:0">Use Settle to close a debt you've finished. Delete is for mistakes. You can undo for a short while.</p><button class="btn danger block big" data-act="deldebt" data-id="${d.id}">Delete</button><button class="btn outline block" data-act="closesheet">Cancel</button>`);
    if (name === 'delaccount') {
      const n = { d: X.db.debts.length, q: X.db.vault.length, p: new Set(X.db.debts.map((x) => x.person)).size };
      return dialog(`<h3>Delete your account?</h3><p class="muted" style="margin:0">This removes all your people, debts, payments and QR codes from Patas. It can't be undone.</p><div class="card t13 num">${plural(n.d, 'debt')} · ${plural(n.p, 'person')} · ${plural(n.q, 'QR code')}</div><p class="muted t13" style="margin:0">Copies of QR images you saved or shared stay where you put them.</p><button class="btn danger block big" data-toast="Account deleted (mockup)">Delete everything</button><button class="btn outline block" data-act="closesheet">Cancel</button>`);
    }
    if (name === 'qrmenu') return sheet(`<h3>QR options</h3><button class="btn outline block" data-toast="Edit is a mockup">Edit label and name</button><button class="btn outline block" data-toast="Replace is a mockup">Replace the QR image</button><button class="btn outline block" style="color:var(--danger);border-color:var(--danger)" data-toast="Delete is a mockup">${ic('trash')} Delete from vault</button><button class="btn ghost block" data-act="closesheet">Close</button>`);
    if (name === 'linkpick') {
      const act = X.db.debts.filter((x) => !x.settledOn);
      return sheet(`<h3>Link this QR to</h3><div class="list"><button class="row" data-act="pickLink" data-v="" data-l="No link">No link</button>${act.map((x) => `<button class="row" data-act="pickLink" data-v="${x.id}" data-l="${esc(x.person)} · ${esc(x.label)}"><div class="grow"><div class="sb ell">${esc(x.person)}</div><div class="t13 muted ell">${esc(x.label)}</div></div></button>`).join('')}</div>`);
    }
    if (name === 'qrshare') {
      const v = X.db.vault.find((q) => q.id === p.id), st = p.state || 'ready';
      const iphone = X.S.device === 'iphone', recent = v.changedOn && E.diffDays(X.today, v.changedOn) <= 14;
      const person = v.link ? X.byId(v.link).person : v.label;
      const warn = `<p style="margin:0">This copy leaves Patas: your MPIN won't lock it, signing out won't delete it, and your photo backup may upload it.</p>`;
      const preview = `<div style="width:140px;margin:0 auto;background:#fff;border:1px solid var(--border);border-radius:12px;padding:12px">${qrSvg(v.id + v.account)}<div style="font-size:8px;line-height:10px;white-space:nowrap;color:#5A6170;text-align:center;margin-top:10px">Copy from Patas · ${dlong(X.today)}</div></div>`;
      const dis = st === 'building' || st === 'makefail' || st === 'nobrowser' ? 'disabled' : '';
      let status = '';
      if (st === 'building') status = `<div class="quiet" style="font-size:13px;justify-content:center">Preparing copy…</div>`;
      if (st === 'nobrowser') status = `<div class="banner">${ic('info')}<span>This browser can't save the QR. You can take a screenshot instead.</span></div>`;
      if (st === 'makefail') status = `<div class="banner">${ic('alert')}<span>Couldn't make a safe copy of this QR. Nothing was saved.</span></div>`;
      if (st === 'sharefail') status = `<div class="banner">${ic('alert')}<span>Couldn't open sharing. Try again.${iphone ? '' : ' Or use Save to phone.'}</span></div>`;
      const changed = (st === 'changed' || (recent && st === 'ready')) ? `<div class="banner warn">${ic('shield')}<span>This QR was changed on ${dlong(v.changedOn)}. Check with ${esc(person)} before you pay.</span></div>` : '';
      const btns = iphone
        ? `<button class="btn primary big block" ${dis} data-act="qrdo" data-how="share" data-id="${v.id}">${ic('share')} Share…</button><div class="t12 muted" style="text-align:center;margin-top:-4px">Choose Save Image to put it in Photos.</div><button class="btn outline block" data-act="closesheet">Cancel</button>`
        : `<button class="btn primary big block" ${dis} data-act="qrdo" data-how="save" data-id="${v.id}">${ic('download')} Save to phone</button>${st === 'nobrowser' ? '' : `<button class="btn outline big block" ${dis} data-act="qrdo" data-how="share" data-id="${v.id}">${ic('share')} Share…</button>`}<button class="btn ghost block" data-act="closesheet">Cancel</button>`;
      return sheet(`<h3>Save a copy of this QR?</h3>${preview}${warn}${changed}${status}${btns}`);
    }
    return '';
  };

  root.PatasScreens = Object.assign(root.PatasScreens, S2);
})(window);
