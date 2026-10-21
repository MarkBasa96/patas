/* Patas mockups: small UI helpers. Every function returns an HTML string. Fake data only. */
(function (root) {
  const E = root.PatasEngine;

  // Icons: simplified stroke icons for the mockup. The real app uses lucide-react-native.
  const P = {
    check: '<path d="M20 6 9 17l-5-5"/>',
    checks: '<path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M5 12h14M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    out: '<path d="m7 7 10 10M17 7v10H7"/>',   // arrow-down-right: I owe
    in: '<path d="M7 7h10v10M7 17 17 7"/>',    // arrow-up-right: owed to me
    copy: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    half: '<circle cx="12" cy="12" r="10"/><path d="M12 18a6 6 0 0 0 0-12v12z" fill="currentColor"/>',
    cminus: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4M12 16h.01"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    bank: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2 20 7H4z"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    dash: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/>',
    sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    plusc: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    filter: '<path d="M22 3H2l8 9.46V19l4 2v-8.54z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    palette: '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-4.9-4.5-9-10-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16.5" cy="10" r="1"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z"/><path d="m9 13 2 2 4-4"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    chartbar: '<path d="M3 3v16a2 2 0 0 0 2 2h16M7 16h8M7 11h12M7 6h3"/>',  // Overview: horizontal bars, Patas's own straight bar (Erina r2 #13)
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    sunmoon: '<path d="M12 8a2.83 2.83 0 0 0 4 4 4 4 0 1 1-4-4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>', // Appearance "Auto" (the half-filled circle already means "partly paid")
  };
  const ic = (n, cls) => `<svg class="i ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;

  // ---- formatting ----
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  // Currency: amounts are stored in centavos of the ORIGINAL currency (pesos); the display converts at a rate.
  // Same idea as Gastos. The rates here are sample numbers for the mockup only.
  const CURRENCIES = [
    { code: 'PHP', name: 'Philippine peso', sym: '₱', rate: 1, dec: 2, top: true },
    { code: 'USD', name: 'US dollar', sym: '$', rate: 0.0176, dec: 2, top: true },
    { code: 'EUR', name: 'Euro', sym: '€', rate: 0.0161, dec: 2, top: true },
    { code: 'JPY', name: 'Japanese yen', sym: '¥', rate: 2.62, dec: 0, top: true },
    { code: 'SGD', name: 'Singapore dollar', sym: 'S$', rate: 0.0228, dec: 2 },
    { code: 'GBP', name: 'British pound', sym: '£', rate: 0.0137, dec: 2 },
    { code: 'AUD', name: 'Australian dollar', sym: 'A$', rate: 0.0268, dec: 2 },
    { code: 'AED', name: 'UAE dirham', sym: 'AED ', rate: 0.0646, dec: 2 },
    { code: 'SAR', name: 'Saudi riyal', sym: 'SAR ', rate: 0.066, dec: 2 },
    { code: 'HKD', name: 'Hong Kong dollar', sym: 'HK$', rate: 0.137, dec: 2 },
    { code: 'KRW', name: 'South Korean won', sym: '₩', rate: 24.3, dec: 0 },
  ];
  let CUR = CURRENCIES[0];
  const setCurrency = (code) => { CUR = CURRENCIES.find((c) => c.code === code) || CURRENCIES[0]; };
  const curInfo = () => CUR;
  const sym = () => '₱'; // every form is typed in the debt's own currency (pesos), whatever the display currency is
  const moneyNum = (c) => ((c / 100) * CUR.rate).toLocaleString('en-US', { minimumFractionDigits: CUR.dec, maximumFractionDigits: CUR.dec });
  // A converted amount is an estimate, so it always wears "≈" (Erina r2 #4). In pesos nothing changes.
  const money = (c) => (CUR.rate === 1 ? '' : '≈') + CUR.sym + moneyNum(c);
  // The debt's own currency (pesos). Log, the confirm pop-ups, the history and Show QR always use this: it is what the lender is owed.
  const moneyNumO = (c) => (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const moneyO = (c) => '₱' + moneyNumO(c);
  const curNote = () => (CUR.rate === 1 ? '' : `<div class="t12 muted curnote" style="margin:-4px 0 12px">Shown in ${CUR.code} at today's rate</div>`);
  const parse = (iso) => new Date(iso + 'T00:00:00Z');
  const fd = (iso) => { const d = parse(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const fdy = (iso, today) => { const d = parse(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` + (iso.slice(0, 4) !== today.slice(0, 4) ? `, ${d.getUTCFullYear()}` : ''); };
  const fdow = (iso) => { const d = parse(iso); return `${DOW[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`; };
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const rel = (iso, today) => {
    const n = E.diffDays(iso, today);
    if (n === 0) return 'today';
    if (n === 1) return 'tomorrow';
    if (n > 1 && n <= 7) return `in ${n} days`;
    return null;
  };

  // ---- status, in three volumes: quiet words, a dot, one loud pill (overdue only) ----
  // quiet = list rows on a screen that already has the loud pill: a rust dot and plain words instead
  function timing(n, dir, today, quiet) {
    if (n.overdueDays > 0) {
      const w = `${dir === 'owed' ? 'Late' : 'Overdue'} · ${plural(n.overdueDays, 'day')}`;
      return quiet ? `<span class="quiet" style="color:var(--text);font-weight:600"><span class="rdot"></span>${w}</span>` : `<span class="pill overdue">${ic('clock')}${w}</span>`;
    }
    if (n.dueToday) return `<span class="pill dot">Due today</span>`;
    if (n.due) { const r = rel(n.due, today); return `<span class="quiet">${r ? r + ' · ' : ''}Due ${fd(n.due)}</span>`; }
    return '';
  }
  function itemState(n, dir, today, quiet) {
    if (n.status === 'paid') {
      return n.lateDays > 0
        ? `<span class="quiet">${ic('check')}Paid ${fd(n.completedOn)} · ${plural(n.lateDays, 'day')} late</span>`
        : `<span class="quiet ok">${ic('check')}Paid ${fd(n.completedOn)}</span>`;
    }
    if (n.status === 'writtenoff') return `<span class="quiet">${ic('cminus')}Written off ${money(n.woAmt)}</span>`;
    if (n.status === 'partly') return `<span class="quiet">${ic('half')}${money(n.short)} short</span>` + (n.overdueDays > 0 ? ' ' + timing(n, dir, today, quiet) : '');
    return timing(n, dir, today, quiet);
  }
  // dates in the app's own format ("Fri, Oct 2"), never the browser's "10/02/2026"
  const fdowy = (iso, today) => { const d = parse(iso); return `${DOW[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}` + (today && iso.slice(0, 4) !== today.slice(0, 4) ? `, ${d.getUTCFullYear()}` : ''); };
  const datePick = (id, val, label, today, optional) => `<div class="picker datepick"><span id="${id}-lbl" data-fmt>${val ? fdowy(val, today) : (optional ? 'No date' : 'Choose a date')}</span>${ic('cal')}<input type="date" id="${id}" value="${val || ''}" aria-label="${label}" data-datelabel></div>`;

  const bar6 = (f) => `<div class="bar6" role="img" aria-label="${Math.round(f * 100)} percent paid"><i style="width:${Math.max(0, Math.min(1, f)) * 100}%"></i></div>`;
  const bar4 = (f) => `<div class="bar4"><i style="width:${Math.max(0, Math.min(1, f)) * 100}%"></i></div>`;
  const frac = (c) => (c.total > 0 ? Math.min(1, c.paid / c.total) : 0);
  function segBar(c) {
    const cells = c.items.filter((n) => n.kind === 'inst').map((n) => {
      const cls = n.status === 'paid' ? 'full' : n.status === 'partly' ? 'part' : '';
      const p = n.status === 'partly' ? Math.round(((n.amount - n.short) / n.amount) * 100) : 0;
      return `<i class="${cls} ${n.overdueDays > 0 ? 'late' : ''}" style="--p:${p}%"></i>`;
    });
    return `<div class="seg" role="img" aria-label="${cells.length} installments">${cells.join('')}</div>`;
  }

  // ---- header, nav, shell ----
  function sync(cond) {
    if (cond === 'offline') return `<span class="sync off"><b></b>Offline</span>`;
    if (cond === 'error') return `<span class="sync warn"><b></b>Sync paused</span>`;
    if (cond === 'loading') return `<span class="sync ok"><b></b>Saving…</span>`;
    return `<span class="sync ok"><b></b>Synced</span>`;
  }
  const homeHdr = (title, cond) => `<div class="hdr"><h1>${esc(title)}</h1>${sync(cond)}</div>`;
  const subHdr = (title, right) => `<div class="hdr sub"><button class="iconbtn" data-act="back" aria-label="Back">${ic('left')}</button><h1 class="ell">${esc(title)}</h1>${right || ''}</div>`;
  // six tabs, a small icon above each word (Joe's choice, 2026-10-02)
  const TABS = [['log', 'Log', 'plusc'], ['overview', 'Overview', 'chartbar'], ['list', 'List', 'list'], ['people', 'People', 'users'], ['vault', 'Vault', 'qr'], ['settings', 'Settings', 'settings']];
  function nav(active) {
    return `<nav class="nav" aria-label="Main">${TABS.map(([k, l, i]) => `<button data-go="${k}" class="${active === k ? 'on' : ''}" ${active === k ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span></button>`).join('')}</nav>`;
  }
  // Settled is shown as a mark, not the word (Joe). Three options to choose from; the accessible label stays "Settled".
  const MARK = { v: 'tick' };
  const setMark = (v) => { MARK.v = v; };
  const settledBadge = (iso) => {
    const lbl = `Settled ${fd(iso)}`;
    if (MARK.v === 'line') return `<span class="pill soft" role="img" aria-label="${lbl}"><i class="ln"></i>${fd(iso)}</span>`;
    if (MARK.v === 'equal') return `<span class="pill soft" role="img" aria-label="${lbl}"><i class="eq"><b></b><b></b></i>${fd(iso)}</span>`;
    return `<span class="pill soft" role="img" aria-label="${lbl}">${ic('check')}${fd(iso)}</span>`;
  };
  const nameCls = (d) => (d.settledOn && MARK.v === 'line' ? 'struck' : '');
  const field = (id, label, inner, hint) => `<div class="field"><label for="${id}">${label}</label>${inner}${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
  const input = (id, val, extra) => `<input id="${id}" value="${esc(val == null ? '' : val)}" ${extra || ''}>`;
  const seg3 = (id, opts, cur) => `<div class="seg3" role="group" id="${id}">${opts.map(([k, l]) => `<button data-seg="${id}" data-v="${k}" class="${k === cur ? 'on' : ''}" aria-pressed="${k === cur}">${l}</button>`).join('')}</div>`;
  const sheet = (inner) => `<div class="scrim" data-act="closesheet"><div class="sheet" role="dialog" aria-modal="true" data-stop><div class="grab"></div>${inner}</div></div>`;
  const dialog = (inner) => `<div class="scrim mid" data-act="closesheet"><div class="dialog" role="alertdialog" aria-modal="true" data-stop>${inner}</div></div>`;
  // the Gastos pattern: a centered card over a blurred screen that shows exactly what is about to change
  const confirmBox = (title, body, label, act, attrs, danger) => dialog(`<h3>${title}</h3>${body}<div class="btns"><button class="btn outline" data-act="closesheet">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-act="${act}" ${attrs || ''}>${label}</button></div>`);
  // action menus: one grouped card of rows, 52px tall, an icon each, the destructive one last in red text (Erina r2 #8). No "Close": swipe, the backdrop and Back already close a sheet.
  const menuRow = (icon, label, attrs, danger) => `<button class="row mrow ${danger ? 'danger' : ''}" ${attrs}>${ic(icon)}<span class="grow">${label}</span></button>`;
  const menuSheet = (title, rows) => sheet(`<h3>${title}</h3><div class="list">${rows.join('')}</div>`);
  const skelBlock = (h, w) => `<div class="skel" style="height:${h}px;${w ? 'width:' + w : ''}"></div>`;
  const errorCard = (what) => `<div class="card stack" role="alert"><div class="cardhead"><span class="sb">${ic('alert')} Couldn't load ${what}</span></div><p class="muted t13" style="margin:0">Your data is safe on this phone. Check the connection and try again.</p><button class="btn outline" data-act="retry">${ic('refresh')} Try again</button></div>`;

  // ---- a decorative sample QR. NOT a real code: random modules, no payload, will not scan. ----
  function qrSvg(seed) {
    let s = 0;
    for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const N = 29, g = Array.from({ length: N }, () => Array(N).fill(0));
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) g[y][x] = rnd() < 0.48 ? 1 : 0;
    const finder = (ox, oy) => { for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) { const X = ox + x, Y = oy + y; if (X < 0 || Y < 0 || X >= N || Y >= N) continue; const edge = x === 0 || y === 0 || x === 6 || y === 6, core = x >= 2 && x <= 4 && y >= 2 && y <= 4; g[Y][X] = x < 0 || y < 0 || x > 6 || y > 6 ? 0 : (edge || core ? 1 : 0); } };
    finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
    for (let i = 8; i < N - 8; i++) { g[6][i] = i % 2 === 0 ? 1 : 0; g[i][6] = i % 2 === 0 ? 1 : 0; }
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) g[22 + y][22 + x] = (Math.max(Math.abs(x), Math.abs(y)) !== 1) ? 1 : 0;
    let d = '';
    for (let y = 0; y < N; y++) { let x = 0; while (x < N) { if (g[y][x]) { let w = 1; while (x + w < N && g[y][x + w]) w++; d += `M${x} ${y}h${w}v1h-${w}z`; x += w; } else x++; } }
    return `<svg viewBox="-1 -1 ${N + 2} ${N + 2}" shape-rendering="crispEdges" role="img" aria-label="Sample code, not a real payment code"><rect x="-1" y="-1" width="${N + 2}" height="${N + 2}" fill="#fff"/><path d="${d}" fill="#161A22"/></svg>`;
  }

  root.PatasUI = { ic, money, moneyNum, moneyO, moneyNumO, curNote, sym, CURRENCIES, setCurrency, curInfo, fd, fdy, fdow, fdowy, datePick, fdowm: fdow, plural, esc, rel, timing, itemState, bar6, bar4, frac, segBar, sync, homeHdr, subHdr, nav, TABS, settledBadge, setMark, nameCls, MARK, field, input, seg3, sheet, dialog, confirmBox, menuRow, menuSheet, skelBlock, errorCard, qrSvg, MONTHS_LONG, MONTHS, DOW };
})(window);
