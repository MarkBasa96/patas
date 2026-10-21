/* Patas mockups: router, actions, toolbar. Fake data only. Clicking through changes the mock data for real,
   so a payment really lowers a balance and a settle really moves a debt. Round 2 (2026-10-02). */
(function (root) {
  const E = root.PatasEngine, D = root.PatasData, U = root.PatasUI, SC = root.PatasScreens, TH = root.PatasThemes, FX = root.PatasFx;
  const $ = (s, el) => (el || document).querySelector(s);
  const TABS = ['log', 'overview', 'list', 'people', 'vault', 'settings'];
  const FORM_ROUTES = ['debtAdd', 'charge', 'qrAdd'];
  const LF0 = () => ({ dir: 'all', status: 'open', type: 'any', person: 'any', sort: 'due', q: '', search: false });

  const S = { look: 'system', theme: 'ink', data: 'normal', cond: 'ok', size: '390', device: 'android', mark: 'tick', cur: 'PHP', route: 'log', params: {}, stack: [], sheet: null, toast: null, form: {}, sw: {}, logDir: 'pay', logSel: null, lf: LF0() };
  let db = D.build('normal'), seq = 1, toastTimer = null;
  const store = {
    get(k) { try { return localStorage.getItem('patas-mock2-' + k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem('patas-mock2-' + k, v); } catch (e) {} },
  };
  const q = new URLSearchParams(location.search);
  if (!q.get('fresh')) ['look', 'theme', 'data', 'size', 'device', 'mark', 'cur'].forEach((k) => { const v = store.get(k); if (v) S[k] = v; }); // fresh=1 (tests): ignore saved settings
  ['look', 'theme', 'data', 'cond', 'size', 'device', 'mark', 'cur', 'route'].forEach((k) => { if (q.get(k)) S[k] = q.get(k); });
  if (q.get('params')) { try { S.params = JSON.parse(q.get('params')); } catch (e) {} }
  if (q.get('bare')) document.body.classList.add('bare');
  if (S.data !== 'normal') db = D.build(S.data);
  U.setMark(S.mark); U.setCurrency(S.cur); FX.setSounds(S.sw.sounds === true); // sounds ship OFF (Erina r2 #25)

  // every form is typed in the debt's own currency (pesos), whatever currency the screens display in (Erina r2 #4)
  const toCents = (s) => { const n = parseFloat(String(s == null ? '' : s).replace(/[^\d.\-]/g, '')); return isFinite(n) ? Math.round(n * 100) : NaN; };
  const mode = () => (S.look === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.look);

  function ctx() {
    const today = D.TODAY;
    return {
      S, db, today, E, UI: U, mode: mode(),
      c: (d) => E.compute(d, today), byId: (id) => db.debts.find((d) => d.id === id),
      qrOf: (d) => (d && d.qr ? db.vault.find((v) => v.id === d.qr) : null),
      F: (id, def) => (S.form[id] === undefined ? def : S.form[id]),
      port: E.portfolio(db.debts, today),
    };
  }

  const NOTES = {
    welcome: ['Welcome and sign-in', 'One line on what Patas does, then sign in with an email code. There is no "skip", because the app needs an account to keep your data private. The logo is a placeholder until yours arrives.'],
    log: ['Log: only for logging', 'The opening screen. Tap what you paid, the amount fills in with what is due, tap Save (it stays pinned above the tabs, so it is never hidden). A pop-up shows exactly what will be saved before anything changes, like Gastos. "I received" is for money people pay you.', 'Try: tap Home Credit, then Save payment, then Save it.'],
    overview: ['Overview: the glance', 'Direction A, your pick. The payment to make now, what you owe, what is due this month, and what you are owed. Never added together. The list of every debt now lives in the List tab.'],
    list: ['List: everything, with filters', 'Like Gastos\'s History. Under All, "I owe" and "Owed to me" are two separate sections with their own totals, never mixed. Choose Open, Overdue, This week or Settled. "Filters" adds kind, person and sorting. Tap a debt to open it.', 'Try: tap Overdue, then Filters.'],
    debt: ['Debt detail', 'The next payment first, then what is left and the installment bar. Tap any line in History to see it, then Edit. The "..." menu has Edit, Share summary, Reopen and Delete.'],
    debtAdd: ['Add or edit a debt', 'Pick a direction, a person, then one of four types. The fields change with the type.'],
    charge: ['Add a charge', 'Late fees and penalties are typed in by hand, only when the lender really charged them.'],
    people: ['People', 'Everyone you have debts with, "I owe" first, "Owed to me" second.'],
    person: ['One person', 'Their two totals and their debts. The "..." menu renames them everywhere.'],
    vault: ['Pay vault', 'Your saved QR codes. The amber line shows a QR replaced in the last 14 days, because a swapped QR is the main danger.'],
    showQr: ['Show QR', 'Always white, even in dark mode, so the other phone\'s camera sees it clearly. The account name is the check, so it never gets cut off. The code is a decorative sample. "Save or share" is for paying from the same phone.'],
    qrAdd: ['Add a QR', 'Choose a photo and Patas reads the account name so you can check it. Names only, never account numbers.'],
    qrExport: ['The saved copy', 'What the picture looks like when it leaves the app: a clear margin, a small caption with the app name and date, nothing about who it is for.'],
    settings: ['Settings, Gastos-style', 'Appearance, color theme, currency, sounds and reminders, then your data, FAQ and feedback. Try the color theme and the currency: the whole mockup follows.'],
    shareSummary: ['Share a summary', 'A clean card for the share sheet. It never includes a QR or an account name.'],
    importTool: ['Import (owner tool)', 'Only you see this, once. Example numbers only.'],
    appicons: ['Brand previews', 'Placeholders so you can see how a logo sits on a home screen, in dark, and as an Android one-colour icon. Yours replaces these.'],
    loading: ['Loading picture', 'Two bars start uneven and the short one grows until they are level. "Patas" means level. Held still if the phone is set to reduce motion.'],
    splash: ['Splash', 'The first picture while the app opens.'],
  };

  // ---------- jump list ----------
  const J = [
    ['Start', null],
    ['Welcome', { route: 'welcome', params: { step: 0 } }], ['Sign in: email', { route: 'welcome', params: { step: 1 } }], ['Sign in: code', { route: 'welcome', params: { step: 2 } }],
    ['Log', null],
    ['Log', { route: 'log' }], ['Log: a debt picked', { route: 'log', log: { sel: 'd1' } }], ['Log: tab picked', { route: 'log', log: { sel: 'd6' } }], ['Log: I received', { route: 'log', log: { dir: 'recv', sel: 'e2' } }],
    ['Log: first run (empty)', { route: 'log', data: 'first' }], ['Log: loading', { route: 'log', cond: 'loading' }], ['Log: error', { route: 'log', cond: 'error' }], ['Log: offline', { route: 'log', cond: 'offline' }],
    ['Confirm before saving', { route: 'log', log: { sel: 'd1', note: 'Paid by GCash' }, sheet: { name: 'confirmlog', params: {} } }],
    ['Pick a date', { route: 'log', log: { sel: 'd1' }, sheet: { name: 'logdate', params: {} } }], ['Other debt (search)', { route: 'log', sheet: { name: 'otherdebt', params: {} } }],
    ['Overview', null],
    ['Overview', { route: 'overview' }], ['Overview: overdue', { route: 'overview', data: 'overdue' }], ['Overview: due today', { route: 'overview', data: 'duetoday' }], ['Overview: first run', { route: 'overview', data: 'first' }],
    ['Overview: all settled', { route: 'overview', data: 'settled' }], ['Overview: very long names', { route: 'overview', data: 'long' }], ['Overview: loading', { route: 'overview', cond: 'loading' }], ['Overview: error', { route: 'overview', cond: 'error' }], ['Overview: offline', { route: 'overview', cond: 'offline' }],
    ['List', null],
    ['List', { route: 'list' }], ['List: overdue only', { route: 'list', data: 'overdue', lf: { status: 'overdue' } }], ['List: I owe', { route: 'list', lf: { dir: 'owe' } }], ['List: owed to me', { route: 'list', lf: { dir: 'owed' } }],
    ['List: settled', { route: 'list', lf: { status: 'settled' } }], ['List: everything, by name', { route: 'list', lf: { status: 'all', sort: 'name' } }], ['List: filters sheet', { route: 'list', sheet: { name: 'lfilter', params: {} } }],
    ['List: nothing matches', { route: 'list', lf: { type: 'uneven', status: 'overdue' } }], ['List: pick a person', { route: 'list', sheet: { name: 'lfperson', params: {} } }], ['List: empty', { route: 'list', data: 'first' }], ['List: loading', { route: 'list', cond: 'loading' }],
    ['Debts', null],
    ['Fixed plan', { route: 'debt', params: { id: 'd1' } }], ['Fixed plan: partly paid + late fee', { route: 'debt', data: 'overdue', params: { id: 'd1' } }], ['Uneven plan', { route: 'debt', params: { id: 'd2' } }],
    ['Open balance', { route: 'debt', params: { id: 'd3' } }], ['Tab (I owe)', { route: 'debt', params: { id: 'd6' } }], ['Tab (owed to me)', { route: 'debt', params: { id: 'e1' } }], ['Owed to me: open balance', { route: 'debt', params: { id: 'e2' } }],
    ['Settled with a write-off', { route: 'debt', params: { id: 's3' } }], ['Overpaid', { route: 'debt', data: 'overpaid', params: { id: 'd5' } }], ['Debt: long names', { route: 'debt', data: 'long', params: { id: 'd1' } }],
    ['Debt menu (...)', { route: 'debt', params: { id: 'd1' }, sheet: { name: 'debtmenu', params: { id: 'd1' } } }],
    ['Entry details', { route: 'debt', params: { id: 'd1' }, sheet: { name: 'entry', params: { id: 'd1', k: 'pay', i: 3 } } }],
    ['Entry: edit', { route: 'debt', params: { id: 'd1' }, sheet: { name: 'entryedit', params: { id: 'd1', k: 'pay', i: 3 } } }],
    ['Entry: confirm changes', { route: 'debt', params: { id: 'd1' }, sheet: { name: 'confirmedit', params: { id: 'd1', k: 'pay', i: 3 } } }],
    ['Entry: confirm delete', { route: 'debt', params: { id: 'd1' }, sheet: { name: 'confirmdel', params: { id: 'd1', k: 'pay', i: 3 } } }],
    ['Mark as settled (confirm)', { route: 'debt', params: { id: 'd1' }, sheet: { name: 'settle', params: { id: 'd1' } } }], ['Delete a debt (confirm)', { route: 'debt', params: { id: 'd1' }, sheet: { name: 'deldebt', params: { id: 'd1' } } }],
    ['Forms', null],
    ['Add a debt', { route: 'debtAdd' }], ['Edit a debt', { route: 'debtAdd', params: { id: 'd1' } }], ['Add a charge', { route: 'charge', params: { id: 'd1' } }],
    ['People', null],
    ['People', { route: 'people' }], ['One person', { route: 'person', params: { name: 'Kuya Jun' } }], ['Rename a person', { route: 'person', params: { name: 'Kuya Jun' }, sheet: { name: 'rename', params: { name: 'Kuya Jun' } } }],
    ['Pay vault', null],
    ['Vault', { route: 'vault' }], ['Vault: empty', { route: 'vault', data: 'first' }], ['Vault: offline', { route: 'vault', cond: 'offline' }], ['Add a QR', { route: 'qrAdd' }],
    ['QR options (...)', { route: 'showQr', params: { id: 'v1', from: 'd1' }, sheet: { name: 'qrmenu', params: { id: 'v1' } } }], ['Edit QR details', { route: 'showQr', params: { id: 'v1', from: 'd1' }, sheet: { name: 'qredit', params: { id: 'v1' } } }],
    ['Show QR', { route: 'showQr', params: { id: 'v1', from: 'd1' } }], ['Show QR: recently changed', { route: 'showQr', params: { id: 'v2', from: 'd3' } }],
    ['Show QR: a copy was saved before', { route: 'showQr', params: { id: 'v3', from: 'd4' } }], ['Show QR: long account name', { route: 'showQr', data: 'long', params: { id: 'v1', from: 'd1' } }],
    ['Show QR: offline, not saved yet', { route: 'showQr', cond: 'offline', params: { id: 'v4', from: 'e2' } }],
    ['Save or share', null],
    ['Confirm sheet', { route: 'showQr', params: { id: 'v1', from: 'd1' }, sheet: { name: 'qrshare', params: { id: 'v1', state: 'ready' } } }],
    ['Confirm: preparing', { route: 'showQr', params: { id: 'v1', from: 'd1' }, sheet: { name: 'qrshare', params: { id: 'v1', state: 'building' } } }],
    ['Confirm: QR changed', { route: 'showQr', params: { id: 'v2', from: 'd3' }, sheet: { name: 'qrshare', params: { id: 'v2', state: 'changed' } } }],
    ['Blocked: match check failed', { route: 'showQr', params: { id: 'v1', from: 'd1', block: 'nomatch' } }],
    ['Error: sharing failed', { route: 'showQr', params: { id: 'v1', from: 'd1' }, sheet: { name: 'qrshare', params: { id: 'v1', state: 'sharefail' } } }],
    ['Error: could not make a copy', { route: 'showQr', params: { id: 'v1', from: 'd1' }, sheet: { name: 'qrshare', params: { id: 'v1', state: 'makefail' } } }],
    ['Browser cannot save', { route: 'showQr', params: { id: 'v1', from: 'd1' }, sheet: { name: 'qrshare', params: { id: 'v1', state: 'nobrowser' } } }],
    ['The saved copy itself', { route: 'qrExport' }],
    ['Settings and help', null],
    ['Settings', { route: 'settings' }], ['Color theme', { route: 'settings', sheet: { name: 'themepick', params: {} } }], ['Currency', { route: 'settings', sheet: { name: 'currency', params: {} } }],
    ['Currency: offline', { route: 'settings', cond: 'offline', sheet: { name: 'currency', params: {} } }], ['FAQ', { route: 'settings', sheet: { name: 'faq', params: {} } }],
    ['Send feedback', { route: 'settings', sheet: { name: 'feedback', params: {} } }], ['Feedback: offline', { route: 'settings', cond: 'offline', sheet: { name: 'feedback', params: {} } }],
    ['Sign out (confirm)', { route: 'settings', sheet: { name: 'signout', params: {} } }], ['Delete my account (confirm)', { route: 'settings', sheet: { name: 'delaccount', params: {} } }],
    ['Share a summary', { route: 'shareSummary', params: { id: 'd1' } }], ['Import (owner tool)', { route: 'importTool' }],
    ['Brand', null],
    ['Brand previews', { route: 'appicons' }], ['Loading picture', { route: 'loading' }], ['Splash', { route: 'splash' }],
  ];

  // ---------- render ----------
  let lastKey = '';
  function screenHTML(X) {
    const r = S.route, p = S.params;
    switch (r) {
      case 'welcome': return SC.welcome(X, p.step || 0);
      case 'log': return SC.log(X);
      case 'overview': return SC.overview(X);
      case 'list': return SC.list(X);
      case 'debt': return SC.debt(X, p.id);
      case 'debtAdd': return SC.debtAdd(X, p.id);
      case 'charge': return SC.charge(X, p.id);
      case 'people': return SC.people(X);
      case 'person': return SC.person(X, p.name);
      case 'vault': return SC.vault(X);
      case 'showQr': return SC.showQr(X, p.id, p.from, p.block);
      case 'qrExport': return SC.qrExport(X);
      case 'qrAdd': return SC.qrAdd(X);
      case 'settings': return SC.settings(X);
      case 'shareSummary': return SC.shareSummary(X, p.id);
      case 'importTool': return SC.importTool(X);
      case 'appicons': return SC.appicons(X);
      case 'loading': return SC.loading(X);
      case 'splash': return SC.splash(X);
      default: return `<div class="screen"><p>Unknown screen: ${U.esc(r)}</p></div>`;
    }
  }
  function render() {
    const X = ctx(), phone = $('#phone');
    const old = phone.querySelector('.screen, .qrscreen'), top = old ? old.scrollTop : 0;
    const ae = document.activeElement, keep = ae && ae.id && phone.contains(ae) && ae.setSelectionRange ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
    const key = S.route + JSON.stringify(S.params) + S.data + S.cond;
    phone.dataset.mode = X.mode;
    TH.apply(phone, S.theme, X.mode);
    const W = S.size === '360' ? 360 : 390, H = S.size === '360' ? 640 : 844;
    phone.style.setProperty('--W', W + 'px'); phone.style.setProperty('--H', H + 'px');
    let html = screenHTML(X);
    if (TABS.includes(S.route)) html += U.nav(S.route);
    if (S.sheet) html += SC.sheet(X, S.sheet.name, S.sheet.params);
    if (S.toast) html += `<div class="toast" role="status">${U.esc(S.toast)}</div>`;
    phone.innerHTML = html;
    const sc = phone.querySelector('.screen, .qrscreen');
    if (sc && key === lastKey) sc.scrollTop = top;
    lastKey = key;
    if (keep) { const el = document.getElementById(keep.id); if (el && el.focus) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch (e) {} } }
    phone.dataset.route = S.route;
    updateDynamic();
    renderNotes(); syncBar();
  }
  function renderNotes() {
    const n = NOTES[S.route];
    $('#notes').innerHTML = n ? `<h2>${U.esc(n[0])}</h2>${n.slice(1).map((t, i) => `<p class="${i === 0 ? 'k' : ''}">${U.esc(t)}</p>`).join('')}<p><small>Draft wording. Names, amounts and lenders are invented. Rohan finalises the words later.</small></p>` : '';
  }

  // ---------- navigation ----------
  function go(route, params, o) {
    o = o || {};
    if (route === 'home') route = 'log';
    if (route === 'settled') { S.lf = Object.assign(LF0(), { status: 'settled' }); route = 'list'; }
    if (!o.replace && !TABS.includes(route) && route !== 'welcome') S.stack.push({ route: S.route, params: S.params });
    if (TABS.includes(route) || route === 'welcome') S.stack = [];
    if (FORM_ROUTES.includes(route) && !o.keepForm) S.form = {};
    S.route = route; S.params = params || {}; S.sheet = null; S.toast = null;
    render();
  }
  function back() { const p = S.stack.pop(); S.sheet = null; if (p) { S.route = p.route; S.params = p.params; render(); } else go('log'); }
  function toast(t) { S.toast = t; render(); clearTimeout(toastTimer); toastTimer = setTimeout(() => { S.toast = null; render(); }, 2800); }
  function setData(name) { S.data = name; db = D.build(name); S.logSel = null; S.form = {}; S.lf = LF0(); store.set('data', name); }
  function resetForm() { delete S.form['f-lamount']; delete S.form['f-lnote']; delete S.form['f-ldate']; delete S.form['f-tabkind']; }

  // pick a debt on the Log tab: the amount fills in with what is due
  function logSelect(id, kind) {
    const d = db.debts.find((x) => x.id === id); if (!d) return;
    const c = E.compute(d, D.TODAY);
    S.logSel = id; S.logDir = c.effectiveDirection === 'owed' ? 'recv' : 'pay';
    S.form['f-tabkind'] = kind || 'paid';
    const def = d.type === 'tab' || d.type === 'open' ? '' : c.next ? U.moneyNumO(c.next.short) : '';
    S.form['f-lamount'] = def;
  }

  // ---------- actions ----------
  const itemOf = (d, k, i) => (k === 'pay' ? d.payments : k === 'charge' ? d.charges : k === 'line' ? d.lines : d.writeoffs)[i];
  const A = {
    back, closesheet() { S.sheet = null; render(); },
    retry() { S.cond = 'ok'; render(); }, copy() { toast('Copied'); },
    togglepaid() { S.form.showpaid = !S.form.showpaid; render(); },
    pickLink(el) { S.form['qr-link'] = el.dataset.v; S.form['qr-link-lbl'] = el.dataset.l; S.sheet = null; render(); },
    // --- Log ---
    logfor(el) { logSelect(el.dataset.id, el.dataset.kind); go('log'); },
    logsel(el) { logSelect(el.dataset.id); S.sheet = null; render(); },
    setldate(el) { const v = el.dataset.from ? $('#' + el.dataset.from).value : el.dataset.v; if (v) S.form['f-ldate'] = v; S.sheet = null; render(); },
    savelog() {
      const d = db.debts.find((x) => x.id === S.logSel); if (!d) return;
      const cents = toCents(S.form['f-lamount']); if (!(cents > 0)) { S.sheet = null; return toast('Enter an amount first'); }
      const date = S.form['f-ldate'] || D.TODAY, note = S.form['f-lnote'] || '';
      if (d.type === 'tab') {
        const flipped = E.compute(d, D.TODAY).flipped, kind = S.form['f-tabkind'] || 'paid';
        d.lines.push({ date, delta: (kind === 'add' ? 1 : -1) * (flipped ? -1 : 1) * cents, note: note || (kind === 'add' ? 'Added' : 'Paid') });
      } else { d.payments = d.payments || []; d.payments.push({ date, amount: cents, note }); }
      const c = E.compute(d, D.TODAY), done = d.type !== 'tab' && c.remaining === 0 && c.overpaid === 0;
      if (done) d.settledOn = D.TODAY; // fully paid: moves to Settled by itself (can be reopened)
      S.sheet = null; S.logSel = null; resetForm();
      if (done) { FX.play('done'); toast(`Patas na. ${d.person} is paid off.`); }
      else { FX.play('tick'); toast(`Saved. ${d.person} has ${U.moneyO(c.remaining)} left.`); }
    },
    // --- List ---
    lf(el) { const k = el.dataset.k; S.lf[k] = el.dataset.v; if (!el.dataset.keep) S.sheet = null; render(); },
    lfclear(el) { const s = S.lf.search; S.lf = LF0(); S.lf.search = s; if (!el.dataset.keep) S.sheet = null; render(); },
    lfpick(el) { S.lf.person = el.dataset.v; S.sheet = { name: 'lfilter', params: {} }; render(); }, // back to the filters sheet after choosing who
    lfsearch() { S.lf.search = !S.lf.search; if (!S.lf.search) S.lf.q = ''; render(); if (S.lf.search) { const i = $('#lf-q'); if (i) i.focus(); } },
    listsettled() { S.lf = Object.assign(LF0(), { status: 'settled' }); go('list'); },
    // --- debts ---
    reopen(el) {
      const d = db.debts.find((x) => x.id === el.dataset.id); if (!d) return;
      const wo = (d.writeoffs || []).filter((w) => w.date === d.settledOn);
      d.writeoffs = (d.writeoffs || []).filter((w) => w.date !== d.settledOn);
      const closing = d.type === 'tab' ? d.lines.filter((l) => l.note === 'Settled' && l.date === d.settledOn) : [];
      if (d.type === 'tab') d.lines = d.lines.filter((l) => !closing.includes(l));
      delete d.settledOn; S.sheet = null;
      toast(wo.length ? `Reopened. The ${U.moneyO(wo[0].amount)} write-off was removed.` : closing.length ? 'Reopened. The closing line was removed.' : 'Reopened. It is back in your debts.');
    },
    savecharge(el) {
      const d = db.debts.find((x) => x.id === el.dataset.id), amt = toCents($('#f-camount').value);
      if (!(amt > 0)) return toast('Enter an amount first');
      const kind = S.form['f-ckind'] || 'Late fee', note = $('#f-cnote').value;
      d.charges = d.charges || []; d.charges.push({ date: $('#f-cdate').value || D.TODAY, amount: amt, note: note ? `${kind} · ${note}` : kind });
      S.form = {}; S.route = 'debt'; S.params = { id: d.id }; S.toast = null; FX.play('tick'); toast('Charge added');
    },
    settle(el) {
      const d = db.debts.find((x) => x.id === el.dataset.id), c = E.compute(d, D.TODAY);
      if (d.type === 'tab') { if (c.balance !== 0) d.lines.push({ date: D.TODAY, delta: -c.balance, note: 'Settled' }); }
      else if (c.remaining > 0) { d.writeoffs = d.writeoffs || []; d.writeoffs.push({ date: D.TODAY, amount: c.remaining, note: 'Written off at settling' }); }
      d.settledOn = D.TODAY; S.sheet = null; FX.play('done'); toast('Patas na. It moved to Settled.');
    },
    deldebt(el) { db.debts = db.debts.filter((x) => x.id !== el.dataset.id); S.sheet = null; S.stack = []; S.route = 'list'; S.params = {}; FX.play('swish'); toast('Deleted'); },
    saveentry(el) {
      const d = db.debts.find((x) => x.id === el.dataset.id), it = itemOf(d, el.dataset.k, +el.dataset.i), cents = toCents(S.form['e-amount']);
      if (!d || !it) return;
      if (!(cents > 0)) { S.sheet = null; return toast('Enter an amount first'); }
      if (el.dataset.k === 'line') it.delta = (it.delta < 0 ? -1 : 1) * cents; else it.amount = cents;
      if (S.form['e-date']) it.date = S.form['e-date'];
      if (S.form['e-note'] !== undefined) it.note = S.form['e-note'];
      ['e-amount', 'e-date', 'e-note'].forEach((k) => delete S.form[k]); S.sheet = null; FX.play('tick'); toast('Saved');
    },
    delentry(el) {
      const d = db.debts.find((x) => x.id === el.dataset.id), arr = el.dataset.k === 'pay' ? d.payments : el.dataset.k === 'charge' ? d.charges : d.lines;
      arr.splice(+el.dataset.i, 1); ['e-amount', 'e-date', 'e-note'].forEach((k) => delete S.form[k]); S.sheet = null; FX.play('swish'); toast('Deleted');
    },
    savedebt(el) {
      const F = S.form, g = (id, def) => { const e = $('#' + id); return e ? e.value : F[id] === undefined ? def : F[id]; };
      const person = (g('f-person', '') || '').trim(); if (!person) return toast('Add a name first');
      if (el.dataset.id) { const d = db.debts.find((x) => x.id === el.dataset.id); d.person = person; d.label = g('f-label', d.label) || d.label; d.notes = g('f-notes', ''); S.form = {}; S.route = 'debt'; S.params = { id: d.id }; return toast('Saved'); }
      const type = F['f-type'] || 'fixed', d = { id: 'n' + seq++, direction: F['f-dir'] || 'owe', type, person, label: g('f-label', '') || 'Debt', notes: g('f-notes', ''), payments: [], charges: [], writeoffs: [] };
      if (type === 'fixed') {
        const a = toCents(g('f-amount', '1,247.50')), n = parseInt(g('f-count', '10'), 10), s = g('f-start', '2026-11-04') || '2026-11-04';
        if (!(a > 0) || !(n > 0)) return toast('Enter the amount and how many');
        d.installments = E.genFixed(s, a, Math.min(n, 120));
      } else if (type === 'uneven') {
        d.installments = g('f-lines', '').split('\n').map((l, i) => { const m = l.split(','); return { id: 'i' + (i + 1), due: (m[0] || '').trim(), amount: toCents(m[1]) }; }).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.due) && x.amount > 0);
        if (!d.installments.length) return toast('Add at least one line: date, amount');
      } else if (type === 'open') {
        d.principal = toCents(g('f-amount', '8,200.00')); d.payBy = g('f-start', '') || null; if (!(d.principal > 0)) return toast('Enter the total owed');
      } else { d.lines = []; delete d.payments; delete d.charges; delete d.writeoffs; }
      db.debts.push(d); S.form = {}; S.stack = []; S.route = 'debt'; S.params = { id: d.id }; toast('Debt saved');
    },
    // --- people, vault ---
    dorename(el) {
      const nu = (S.form['f-rename'] || '').trim(), old = el.dataset.name; if (!nu) { S.sheet = null; return toast('Add a name first'); }
      db.debts.forEach((d) => { if (d.person === old) d.person = nu; });
      if (S.route === 'person') S.params = { name: nu };
      delete S.form['f-rename']; S.sheet = null; toast(`Renamed to ${nu}`);
    },
    saveqr() {
      const g = (id) => { const e = $('#' + id); return e ? e.value : S.form[id]; };
      const label = (g('qr-label') || '').trim(); if (!label) return toast('Add a label first');
      const wallet = S.form['qr-wallet'] || 'Maya';
      const link = S.form['qr-link'] || null, vid = 'v' + seq++;
      db.vault.push({ id: vid, label, wallet, kind: wallet === 'Bank' ? 'bank' : 'ewallet', account: (g('qr-account') || 'UNNAMED').toUpperCase(), changedOn: null, cached: true, link });
      if (link) { const dd = db.debts.find((x) => x.id === link); if (dd) dd.qr = vid; }
      S.form = {}; S.stack = []; S.route = 'vault'; S.params = {}; toast('Saved to your vault');
    },
    saveqredit(el) {
      const v = db.vault.find((x) => x.id === el.dataset.id); const g = (id) => { const e = $('#' + id); return e ? e.value : S.form[id]; };
      v.label = (g('qe-label') || v.label).trim() || v.label; v.account = (g('qe-account') || v.account).toUpperCase(); v.wallet = S.form['qe-wallet'] || v.wallet; v.kind = v.wallet === 'Bank' ? 'bank' : 'ewallet';
      ['qe-label', 'qe-account', 'qe-wallet'].forEach((k) => delete S.form[k]); S.sheet = null; toast('Saved');
    },
    replaceqr(el) { const v = db.vault.find((x) => x.id === el.dataset.id); v.changedOn = D.TODAY; S.sheet = null; toast('QR replaced. Patas will warn about it for 14 days.'); },
    delqr(el) { db.vault = db.vault.filter((x) => x.id !== el.dataset.id); db.debts.forEach((d) => { if (d.qr === el.dataset.id) delete d.qr; }); S.sheet = null; S.stack = []; S.route = 'vault'; S.params = {}; FX.play('swish'); toast('Removed'); },
    qrdo(el) {
      const v = db.vault.find((x) => x.id === el.dataset.id); v.savedCopyOn = D.TODAY; S.sheet = null;
      toast(el.dataset.how === 'save' ? 'Saved to Downloads. Delete it after you pay.' : "Copy shared. Patas can't delete it for you.");
    },
    // --- settings ---
    settheme(el) { S.theme = el.dataset.v; store.set('theme', S.theme); render(); },
    setcur(el) { S.cur = el.dataset.v; U.setCurrency(S.cur); store.set('cur', S.cur); S.sheet = null; toast(`Showing amounts in ${S.cur}`); },
    faqtoggle(el) {
      const a = el.nextElementSibling, open = a.hidden; a.hidden = !open; el.classList.toggle('open', open); el.setAttribute('aria-expanded', open);
      const svg = el.querySelector('svg'); if (svg) svg.innerHTML = open ? '<path d="m18 15-6-6-6 6"/>' : '<path d="m6 9 6 6 6-6"/>';
    },
    sendfb() { const t = (S.form['f-fb'] || '').trim(); if (!t) return; S.form.fbSent = true; FX.play('thanks'); render(); },
    signout() { S.sheet = null; setData('normal'); go('welcome', { step: 0 }); },
  };

  function jump(i) {
    const j = J[i][1]; if (!j) return;
    const want = j.data || 'normal';
    if (want !== S.data) setData(want); else { S.logSel = null; S.form = {}; S.lf = LF0(); }
    S.cond = j.cond || 'ok'; S.stack = []; S.toast = null;
    if (j.lf) Object.assign(S.lf, j.lf);
    S.logDir = 'pay';
    if (j.log) { if (j.log.dir) S.logDir = j.log.dir; if (j.log.sel) logSelect(j.log.sel, j.log.tab); if (j.log.note) S.form['f-lnote'] = j.log.note; }
    S.route = j.route; S.params = j.params || {}; S.sheet = j.sheet || null;
    render();
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const phone = $('#phone'); if (!phone.contains(e.target)) return;
    const el = e.target.closest('[data-act],[data-go],[data-sheet],[data-seg],[data-sw],[data-toast],[data-fill]');
    if (!el || !phone.contains(el)) return;
    if (el.dataset.act === 'closesheet' && e.target.closest('[data-stop]')) return;
    if (el.hasAttribute('disabled')) return;
    const d = el.dataset;
    FX.haptic(6);
    if (d.act) return A[d.act] && A[d.act](el);
    if (d.go) { if (d.reset) { setData('normal'); } return go(d.go, { id: d.id, from: d.from, step: d.step ? +d.step : 0, name: d.name }); }
    if (d.sheet) {
      const params = Object.assign({}, d);
      if (d.sheet === 'qrshare') { S.sheet = { name: 'qrshare', params: { ...params, state: 'building' } }; render(); const mine = S.sheet; setTimeout(() => { if (S.sheet === mine) { S.sheet = { name: 'qrshare', params }; render(); } }, 700); return; }
      S.sheet = { name: d.sheet, params }; return render();
    }
    if (d.seg) {
      if (d.seg === 'look') { S.look = d.v; store.set('look', d.v); }
      else if (d.seg === 'f-ldir') { S.logDir = d.v; S.logSel = null; resetForm(); }
      else S.form[d.seg] = d.v;
      return render();
    }
    if (d.sw) {
      const def = { rem: true, mpin: false, qrb: false, sounds: false }[d.sw];
      S.sw[d.sw] = !(S.sw[d.sw] === undefined ? def : S.sw[d.sw]);
      if (d.sw === 'sounds') FX.setSounds(S.sw.sounds);
      if (d.sw === 'sounds' && S.sw.sounds) FX.play('tick');
      return render();
    }
    if (d.toast) return toast(d.toast);
    if (d.fill) { const inp = $('#' + d.fill); S.form[d.fill] = d.v; if (inp) { inp.value = d.v; updateDynamic(); } else render(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && S.sheet) { S.sheet = null; render(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[role="button"]')) { e.preventDefault(); e.target.click(); }
  });

  // live updates that must not re-render (so typing keeps its place)
  function updateDynamic() {
    const p = $('#prev'), a = $('#f-amount'), n = $('#f-count');
    if (p && a && n) { const c = toCents(a.value), k = parseInt(n.value, 10); p.textContent = c > 0 && k > 0 ? `${k} installments of ${U.money(c)} = ${U.money(c * k)} in total.` : 'Patas makes the installments for you, one a month on the same day.'; }
    const save = $('#logsave'), amt = $('#f-lamount');
    if (save && amt) save.disabled = !(S.logSel && parseFloat(String(amt.value).replace(/[^\d.]/g, '')) > 0);
    const es = $('#editsave');
    if (es) { const a = $('#e-amount'), dt = $('#e-date'), nt = $('#e-note'); const cents = (v) => Math.round(parseFloat(String(v).replace(/,/g, '')) * 100); es.disabled = !((a && cents(a.value) !== +es.dataset.oa) || (dt && dt.value !== es.dataset.od) || (nt && nt.value !== es.dataset.on)); }
    const fb = $('#f-fb'), send = $('#fbsend');
    if (fb && send) { send.disabled = !fb.value.trim() || S.cond === 'offline'; const c = $('#fbcount'); if (c) c.textContent = fb.value.length + ' / 1000'; }
  }
  function updateDateLabels() { document.querySelectorAll('#phone input[data-datelabel]').forEach((i) => { const l = $('#' + i.id + '-lbl'); if (l) l.textContent = i.value ? U.fdowy(i.value, D.TODAY) : 'No date'; }); }
  const filterBy = (inputId, listSel, noneId) => { const v = $('#' + inputId).value.toLowerCase(); let n = 0; document.querySelectorAll(listSel + ' [data-q]').forEach((r) => { const show = r.dataset.q.includes(v); r.hidden = !show; if (show) n++; }); const none = noneId && $('#' + noneId); if (none) none.hidden = n > 0; };
  document.addEventListener('input', (e) => {
    const t = e.target; if (!$('#phone').contains(t)) return;
    if (t.id === 'lf-q') { S.lf.q = t.value; return render(); }
    if (t.id === 'oq') return filterBy('oq', '#otherlist');
    if (t.id === 'cq') return filterBy('cq', '#curlist');
    if (t.id === 'pq') return filterBy('pq', '#personlist');
    if (t.id === 'fq') return filterBy('fq', '#faqlist', 'faqnone');
    if (t.id) S.form[t.id] = t.value;
    updateDynamic();
    if (t.hasAttribute('data-datelabel')) updateDateLabels();
  });
  document.addEventListener('change', (e) => { const t = e.target; if (t && t.id === 'f-pick' && t.value && $('#phone').contains(t)) { S.form['f-ldate'] = t.value; S.sheet = null; render(); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.look === 'system') render(); });

  // ---------- toolbar ----------
  function buildBar() {
    const sel = (id, label, opts) => `<label>${label}<select id="${id}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>`;
    let jumpOpts = '', open = false;
    J.forEach(([t, j], i) => { if (!j) { if (open) jumpOpts += '</optgroup>'; jumpOpts += `<optgroup label="${t}">`; open = true; } else jumpOpts += `<option value="${i}">${t}</option>`; });
    jumpOpts += '</optgroup>';
    $('#bar').innerHTML = `<h1>Patas mockups <span style="font-weight:400;color:var(--c-muted)">· round 2 · fake data only</span></h1>
      <details id="ctl" style="flex:1 1 100%"><summary style="cursor:pointer;font-weight:600;min-height:32px;display:flex;align-items:center">Controls</summary>
      <div style="display:flex;flex-wrap:wrap;gap:8px 12px;align-items:flex-end;padding-top:8px">
      ${sel('c-look', 'Appearance', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}
      ${sel('c-mark', 'Settled looks like', [['tick', 'A tick'], ['line', 'A line through'], ['equal', 'An = sign']])}
      ${sel('c-data', 'Data', [['normal', 'Normal'], ['overdue', 'Overdue'], ['duetoday', 'Due today'], ['overpaid', 'Overpaid'], ['first', 'First run'], ['settled', 'All settled'], ['long', 'Long names']])}
      ${sel('c-cond', 'Condition', [['ok', 'Fine'], ['loading', 'Loading'], ['error', 'Error'], ['offline', 'Offline']])}
      ${sel('c-size', 'Screen', [['390', '390 × 844'], ['360', '360 × 640 (smallest)']])}
      ${sel('c-device', 'Phone', [['android', 'Android'], ['iphone', 'iPhone']])}
      <label style="min-width:180px;flex:1 1 220px">Jump to<select id="c-jump"><option value="">Choose a screen…</option>${jumpOpts}</select></label>
      <button id="c-reset">Reset data</button></div></details>`;
    const on = (id, f) => $('#' + id).addEventListener('change', (e) => f(e.target.value));
    on('c-look', (v) => { S.look = v; store.set('look', v); render(); });
    on('c-mark', (v) => { S.mark = v; U.setMark(v); store.set('mark', v); render(); });
    on('c-data', (v) => { setData(v); S.stack = []; render(); });
    on('c-cond', (v) => { S.cond = v; render(); });
    on('c-size', (v) => { S.size = v; store.set('size', v); render(); });
    on('c-device', (v) => { S.device = v; store.set('device', v); render(); });
    on('c-jump', (v) => { if (v !== '') { jump(+v); $('#c-jump').value = ''; } });
    $('#c-reset').addEventListener('click', () => { setData(S.data); S.stack = []; render(); });
    if (matchMedia('(min-width:700px)').matches) $('#ctl').open = true;
  }
  function syncBar() { [['c-look', S.look], ['c-mark', S.mark], ['c-data', S.data], ['c-cond', S.cond], ['c-size', S.size], ['c-device', S.device]].forEach(([id, v]) => { const e = $('#' + id); if (e) e.value = v; }); }

  buildBar(); render();
  root.__mock = { S, go, render, jump, J, get db() { return db; }, setData, A, toCents };
})(window);
