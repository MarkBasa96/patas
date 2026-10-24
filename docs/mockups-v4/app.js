/* Patas mockups v4 (round 4, 2026-10-23). Screens to Erina's direction; numbers from engine.js; motion from
   motion.js. Fake data only. Every tap really changes the sample data, so a logged payment moves every total.
   URL: ?s=<screen>&t=<theme>&m=light|dark&f=manrope|jakarta|inter&d=iphone|android&w=390|360&bare=1&reduce=1&solid=1 */
(function () {
  'use strict';
  const E = window.PatasEngine, M = window.PatasMotion;
  const qs = new URLSearchParams(location.search);
  const html = document.documentElement;
  if (qs.get('bare')) html.classList.add('bare');
  if (qs.get('reduce') || (matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) html.dataset.reduce = '1';
  if (qs.get('solid')) html.classList.add('solid');
  // On a real phone the mockup fills the screen (no frame, no white space) and uses the phone's own status bar
  const fit = !qs.get('bare') && Math.min(innerWidth, (screen && screen.width) || innerWidth) <= 520;
  if (fit) html.classList.add('fit');
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // glyph = the detailed white drawing (app icon); small = Joe's simplified one for 36px and below (header tile, spinner, lock)
  const ASSET = window.PATAS_ASSETS || { glyph: '../../app/assets/brand/patas-mono.png', small: '../../app/assets/brand/patas-mono-small.png', smallViolet: '../../app/assets/brand/patas-mono-small-violet.png', logo: '../../app/assets/brand/patas-logo.png' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Sample rates for the mockup (pesos per 1 unit). The real app fetches them once a day (Frankfurter, then open.er-api),
  // like Gastos, and only ever converts for display.
  const CUR = [
    ['PHP', 'Philippine peso', 1], ['USD', 'US dollar', 58.12], ['EUR', 'Euro', 62.85], ['GBP', 'British pound', 74.1], ['JPY', 'Japanese yen', 0.383],
    ['SGD', 'Singapore dollar', 44.7], ['HKD', 'Hong Kong dollar', 7.47], ['AUD', 'Australian dollar', 38.2], ['CAD', 'Canadian dollar', 41.9],
    ['AED', 'UAE dirham', 15.83], ['SAR', 'Saudi riyal', 15.49], ['QAR', 'Qatari riyal', 15.96], ['KWD', 'Kuwaiti dinar', 189.3], ['KRW', 'South Korean won', 0.0421],
    ['CNY', 'Chinese yuan', 8.15], ['TWD', 'New Taiwan dollar', 1.8], ['MYR', 'Malaysian ringgit', 13.4], ['THB', 'Thai baht', 1.74], ['INR', 'Indian rupee', 0.69],
    ['NZD', 'New Zealand dollar', 34.6], ['CHF', 'Swiss franc', 67.2],
  ];
  const RATE = Object.fromEntries(CUR.map((c) => [c[0], c[2]]));
  const fmtCur = (c, cur) => {
    if (cur === 'PHP') return E.peso(c, { cents: true });
    const nf = new Intl.NumberFormat('en-US', { style: 'currency', currency: cur });
    return nf.format(c / 100).replace('-', '−');
  };
  const conv = (c, from, to) => (from === to ? c : Math.round((c * RATE[from]) / RATE[to]));
  // money(): an amount in pesos (the totals), shown in the chosen currency; converted amounts wear "≈"
  const money = (c) => (S.cur === 'PHP' ? fmtCur(c, 'PHP') : '≈ ' + fmtCur(conv(c, 'PHP', S.cur), S.cur));
  // the debts with every amount turned into pesos, for totals across currencies (the saved debts are never changed)
  const toBase = (d) => { const k = RATE[d.cur || 'PHP']; if (k === 1) return d; const m = (x) => Math.round(x * k); return { ...d, amount: d.amount && m(d.amount), plan: d.plan && d.plan.map((p) => ({ ...p, amt: m(p.amt) })), lines: d.lines.map((l) => ({ ...l, amt: m(l.amt) })) }; };
  const base = () => S.db.debts.map(toBase);
  const TODAY = E.TODAY;

  // ---------------- themes: theme.ts, with round 4's Patas violet in the old "indigo" slot (Erina §3) ----------------
  const THEMES = {
    indigo: { name: 'Patas violet', l: { bg: '#F6F5F9', surface: '#FFFFFF', text: '#16151F', muted: '#5C5A6B', border: '#E0DEE8', accent: '#5946E7', soft: '#ECE9FC', m2: '#8C7CF0' }, d: { bg: '#12111A', surface: '#1B1A25', text: '#EDECF4', muted: '#A8A6B8', border: '#2D2B3A', accent: '#ADA3F7', soft: '#262347', m2: '#4A3AB8', fill: '#5946E7' } },
    ink: { name: 'Ink blue', l: { bg: '#F6F6F3', surface: '#FFFFFF', text: '#161A22', muted: '#5A6170', border: '#DEDFE2', accent: '#364C8C', soft: '#E6EAF4', m2: '#5873B8' }, d: { bg: '#111318', surface: '#1A1D24', text: '#ECEEF3', muted: '#A3A9B6', border: '#2C313C', accent: '#95ADE4', soft: '#1F2740', m2: '#5873B8', fill: '#4A63A8' } },
    green: { name: 'Forest green', l: { bg: '#F6F7F6', surface: '#FFFFFF', text: '#16201B', muted: '#5B6660', border: '#DCE1DE', accent: '#1D6B45', soft: '#E3F0E8', m2: '#3F9D73' }, d: { bg: '#111513', surface: '#1A201D', text: '#EDF1EE', muted: '#A3ADA7', border: '#2C3530', accent: '#5CC48C', soft: '#1F3328', m2: '#2A8A5B', fill: '#2A7A51' } },
    lavender: { name: 'Lavender', l: { bg: '#F7F5FB', surface: '#FFFFFF', text: '#1C1830', muted: '#5F5A6E', border: '#DFDAEA', accent: '#5E4E8C', soft: '#ECE6F8', m2: '#8B7BC0' }, d: { bg: '#131219', surface: '#1C1A24', text: '#ECEAF3', muted: '#A8A5B8', border: '#2F2B3B', accent: '#BBA8F2', soft: '#2A2440', m2: '#6B4FB8', fill: '#6B58A8' } },
    teal: { name: 'Mint teal', l: { bg: '#F3F8F7', surface: '#FFFFFF', text: '#132220', muted: '#566663', border: '#D6E3E1', accent: '#0E716C', soft: '#D9F0EE', m2: '#3FAFA6' }, d: { bg: '#0F1514', surface: '#172020', text: '#E8F1EF', muted: '#9FB0AD', border: '#283533', accent: '#6DD3CA', soft: '#16332F', m2: '#1E8C84', fill: '#1F7F78' } },
    pink: { name: 'Baby pink', l: { bg: '#FBF5F7', surface: '#FFFFFF', text: '#2A1520', muted: '#6E5A63', border: '#EDDCE3', accent: '#B23A6E', soft: '#FCE4EE', m2: '#E58DB2' }, d: { bg: '#171113', surface: '#221A1D', text: '#F3ECEE', muted: '#B5A6AC', border: '#3A2C32', accent: '#F2A7C6', soft: '#3A2130', m2: '#A8456F', fill: '#A8456F' } },
  };
  const ORDER = ['indigo', 'ink', 'green', 'lavender', 'teal', 'pink'];
  const FONTS = { manrope: { name: 'Manrope', css: "'PManrope', system-ui, sans-serif" }, jakarta: { name: 'Plus Jakarta Sans', css: "'PJakarta', system-ui, sans-serif" }, inter: { name: 'Inter (today)', css: "'PInter', system-ui, sans-serif" } };
  const hexN = (h) => parseInt(h.slice(1), 16);
  const rgb = (h) => { const n = hexN(h); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgba = (h, a) => `rgba(${rgb(h).join(',')},${a})`;
  function mix(a, b, k) { const pa = rgb(a), pb = rgb(b); return '#' + pa.map((v, i) => Math.round(v * (1 - k) + pb[i] * k).toString(16).padStart(2, '0')).join('').toUpperCase(); }

  function themeVars(key, mode) {
    const T = THEMES[key] || THEMES.indigo, dark = mode === 'dark', s = dark ? T.d : T.l;
    const fill = dark ? s.fill || s.accent : s.accent;
    const sem = dark
      ? { peachBg: '#3A2B20', peachInk: '#FFB584', mintBg: '#17342A', mintInk: '#5FD6A2', redBg: '#3C2024', danger: '#FF8F96', warn: '#FFA566', ok: '#2FA57E' }
      : { peachBg: '#FDEBDD', peachInk: '#B04E14', mintBg: '#DDF5EA', mintInk: '#1A7F57', redBg: '#FDE4E4', danger: '#C93636', warn: '#D9631F', ok: '#2FB589' };
    const shadowTint = mix(s.accent, '#000000', 0.45);
    const card = mix(s.surface, '#FFFFFF', 0.04);
    return {
      '--bg': s.bg, '--surface': s.surface, '--text': s.text, '--muted': s.muted, '--border': s.border, '--accent': s.accent, '--soft': s.soft, '--m2': s.m2, '--fill': fill,
      '--field': dark ? mix(s.surface, '#FFFFFF', 0.07) : mix(s.bg, s.accent, 0.05), '--track': dark ? mix(s.surface, '#FFFFFF', 0.12) : mix(s.bg, s.text, 0.1),
      '--mog': dark ? mix(s.text, s.muted, 0.5) : mix(s.text, s.muted, 0.6),
      '--washA': rgba(fill, dark ? 0.24 : 0.22), '--washB': rgba(s.m2, dark ? 0.16 : 0.18),
      '--mb1': dark ? mix(fill, s.bg, 0.35) : s.accent, '--mb2': dark ? fill : s.m2, '--mb3': dark ? rgba(s.accent, 0.35) : rgba(mix(s.m2, '#FFFFFF', 0.7), 0.9),
      '--mbBase': dark ? mix(fill, s.bg, 0.7) : mix(s.accent, s.m2, 0.5), '--tint': dark ? rgba(s.surface, 0.30) : 'rgba(255,255,255,0.60)',
      '--heroBorder': dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)', '--heroShadow': dark ? 'none' : `0 12px 32px -12px ${rgba(shadowTint, 0.25)}`,
      '--glass': dark ? rgba(card, 0.58) : 'rgba(255,255,255,0.62)', '--glassBorder': dark ? 'rgba(255,255,255,0.08)' : rgba(s.text, 0.06), '--glassHi': dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.9)',
      '--glassShadow': dark ? '0 8px 24px -8px rgba(0,0,0,0.5)' : `0 1px 2px ${rgba(s.text, 0.04)}, 0 8px 24px -8px ${rgba(shadowTint, 0.12)}`,
      '--tabGlass': dark ? rgba(s.surface, 0.74) : 'rgba(255,255,255,0.72)', '--tabBorder': dark ? 'rgba(255,255,255,0.07)' : rgba(s.text, 0.08),
      '--scrim': dark ? 'rgba(0,0,0,0.50)' : 'rgba(18,17,26,0.28)', '--scrimSolid': dark ? 'rgba(0,0,0,0.62)' : 'rgba(18,17,26,0.40)',
      '--panel': dark ? rgba(mix(s.surface, '#FFFFFF', 0.03), 0.94) : 'rgba(255,255,255,0.96)', '--panelHead': dark ? rgba(mix(s.surface, '#FFFFFF', 0.03), 0.94) : 'rgba(255,255,255,0.96)',
      '--panelBorder': dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)', '--panelShadow': dark ? '0 24px 48px -12px rgba(0,0,0,0.6)' : `0 24px 48px -12px ${rgba(s.text, 0.28)}`,
      '--glassStrong': dark ? rgba(card, 0.84) : 'rgba(255,255,255,0.82)', '--toastShadow': dark ? '0 8px 24px -6px rgba(0,0,0,0.5)' : `0 8px 24px -6px ${rgba(s.text, 0.18)}`,
      ...Object.fromEntries(Object.entries(sem).map(([k, v]) => ['--' + k, v])),
    };
  }

  // ---------------- state ----------------
  const sysDark = () => !!(matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  const S = {
    db: E.sample(), theme: qs.get('t') || 'indigo', appearance: qs.get('m') || 'system', font: qs.get('f') || 'manrope',
    device: qs.get('d') || (fit ? (isIos ? 'iphone' : 'android') : 'iphone'), w: qs.get('w') || '390', name: qs.has('name') ? qs.get('name') : 'Rina', email: 'rina@example.com',
    tab: 'home', prevTab: 'home', stack: [], filter: 'all', q: '', qApplied: '', dd: false, showSettled: false,
    period: 'month', tip: null, cur: 'PHP', calMonth: null, calDay: null, photo: null, personPhotos: {}, custom: { method: [], wallet: [] },
    qrs: [
      { id: 'q1', personKey: 'tita merly', label: 'GCash', wallet: 'GCash', account: 'Merly S.', seed: 11, img: null, addedOn: '2026-05-04' },
      { id: 'q2', personKey: 'online lending app', label: 'Bank deposit', wallet: 'Bank', account: 'Online lending app', seed: 23, img: null, addedOn: '2026-10-12' },
      { id: 'q3', personKey: 'dental clinic', label: 'Maya', wallet: 'Maya', account: 'Dental clinic', seed: 37, img: null, addedOn: '2026-04-30' },
    ],
    gate: qs.get('s') ? null : 'loading', pin: '', pinMsg: '', tries: 5, overdue: qs.get('od') !== '0', sounds: true, haptic: true, f: {},
  };
  const mode = () => (S.appearance === 'system' ? (sysDark() ? 'dark' : 'light') : S.appearance);
  const phone = document.getElementById('phone');
  const layer = () => phone.querySelector('.layer');
  function setData() { S.db = E.sample(); if (!S.overdue) { const d = S.db.debts.find((x) => x.id === 'd5'); d.lines.push({ id: 'lx', kind: 'payment', amt: 356250, date: '2026-10-15', method: 'Maya', note: '' }); } }
  setData();
  const find = (id) => S.db.debts.find((d) => d.id === id && !d.deleted);
  const qrOf = (personName) => S.qrs.find((q) => q.personKey === E.personKey(personName));
  const nameOf = (key) => { const p = E.people(base()).find((x) => x.key === key); return p ? p.name : key; };
  // a decorative QR-like pattern (random squares + three corner marks); it encodes nothing
  function fakeQr(seed, size = 200) {
    let a = seed >>> 0; const rnd = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const N = 25, cell = 1; let r = '';
    const finder = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7" fill="#111"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="#111"/>`;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const inF = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9); if (!inF && rnd() > 0.52) r += `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="#111"/>`; }
    return `<svg viewBox="-2 -2 ${N + 4} ${N + 4}" width="${size}" height="${size}" role="img" aria-label="Sample QR code (decorative)" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${N + 4}" height="${N + 4}" fill="#fff"/>${r}${finder(0, 0)}${finder(N - 7, 0)}${finder(0, N - 7)}</svg>`;
  }
  const qrPic = (q, size) => (q.img ? `<img src="${q.img}" alt="QR code for ${esc(nameOf(q.personKey))}" width="${size}" height="${size}" style="object-fit:contain;background:#fff;border-radius:8px">` : fakeQr(q.seed, size));
  let uid = 100;
  const nid = (p) => p + ++uid;

  function applyTheme() {
    const v = themeVars(S.theme, mode());
    for (const [k, val] of Object.entries(v)) phone.style.setProperty(k, val);
    phone.style.setProperty('--font', FONTS[S.font].css);
    const ios = S.device === 'iphone', small = S.w === '360';
    // fit: the real phone draws its own status bar and the page is already kept clear of its edges
    const top = fit ? 8 : ios ? (small ? 24 : 47) : 28, bottom = fit ? 0 : ios ? (small ? 8 : 34) : 12;
    phone.style.setProperty('--safe-top', top + 'px');
    phone.style.setProperty('--safe-bottom', bottom + 'px');
    phone.style.setProperty('--tabbar', 64 + bottom + 'px');
    phone.dataset.device = S.device; phone.dataset.w = S.w; phone.dataset.mode = mode();
    M.prefs.sound = S.sounds; M.prefs.haptic = S.haptic && S.device === 'android';
    html.style.colorScheme = mode();
  }

  // ---------------- icons (one stroke set) ----------------
  const P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    debts: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
    cal: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    chart: '<path d="M6 20V11M12 20V4M18 20v-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>', left: '<path d="m15 18-6-6 6-6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>', plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    more: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    coins: '<circle cx="9" cy="9" r="6"/><path d="M15.5 9.5a6 6 0 1 1-6 6"/>', sound: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
    vib: '<rect x="8" y="3" width="8" height="18" rx="2"/><path d="M4 8v8M20 8v8"/>', box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/>', hist: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h4v4h-4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2.5"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>', back: '<path d="M21 5H9l-7 7 7 7h12z"/><path d="m18 9-6 6M12 9l6 6"/>', alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  };
  const ic = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

  // ---------------- small helpers ----------------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fShort = (s) => `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}`;
  const fLong = (s) => `${fShort(s)}, ${s.slice(0, 4)}`;
  const fMonth = (m) => `${MONTH[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const fDay = (s) => `${WD[new Date(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10))).getUTCDay()]}, ${fLong(s)}`;
  // Erina fix 12: a field-styled button in the app's date style. The native input lies invisibly on top, so a tap opens
  // the phone's own picker on iPhone and Android; desktop browsers get showPicker().
  const dateBtn = (id, f, value, attrs = '', empty = 'Pick a date') => `<div class="inp datefld"><span class="grow ${value ? '' : 'muted'}">${value ? fDay(value) : esc(empty)}</span>${ic('cal', 'muted')}<input id="${id}" type="date" class="dnative" data-a="pickdate" data-f="${f}" value="${value || ''}" ${attrs} aria-label="${empty === 'No due date' ? 'Due by' : 'Date'}"></div>`;
  const fList = (a) => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
  // the avatar: the person's own photo when they added one, else their initials
  const avatarIn = (size = 44) => (S.photo ? `<img class="avphoto" src="${S.photo}" alt="" width="${size}" height="${size}">` : esc(initials(S.name || 'P')));
  // a person's avatar: their photo when one was added, else their initials
  const pav = (name, cls = '') => { const ph = S.personPhotos[E.personKey(name)]; return ph ? `<span class="av${cls}" style="overflow:hidden"><img class="avphoto" src="${ph}" alt=""></span>` : `<span class="av${cls}">${esc(initials(name))}</span>`; };
  // the same, but tappable: opens the picture picker for that person (their page, a debt's header)
  const pavEdit = (name, cls, id) => { const key = E.personKey(name), ph = S.personPhotos[key]; return `<label class="av${cls} press avedit" for="${id}" aria-label="${ph ? 'Change' : 'Add'} a photo for ${esc(name)}" style="overflow:hidden;cursor:pointer">${ph ? `<img class="avphoto" src="${ph}" alt="">` : esc(initials(name))}<span class="camb" aria-hidden="true">${ic('image')}</span></label><input id="${id}" type="file" accept="image/*" data-person="${esc(key)}" class="personphoto" hidden>`; };
  const initials = (n) => { const w = n.trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
  const kindLabel = (k) => ({ one_time: 'One-time', installments: 'Installment', recurring: 'Recurring' })[k];
  const timeLabel = (t) => { const [h, mi] = t.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(mi).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
  const pill = (state) => (state === 'overdue' ? '<span class="pill over">Overdue</span>' : state === 'today' ? '<span class="pill today">Due today</span>' : state === 'settled' ? '<span class="pill settled">Settled</span>' : '');
  const greeting = () => { const h = new Date().getHours(); return h >= 5 && h < 12 ? 'Good morning' : h >= 12 && h < 18 ? 'Good afternoon' : 'Good evening'; };
  const toggle = (on, a, label, extra = '') => `<button class="sw-toggle" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-a="${a}" ${extra}><i></i></button>`;
  const seg = (name, value, opts) => `<div class="seg" role="radiogroup" data-seg="${name}">${opts.map(([k, l]) => `<button role="radio" aria-checked="${k === value}" data-a="seg" data-name="${name}" data-v="${k}">${l}</button>`).join('')}<span class="thumb"></span></div>`;
  const top = (title, opt = {}) => `<div class="hdr">${opt.back ? `<button class="back" data-a="back" aria-label="Back">${ic('left')}<span>${esc(opt.back)}</span></button>` : `<span class="logo" aria-hidden="true"><img src="${ASSET.small}" alt=""></span>`}<div class="grow">${title ? `<div class="${opt.back ? 't-sec' : 't-title'} ell">${esc(title)}</div>` : ''}${opt.sub ? `<div class="t-meta muted ell">${esc(opt.sub)}</div>` : ''}</div>${opt.right || (opt.back ? '' : `<button class="avatarbtn" data-a="settings" aria-label="Settings">${avatarIn()}</button>`)}</div>`;

  // ---------------- screens ----------------
  function home() {
    const h = E.home(base(), S.db.cash);
    const name = (S.name || '').trim().split(/\s+/)[0];
    const hasCash = h.income || h.expenses;
    const duePct = h.dueThisMonth ? Math.round((h.dueThisMonthPaid * 100) / h.dueThisMonth) : 0;
    return `<div class="screen" data-scr="home"><div class="wash"></div><div class="page z homefit">
      <div class="hdr"><span class="logo" aria-hidden="true"><img src="${ASSET.small}" alt=""></span>
        <div class="grow"><div class="t-greet ell">${esc(greeting())}${name ? ', ' + esc(name) : ''}</div><div class="t-meta muted">${fMonth(TODAY.slice(0, 7))}</div></div>
        <button class="avatarbtn press" data-a="settings" aria-label="Settings">${avatarIn()}</button></div>
      <button class="hero press" data-a="tab" data-tab="debts" aria-label="Total I owe, open My debts"><span class="mesh" aria-hidden="true"></span>
        <span class="tap">${ic('right', 'sm')}</span>
        <div class="t-meta mog">Total I owe</div>
        <div class="t-hero money" data-count="${h.owed}" data-key="home.owed">${money(h.owed)}</div>
        <div class="t-meta mog">${h.activeCount} active ${h.activeCount === 1 ? 'debt' : 'debts'}</div></button>
      <div class="tiles">
        <button class="gcard press" data-a="due" aria-label="Due this month"><span class="tap">${ic('right', 'sm')}</span>
          <div class="t-meta muted">Due this month</div><div class="t-card money mt4" data-count="${h.dueThisMonth}" data-key="home.due" data-delay="60">${money(h.dueThisMonth)}</div>
          <div class="t-cap amber mt4 money">${money(h.dueThisMonth - h.dueThisMonthPaid)} left</div><div class="t-cap muted money">${money(h.dueThisMonthPaid)} paid</div><div class="tbar"><div class="fill" data-pct="${duePct}" style="width:${duePct}%"></div></div></button>
        <button class="gcard press" data-a="paid" aria-label="Paid this month"><span class="tap">${ic('right', 'sm')}</span>
          <div class="t-meta muted">Paid this month</div><div class="t-card money mt4" data-count="${h.paidThisMonth}" data-key="home.paid" data-delay="120">${money(h.paidThisMonth)}</div>
          <div class="t-cap ok mt4">${h.paidRows.length} ${h.paidRows.length === 1 ? 'payment' : 'payments'}</div></button>
      </div>
      ${h.overdueCount ? `<button class="overdue press" data-a="overdue">${ic('alert', 'sm')}<span class="grow">Overdue · ${h.overdueCount} ${h.overdueCount === 1 ? 'debt' : 'debts'} · <span class="money">${money(h.overdueAmount)}</span></span>${ic('right', 'sm')}</button>` : ''}
      <div class="gcard cashcard">
        <div class="between"><div class="t-sec">Monthly cash flow</div><button class="linkbtn" data-a="cash">Edit</button></div>
        ${hasCash ? `
          <div class="cashrows"><div class="cashrow"><span>Income</span><span class="money" data-count="${h.income}" data-key="home.inc" data-delay="180">${money(h.income)}</span></div>
          <div class="cashrow"><span>Expenses</span><span class="money" data-count="${h.expenses}" data-key="home.exp" data-delay="180">${money(h.expenses)}</span></div>
          <div class="cashrow"><span>Debt payments</span><span class="money" data-count="${h.paidThisMonth}" data-key="home.debtpay" data-delay="180">${money(h.paidThisMonth)}</span></div></div>
          <div class="remain"><span class="t-row">Cash remaining</span><span class="money" data-count="${h.cashRemaining}" data-key="home.cash" data-delay="240">${money(h.cashRemaining)}</span></div>`
          : `<p class="t-body muted" style="margin:8px 0 0">Add this month’s income and expenses to see what is left after debt payments.</p>`}
      </div>
    </div></div>`;
  }

  // inPerson: on a person's own page the row leads with what the debt is for (the name is already the page title)
  function debtRow(d, inPerson) {
    const c = E.calc(d), rec = d.kind === 'recurring';
    const sub = c.state === 'settled' ? (d.settledOn ? `Settled ${fShort(d.settledOn)}` : 'Settled') : c.next ? `Next ${fShort(c.next.due)}` : d.kind === 'one_time' && !d.due ? 'Pay when I can' : '';
    // Erina fix 3: left = who + what; right = "₱x left" over the next date (or the pill); a 3px bar under the text
    const main = inPerson ? d.title || kindLabel(d.kind) : d.person;
    const label = inPerson ? kindLabel(d.kind) : d.title;
    const right2 = pill(c.state) || `<span class="t-meta muted">${esc(rec ? 'every month' : sub)}</span>`;
    return `<button class="li press" data-a="open" data-id="${d.id}">${inPerson ? '' : `${pav(d.person, '')}`}
      <div class="grow"><div class="t-row ell">${esc(main)}</div><div class="t-meta muted ell">${esc(label)}</div>${rec || c.state === 'settled' ? '' : `<div class="rowbar"><span style="width:${c.pct}%"></span></div>`}</div>
      <div class="r"><div class="t-row money">${money(rec ? d.amount : c.remaining)}${rec || c.state === 'settled' ? '' : ' <span class="muted" style="font-weight:500">left</span>'}</div><div class="mt4">${right2}</div></div></button>`;
  }

  function debts() {
    const all = base().filter((d) => !d.deleted);
    const act = all.filter((d) => E.calc(d).state !== 'settled'), settled = all.filter((d) => E.calc(d).state === 'settled');
    const needle = S.qApplied.trim().toLowerCase();
    const shown = (S.showSettled ? settled : act).filter((d) => (S.filter === 'all' || S.filter === 'overdue' ? true : d.kind === S.filter) && (S.filter !== 'overdue' || E.calc(d).state === 'overdue') && (!needle || `${d.person} ${d.title}`.toLowerCase().includes(needle)));
    const chip = (k, l) => `<button class="chip" aria-pressed="${S.filter === k}" data-a="filter" data-v="${k}">${l}</button>`;
    return `<div class="screen" data-scr="debts"><div class="page">
      ${top(S.showSettled ? 'Settled debts' : 'My debts', { right: `<button class="iconbtn press" data-a="qrgallery" aria-label="Payment QR codes" style="background:var(--soft)">${ic('qr')}</button><button class="iconbtn press" data-a="add" aria-label="Add debt" style="background:var(--fill);color:#fff;width:44px">${ic('plus')}</button><button class="avatarbtn press" data-a="settings" aria-label="Settings">${avatarIn()}</button>` })}
      <div class="search"><div class="inp">${ic('search', 'muted')}<input data-f="q" value="${esc(S.q)}" placeholder="Search people or debts" aria-label="Search people or debts" autocomplete="off" enterkeyhint="search"><button class="iconbtn" data-a="ddtoggle" aria-label="Show all people and debts" aria-expanded="${S.dd}">${ic('down')}</button></div><div id="ddhost">${S.dd ? searchDD() : ''}</div></div>
      <div class="chips wrapchips mt12"${S.dd ? ' style="visibility:hidden"' : ''}>${chip('all', 'All')}${chip('one_time', 'One-time')}${chip('installments', 'Installment')}${chip('recurring', 'Recurring')}${chip('overdue', 'Overdue')}</div>
      ${S.qApplied ? `<div class="between mt12"><span class="t-meta muted">Showing “${esc(S.qApplied)}”</span><button class="linkbtn" data-a="clearq">Clear</button></div>` : ''}
      <div class="list mt12">${shown.length ? shown.map((d) => debtRow(d)).join('') : `<div class="empty">${S.showSettled ? 'No settled debts yet.' : 'Nothing matches. Try another name.'}</div>`}</div>
      <div style="text-align:center" class="mt8">${S.showSettled ? `<button class="linkbtn" data-a="settled" data-v="0">Back to active debts</button>` : settled.length ? `<button class="linkbtn" data-a="settled" data-v="1">View settled debts (${settled.length})</button>` : ''}</div>
    </div></div>`;
  }

  function hl(text, needle) {
    if (!needle) return esc(text);
    const i = text.toLowerCase().indexOf(needle);
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + '<b>' + esc(text.slice(i, i + needle.length)) + '</b>' + esc(text.slice(i + needle.length));
  }
  function searchDD() {
    const n = S.q.trim().toLowerCase();
    const ppl = E.people(base());
    if (!n) {
      return `<div class="dd" role="listbox" aria-label="People"><div class="grp">People</div>${ppl.slice(0, 5).map((p) => `<button class="opt" data-a="person" data-key="${esc(p.key)}">${pav(p.name, ' s36')}<span class="grow"><span class="t-row ell" style="display:block">${esc(p.name)}</span><span class="t-meta muted">${p.debts.length} ${p.debts.length === 1 ? 'debt' : 'debts'} · ${money(p.remaining)}</span></span></button>`).join('')}<button class="opt add" data-a="allpeople">All people (${ppl.length}) ${ic('right', 'sm')}</button></div>`;
    }
    const pm = ppl.filter((p) => p.name.toLowerCase().includes(n)).slice(0, 3);
    const dm = base().filter((d) => !d.deleted && `${d.title} ${d.person}`.toLowerCase().includes(n)).slice(0, 6 - pm.length);
    if (!pm.length && !dm.length) return `<div class="dd"><div class="empty">No person or debt called “${esc(S.q)}”.</div></div>`;
    return `<div class="dd" role="listbox">${pm.length ? `<div class="grp">People</div>${pm.map((p) => `<button class="opt" data-a="person" data-key="${esc(p.key)}">${pav(p.name, ' s36')}<span class="grow"><span class="t-row ell" style="display:block">${hl(p.name, n)}</span><span class="t-meta muted">${p.debts.length} ${p.debts.length === 1 ? 'debt' : 'debts'} · ${money(p.remaining)}</span></span></button>`).join('')}` : ''}${dm.length ? `<div class="grp">Debts</div>${dm.map((d) => `<button class="opt" data-a="open" data-id="${d.id}"><span class="grow"><span class="t-row ell" style="display:block">${hl(d.title, n)}</span><span class="t-meta muted">${hl(d.person, n)} · ${kindLabel(d.kind)}</span></span><span class="t-meta money">${money(E.calc(d).remaining)}</span></button>`).join('')}` : ''}</div>`;
  }

  function schedule() {
    const m = S.calMonth || TODAY.slice(0, 7);
    const rows = [];
    for (const d of base().filter((x) => !x.deleted)) {
      const c = E.calc(d);
      if (c.state === 'settled' && !(d.settledOn && d.settledOn.startsWith(m))) continue;
      for (const s of c.statuses) if (d.kind !== 'one_time' || d.due) rows.push({ d, s, state: s.short === 0 ? 'paid' : s.due < TODAY ? 'over' : s.due === TODAY ? 'today' : 'up' });
    }
    const inMonth = rows.filter((r) => r.s.due.startsWith(m)).sort((a, b) => a.s.due.localeCompare(b.s.due));
    const byDay = new Map();
    for (const r of inMonth) { const k = r.s.due; if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(r); }
    const left = inMonth.reduce((n, r) => n + r.s.short, 0);
    const first = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1)), lead = first.getUTCDay();
    const days = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<span></span>');
    for (let d = 1; d <= days; d++) {
      const iso = `${m}-${String(d).padStart(2, '0')}`, items = byDay.get(iso) || [];
      const dots = [...new Set(items.map((r) => r.state))].sort((a, b) => ['over', 'today', 'up', 'paid'].indexOf(a) - ['over', 'today', 'up', 'paid'].indexOf(b)).slice(0, 3);
      const label = `${fLong(iso)}${items.length ? ': ' + items.length + (items.length === 1 ? ' payment' : ' payments') : ''}`;
      cells.push(`<button class="cday${iso === TODAY ? ' today' : ''}${S.calDay === iso ? ' sel' : ''}${items.length ? '' : ' none'}" data-a="calday" data-v="${iso}" aria-label="${label}" aria-pressed="${S.calDay === iso}"><span class="n">${d}</span><span class="dots">${dots.map((s) => `<i class="dot ${s}"></i>`).join('')}</span></button>`);
    }
    const list = S.calDay ? byDay.get(S.calDay) || [] : inMonth;
    const row = ({ d, s, state }) => `<button class="li press" data-a="open" data-id="${d.id}"><div style="width:44px;text-align:center"><div class="t-cap muted">${MON[+s.due.slice(5, 7) - 1]}</div><div class="t-sec">${+s.due.slice(8, 10)}</div></div><div class="grow"><div class="t-row ell ${state === 'paid' ? 'muted' : ''}">${esc(d.person)}</div><div class="t-meta muted ell">${esc(d.title)}${s.charge ? ' · late fee' : ''}</div></div><div class="r"><div class="t-row money ${state === 'paid' ? 'muted' : ''}">${money(state === 'paid' ? s.amt : s.short)}</div><div class="mt4">${state === 'paid' ? '<span class="pill settled">Paid</span>' : pill(state === 'over' ? 'overdue' : state === 'today' ? 'today' : '')}</div></div></button>`;
    return `<div class="screen" data-scr="schedule"><div class="page">${top('Schedule')}
      <div class="card calcard"><div class="between"><button class="iconbtn press" data-a="calnav" data-v="-1" aria-label="Previous month">${ic('left')}</button><div style="text-align:center"><div class="t-sec">${fMonth(m)}</div><div class="t-meta muted"><span class="money">${money(left)}</span> left</div></div><button class="iconbtn press" data-a="calnav" data-v="1" aria-label="Next month">${ic('right')}</button></div>
        <div class="cal mt8" role="grid" aria-label="${fMonth(m)}">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((w) => `<span class="wd">${w}</span>`).join('')}${cells.join('')}</div>
        <div class="legendline mt12" style="justify-content:center"><span><i class="dot over"></i>Overdue</span><span><i class="dot today"></i>Today</span><span><i class="dot up"></i>Coming up</span><span><i class="dot paid"></i>Paid</span></div></div>
      <div class="sechead"><div class="t-sec">${S.calDay ? fDay(S.calDay) : 'All of ' + MONTH[+m.slice(5, 7) - 1]}</div>${S.calDay ? '<button class="linkbtn" data-a="calday" data-v="' + S.calDay + '">Whole month</button>' : ''}</div>
      <div class="list">${list.length ? list.map(row).join('') : `<div class="empty">${S.calDay ? 'Nothing due on this day.' : 'Nothing due this month.'}</div>`}</div>
    </div></div>`;
  }

  // ---------- Reports: two summary cards and four charts (Erina §7) ----------
  const PERIODS = [['week', 'This week'], ['month', 'This month'], ['last_month', 'Last month'], ['3m', '3 months'], ['6m', '6 months'], ['year', 'This year'], ['custom', 'Custom…']];
  const periodPhrase = () => ({ week: 'this week', month: 'this month', last_month: 'last month', '3m': 'in 3 months', '6m': 'in 6 months', year: 'this year', custom: 'in this period' })[S.period];
  function reports() {
    const range = E.period(S.period === 'custom' ? 'month' : S.period);
    const r = E.report(base(), S.db.cash, range);
    const short = r.months.length < 3;
    const monthsTxt = short ? 'Last 6 months' : PERIODS.find((p) => p[0] === S.period)[1];
    const W = 326, H = 120;
    // line: remaining at each month end
    const tmax = Math.max(1, ...r.trend.map((t) => t.remaining)), step = W / Math.max(1, r.trend.length - 1);
    const pts = r.trend.map((t, i) => [i * step, H - 12 - ((H - 28) * t.remaining) / tmax]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L ${W} ${H - 12} L 0 ${H - 12} Z`;
    // creditor bars
    const cred = r.byPerson.slice(0, 5), others = r.byPerson.slice(5).reduce((n, p) => n + p.amt, 0);
    if (others) cred.push({ name: 'Others', amt: others });
    const cmax = Math.max(1, ...cred.map((c) => c.amt));
    // income split
    const imax = Math.max(1, ...r.monthly.map((m) => Math.max(m.income, m.expenses + m.paid)));
    const bw = 30, gap = (W - bw * r.monthly.length) / Math.max(1, r.monthly.length - 1), BH = 130;
    const y = (v) => (BH * v) / imax;
    const tipM = S.tip && r.monthly.find((m) => m.m === S.tip);
    const ring = (pct) => { const R = 30, len = 2 * Math.PI * R, off = len * (1 - pct / 100); return `<svg class="ring" width="72" height="72" viewBox="0 0 72 72" aria-label="${pct}% paid" data-chart="ring"><circle class="bg" cx="36" cy="36" r="${R}" fill="none" stroke-width="7"/><circle class="fg gring" cx="36" cy="36" r="${R}" fill="none" stroke-width="7" stroke-dasharray="${len.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}" data-len="${len.toFixed(2)}" data-off="${off.toFixed(2)}" transform="rotate(-90 36 36)"/><text x="36" y="41" text-anchor="middle" style="font-size:15px;font-weight:600;fill:var(--text)">${pct}%</text></svg>`; };
    const cashMonth = short ? `${MONTH[+range.to.slice(5, 7) - 1]} (monthly figures)` : monthsTxt;
    const cm = short ? (S.db.cash[range.to.slice(0, 7)] || { income: 0, expenses: 0 }) : { income: r.income, expenses: r.expenses };
    const cmPaid = short ? r.monthly.find((m) => m.m === range.to.slice(0, 7))?.paid || 0 : r.debtPaid;
    return `<div class="screen" data-scr="reports"><div class="wash"></div><div class="page z">${top('Reports')}
      <div class="sticky"><div class="search"><button class="inp periodbtn press" data-a="periodopen" aria-expanded="${!!S.periodOpen}"><span class="t-meta muted">Period</span><span class="grow t-row">${PERIODS.find((p) => p[0] === S.period)[1]}</span>${ic('down', 'muted')}</button>${S.periodOpen ? `<div class="dd" role="listbox" aria-label="Period">${PERIODS.map(([k, l]) => `<button class="opt" role="option" aria-selected="${S.period === k}" data-a="period" data-v="${k}"><span class="grow t-row">${l}</span>${S.period === k ? ic('check') : ''}</button>`).join('')}</div>` : ''}</div></div>
      <div class="gcard mt8"><div class="row" style="align-items:center"><div class="grow">
        <div class="t-meta muted">Remaining</div><div class="t-pop money" data-count="${r.remaining}" data-key="rep.remaining">${money(r.remaining)}</div>
        <div class="t-meta muted mt4"><span class="money" style="color:var(--text)">${money(r.totalPaidAll)}</span> paid of <span class="money">${money(r.totalOwed)}</span></div><div class="t-meta muted"><span class="money" style="color:var(--text)">${money(r.debtPaid)}</span> paid ${esc(periodPhrase())}</div></div>${ring(r.progressPct)}</div></div>
      <div class="card mt12"><div class="between"><div class="t-sec">Debt over time</div><span class="t-cap muted">${short ? 'Last 6 months' : monthsTxt}</span></div>
        <div class="chart" data-chart="trend"><svg viewBox="0 0 ${W} ${H + 16}" aria-label="Remaining debt at each month end"><path class="garea" d="${area}"/><line class="axis" x1="0" x2="${W}" y1="${H - 12}" y2="${H - 12}"/><path class="gline" d="${line}"/>${pts.map((p, i) => `<text x="${p[0]}" y="${H + 8}" text-anchor="${i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}">${MON[+r.trend[i].m.slice(5, 7) - 1]}</text>`).join('')}<circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="4" fill="var(--accent)"/></svg></div>
        <div class="t-meta muted">${(() => { const a = r.trend[0].remaining, b = r.trend[r.trend.length - 1].remaining; return b <= a ? `Down ${money(a - b)} since ${MON[+r.trend[0].m.slice(5, 7) - 1]}` : `Up ${money(b - a)} since ${MON[+r.trend[0].m.slice(5, 7) - 1]}: new debts were added`; })()}</div></div>
      <div class="card mt12"><div class="t-sec">Debt by person</div><div class="chart" data-chart="cred" style="display:grid;gap:12px">${cred.map((c) => `<div class="hbar"><span class="t-meta ell">${esc(c.name)}</span><span class="t-meta money">${money(c.amt)}</span><div class="track"><span class="gbar" data-dir="x" style="width:${((c.amt * 100) / cmax).toFixed(1)}%"></span></div></div>`).join('')}</div></div>
      <div class="gcard mt12"><div class="t-meta muted">Cash remaining · ${esc(cashMonth)}</div><div class="t-pop money" data-count="${cm.income - cm.expenses - cmPaid}" data-key="rep.cash">${money(cm.income - cm.expenses - cmPaid)}</div>
        <div class="row mt8" style="gap:16px;flex-wrap:wrap"><span class="t-meta muted">Income <span class="money" style="color:var(--text)">${money(cm.income)}</span></span><span class="t-meta muted">Expenses <span class="money" style="color:var(--text)">${money(cm.expenses)}</span></span><span class="t-meta muted">Debt payments <span class="money" style="color:var(--text)">${money(cmPaid)}</span></span></div></div>
      <div class="card mt12"><div class="between"><div class="t-sec">Income, spending and debt</div><span class="t-cap muted">${short ? 'Last 6 months' : monthsTxt}</span></div>
        <div class="t-meta mt4" style="min-height:36px">${tipM ? `<b>${MONTH[+tipM.m.slice(5, 7) - 1]}:</b> income <span class="money">${money(tipM.income)}</span> · spent <span class="money">${money(tipM.expenses)}</span> · debts <span class="money">${money(tipM.paid)}</span> · left <span class="money">${money(tipM.income - tipM.expenses - tipM.paid)}</span>` : '<span class="muted">Tap a month to see the exact amounts.</span>'}</div>
        <div class="chart" data-chart="split"><svg viewBox="0 0 ${W} ${BH + 22}" aria-label="Income split per month">${r.monthly.map((m, i) => {
          const x = i * (bw + gap), base = BH, ex = y(m.expenses), pd = y(m.paid), left = Math.max(0, y(m.income) - ex - pd), over = Math.max(0, ex + pd - y(m.income));
          const sel = S.tip === m.m ? ' stroke="var(--text)" stroke-width="1.5"' : '';
          return `<g data-a="tip" data-v="${m.m}" style="cursor:pointer"><rect x="${x - gap / 2}" y="0" width="${bw + gap}" height="${BH + 22}" fill="transparent"/>
            <rect class="gbar" x="${x}" y="${base - ex}" width="${bw}" height="${ex}" rx="3" fill="${mode() === 'dark' ? '#4A4858' : '#B9B7C6'}"${sel}/>
            <rect class="gbar" x="${x}" y="${base - ex - pd}" width="${bw}" height="${pd}" fill="var(--fill)"/>
            <rect class="gbar" x="${x}" y="${base - ex - pd - left}" width="${bw}" height="${left}" rx="3" fill="var(--ok)"/>
            ${over ? `<rect class="gbar" x="${x}" y="${base - ex - pd}" width="${bw}" height="${over}" fill="var(--danger)"/>` : ''}
            <text x="${x + bw / 2}" y="${BH + 16}" text-anchor="middle">${MON[+m.m.slice(5, 7) - 1]}</text></g>`;
        }).join('')}<line class="axis" x1="0" x2="${W}" y1="${BH}" y2="${BH}"/></svg></div>
        <div class="legendline mt8"><span><i style="background:var(--ok)"></i>Left</span><span><i style="background:var(--fill)"></i>Debt payments</span><span><i style="background:${mode() === 'dark' ? '#4A4858' : '#B9B7C6'}"></i>Expenses</span></div></div>
    </div></div>`;
  }

  // ---------- payment QR codes ----------
  function qrGallery() {
    return `<div class="screen pushed" data-scr="qr"><div class="page">${top('Payment QR codes', { back: 'Back' })}
      <p class="t-meta muted" style="margin:0 4px 12px">One QR per person you pay. Every debt with that person, new ones too, uses it.</p>
      <div class="list">${S.qrs.map((q) => `<button class="li press" data-a="qrshow" data-id="${q.id}"><span class="qrthumb">${qrPic(q, 44)}</span><div class="grow"><div class="t-row ell">${esc(nameOf(q.personKey))}</div><div class="t-meta muted ell">${esc(q.wallet)} · ${esc(q.account)}</div></div>${ic('right', 'sm chev')}</button>`).join('') || '<div class="empty">No QR codes yet. Add the one you pay each person with.</div>'}</div>
      ${(() => { const missing = E.people(base()).filter((p) => p.open && !qrOf(p.name)); return missing.length ? `<div class="sechead"><div class="t-sec">No QR yet</div></div><div class="list">${missing.map((p) => `<button class="li press" data-a="qradd" data-person="${esc(p.name)}">${pav(p.name, '')}<div class="grow"><div class="t-row ell">${esc(p.name)}</div><div class="t-meta muted">${money(p.remaining)} left</div></div><span class="t-meta" style="color:var(--accent);font-weight:600">Add QR</span></button>`).join('')}</div>` : ''; })()}
    </div></div>
    <div class="pinned"><button class="btn primary" data-a="qradd">${ic('plus')} Add a QR code</button></div>`;
  }
  function qrShow(id) {
    const q = S.qrs.find((x) => x.id === id); if (!q) return qrGallery();
    const name = nameOf(q.personKey);
    const debts = base().filter((d) => !d.deleted && E.personKey(d.person) === q.personKey && E.calc(d).state !== 'settled');
    const next = debts.map((d) => ({ d, c: E.calc(d) })).filter((x) => x.c.next).sort((a, b) => a.c.next.due.localeCompare(b.c.next.due))[0];
    const recent = E.daysBetween(q.addedOn, TODAY) <= 14;
    return `<div class="screen pushed qrscreen" data-scr="qrshow"><div class="page">${top('', { back: 'Back', right: `<button class="iconbtn press" data-a="qrmore" data-id="${q.id}" aria-label="More actions" style="color:#3B3A46">${ic('more')}</button>` })}
      ${recent ? `<div class="qrwarn">QR added on ${fLong(q.addedOn)}. If you didn't add it, don't pay with it.</div>` : ''}
      <div class="qrcard"><div class="t-meta" style="color:#5C5A6B">Pay</div><div class="t-greet" style="color:#16151F">${esc(name)}</div>
        <div class="qrbig">${qrPic(q, 248)}</div>
        <div class="t-row" style="color:#16151F">${esc(q.account)}</div><div class="t-meta" style="color:#5C5A6B">${esc(q.wallet)}${q.label && q.label !== q.wallet ? ' · ' + esc(q.label) : ''}</div>
        ${next ? `<div class="qrdue">Next due ${fShort(next.c.next.due)} · <span class="money">${money(next.c.next.short)}</span></div>` : ''}</div>
      <p class="t-meta muted" style="margin:12px 4px 0">Open your payment app and upload this image. Wallets read QR codes from your gallery.</p>
    </div></div>
    <div class="pinned"><div class="row" style="gap:10px"><button class="btn outline" data-a="qrsave" style="flex:1">Save or share</button>${next ? `<button class="btn primary" data-a="logpay" data-id="${next.d.id}" style="flex:1">Log payment</button>` : ''}</div></div>`;
  }
  function qrForm() {
    const f = S.f.qr, n = f.person.trim().toLowerCase();
    const ppl = E.people(base()).filter((p) => !n || p.name.toLowerCase().includes(n)).slice(0, 5);
    const has = qrOf(f.person);
    return `<div class="screen pushed" data-scr="qrform"><div class="page">${top(f.editId ? 'Edit QR code' : 'Add a QR code', { back: 'Back' })}
      <label class="qrpick press" for="qrin">${f.img ? `<img src="${f.img}" alt="Chosen QR picture" style="width:100%;height:100%;object-fit:contain">` : `${ic('image')}<span class="t-row">Choose the QR picture</span><span class="t-meta muted">A screenshot from their GCash, Maya or bank app</span>`}</label>
      <input id="qrin" type="file" accept="image/*" hidden>
      ${f.img ? '<div class="t-meta muted mt8" style="text-align:center">Name in the QR: shown here in the real app (Patas reads it), so you can check it before paying.</div>' : ''}
      <div class="fld search"><label class="lbl" for="qrwho">Who is it for?</label><div class="inp">${ic('user', 'muted')}<input id="qrwho" data-f="qr.person" value="${esc(f.person)}" placeholder="Search a person" autocomplete="off"><button class="iconbtn" data-a="qrwhodd" aria-label="Show everyone">${ic('down')}</button></div>
        <div>${f.whoOpen ? `<div class="dd">${ppl.map((p) => `<button class="opt" data-a="qrpickwho" data-v="${esc(p.name)}">${pav(p.name, ' s36')}<span class="grow"><span class="t-row" style="display:block">${hl(p.name, n)}</span><span class="t-meta muted">${qrOf(p.name) ? 'Has a QR · this replaces it' : p.open + ' open'}</span></span></button>`).join('')}</div>` : ''}</div>
        ${has && !f.editId ? `<div class="t-meta mt4" style="color:var(--peachInk)">${esc(nameOf(has.personKey))} already has a QR. Saving replaces it and shows a "QR changed" warning for 14 days.</div>` : f.person ? '<div class="t-meta muted mt4">Every debt with this person uses it, new ones too.</div>' : ''}</div>
      <div class="fld"><span class="lbl">Paid with</span>${namePicker('wallet', f.wallet)}</div>
      <div class="fld"><label class="lbl" for="qracct">Account name</label><div class="inp"><input id="qracct" data-f="qr.account" value="${esc(f.account)}" maxlength="60" placeholder="The name their payment app shows"></div></div>
    </div></div>
    <div class="pinned"><button class="btn primary" data-a="qrsavedone" ${f.person.trim() && f.account.trim() && (f.img || f.editId) ? '' : 'disabled'}>Save QR code</button></div>`;
  }

  // ---------- pushed screens ----------
  function debtDetail(id) {
    const d = find(id);
    const money = (c) => fmtCur(c, d ? d.cur || 'PHP' : 'PHP'); // this debt's own currency
    if (!d) return `<div class="screen pushed"><div class="page">${top('', { back: 'My debts' })}<div class="empty">That debt is not here any more.</div></div></div>`;
    const c = E.calc(d), rec = d.kind === 'recurring';
    const dates = E.reminderDates(d), r = d.remind;
    const remTxt = !r.on ? 'Off' : dates.length ? `${fList(dates.map(fShort))} at ${timeLabel(r.time)}` : (r.offsets || []).length ? `${r.offsets.map((o) => (o === 0 ? 'on the day' : o + (o === 1 ? ' day' : ' days') + ' before')).join(', ')} · ${timeLabel(r.time)}` : 'On';
    const pays = d.lines.filter((l) => !l.deleted && l.kind === 'payment').sort((a, b) => b.date.localeCompare(a.date));
    const person = E.people(base()).find((p) => p.key === E.personKey(d.person));
    return `<div class="screen pushed" data-scr="debt"><div class="page">
      ${top('', { back: S.stack.length > 1 ? 'Back' : 'My debts', right: `<button class="iconbtn press" data-a="more" aria-label="More actions">${ic('more')}</button>` })}
      <div class="row">${pavEdit(d.person, ' s48', 'dphoto')}<div class="grow"><div class="t-greet ell">${esc(d.person)}</div><div class="t-meta muted ell">${esc(d.title)} · ${kindLabel(d.kind)}</div></div>${pill(c.state)}</div>
      <div class="mt16">${rec ? `<div class="t-hero money">${money(d.amount)}</div><div class="t-body muted">every month${c.next ? ` · next ${fShort(c.next.due)}` : ''}</div>` : `<div class="t-hero money">${money(c.remaining)}</div><div class="t-body muted">remaining${(d.cur || 'PHP') !== S.cur ? ` · ${'≈ ' + fmtCur(conv(c.remaining, d.cur || 'PHP', S.cur), S.cur)}` : ''}</div>`}</div>
      ${c.state === 'overdue' ? `<div class="overdue" style="margin-top:12px">${ic('alert', 'sm')}<span class="grow">${money(c.statuses.filter((s) => s.short > 0 && s.due < TODAY).reduce((n, s) => n + s.short, 0))} was due ${fLong(c.next.due)}</span></div>` : ''}
      ${rec ? '' : `<div class="card mt12"><div class="between t-meta"><span><span class="money">${money(c.paid)}</span> of <span class="money">${money(c.owed)}</span> paid</span><span class="muted">${c.pct}%</span></div><div class="bar8 mt8"><div class="fill" data-pct="${c.pct}" style="width:${c.pct}%"></div></div></div>`}
      <div class="group mt12">
        <div class="gi"><button class="row grow" data-a="remind" style="min-height:52px;text-align:left">${ic('bell', 'muted')}<span class="grow"><span style="display:block" class="t-row">Reminder</span><span class="t-meta muted ell" style="display:block">${esc(remTxt)}</span></span></button>${toggle(r.on, 'remtoggle', 'Remind me about this debt')}</div>
        ${qrOf(d.person) ? '' : `<button class="gi press" data-a="qradd" data-person="${esc(d.person)}">${ic('qr', 'muted')}<span class="grow"><span style="display:block" class="t-row ell">Add ${esc(d.person)}’s payment QR</span><span class="t-meta muted">So paying is one tap next time</span></span>${ic('right', 'sm chev')}</button>`}
        <button class="gi press" data-a="person" data-key="${esc(E.personKey(d.person))}">${ic('hist', 'muted')}<span class="grow"><span style="display:block" class="t-row ell">History with ${esc(d.person)}</span><span class="t-meta muted">${person ? `${person.debts.length} ${person.debts.length === 1 ? 'debt' : 'debts'} · ${money(person.paid)} paid` : ''}</span></span>${ic('right', 'sm chev')}</button>
      </div>
      ${d.kind !== 'one_time' ? `<div class="sechead"><div class="t-sec">${rec ? 'Coming up' : 'Payment schedule'}</div></div><div class="list">${c.statuses.slice(rec ? Math.max(0, c.statuses.length - 6) : 0).map((s) => `<div class="li" style="min-height:56px"><div class="grow"><div class="t-row">${s.charge ? 'Late fee' : '#' + s.seq} · ${fShort(s.due)}</div><div class="t-meta ${s.status === 'overdue' ? 'rust' : s.status === 'paid' ? 'ok' : 'muted'}">${s.status === 'partly paid' ? money(s.short) + ' left' : s.status}</div></div><div class="t-row money">${money(s.amt)}</div></div>`).join('')}</div>` : ''}
      <div class="sechead"><div class="t-sec">Payments</div></div>
      <div class="list">${pays.length ? pays.map((l) => `<button class="li press" data-a="editpay" data-id="${d.id}" data-line="${l.id}"><div class="grow"><div class="t-row">${fLong(l.date)}</div><div class="t-meta muted">${esc(l.method || 'Payment')}${l.note ? ' · ' + esc(l.note) : ''}</div></div><div class="t-row money">${money(l.amt)}</div>${ic('right', 'sm chev')}</button>`).join('') : '<div class="empty">No payments yet.</div>'}</div>
    </div></div>
    ${c.state === 'settled' ? `<div class="pinned"><button class="btn outline" data-a="toast" data-v="Reopened (mockup)">Reopen debt</button></div>` : (qrOf(d.person) ? `<div class="pinned"><div class="row" style="gap:10px"><button class="btn outline" data-a="qrshow" data-id="${qrOf(d.person).id}" style="flex:1">${ic('qr')} Pay with QR</button><button class="btn primary" data-a="logpay" data-id="${d.id}" style="flex:1">Log payment</button></div></div>` : `<div class="pinned"><button class="btn primary" data-a="logpay" data-id="${d.id}">Log payment</button></div>`)}`;
  }

  function personScreen(key) {
    const p = E.people(base()).find((x) => x.key === key);
    if (!p) return `<div class="screen pushed"><div class="page">${top('', { back: 'Back' })}<div class="empty">Nobody by that name.</div></div></div>`;
    const led = E.ledger(base(), key);
    const chrono = led.slice().reverse(); let bal = 0; const balAfter = new Map();
    for (const r of chrono) { bal += r.kind === 'payment' ? -r.amt : r.amt; balAfter.set(r, bal); }
    const since = chrono.length ? chrono[0].date : TODAY;
    const pct = p.borrowed ? Math.floor((p.paid * 100) / p.borrowed) : 0;
    const act = p.debts.filter((d) => E.calc(d).state !== 'settled'), set = p.debts.filter((d) => E.calc(d).state === 'settled');
    const byM = new Map();
    for (const r of led) { const m = r.date.slice(0, 7); if (!byM.has(m)) byM.set(m, []); byM.get(m).push(r); }
    return `<div class="screen pushed" data-scr="person"><div class="page">${top('', { back: 'Back' })}
      <div class="row">${pavEdit(p.name, ' s56', 'pphoto')}<div class="grow"><div class="t-greet ell">${esc(p.name)}</div><div class="t-meta muted">${p.debts.length} ${p.debts.length === 1 ? 'debt' : 'debts'} · since ${MON[+since.slice(5, 7) - 1]} ${since.slice(0, 4)}</div>${S.personPhotos[p.key] ? `<button class="linkbtn" data-a="pphotodel" data-key="${esc(p.key)}" style="color:var(--danger);justify-content:flex-start;padding:0">Remove photo</button>` : ''}</div></div>
      <div class="card mt16"><div class="t-meta muted">Remaining</div><div class="t-pop money">${money(p.remaining)}</div>
        <div class="between mt8 t-row" style="font-weight:500"><span>Borrowed <span class="money" style="font-weight:600">${money(p.borrowed)}</span></span><span>Paid <span class="money" style="font-weight:600">${money(p.paid)}</span></span></div>
        <div class="bar8 mt8"><div class="fill" data-pct="${pct}" style="width:${pct}%"></div></div></div>
      ${(() => { const q = qrOf(p.name); return q ? `<button class="card mt12 press row" data-a="qrshow" data-id="${q.id}" style="width:100%;text-align:left"><span class="qrthumb">${qrPic(q, 52)}</span><span class="grow"><span class="t-row" style="display:block">Pay with QR</span><span class="t-meta muted">${esc(q.wallet)} · ${esc(q.account)}</span></span>${ic('right', 'sm chev')}</button>` : `<button class="card mt12 press row" data-a="qradd" data-person="${esc(p.name)}" style="width:100%;text-align:left"><span class="av">${ic('qr')}</span><span class="grow"><span class="t-row" style="display:block">Add their payment QR</span><span class="t-meta muted">Saved once, used for every debt with ${esc(p.name)}</span></span>${ic('right', 'sm chev')}</button>`; })()}
      <div class="mt12"><button class="btn outline" data-a="add" data-person="${esc(p.name)}">${ic('plus')} Borrow again</button></div>
      <div class="sechead"><div class="t-sec">Debts</div></div>
      <div class="list">${act.map((d) => debtRow(d, true)).join('') || '<div class="empty">No open debts.</div>'}</div>
      ${set.length ? `<details class="mt8"><summary class="linkbtn" style="list-style:none;cursor:pointer">Settled (${set.length})</summary><div class="list mt8">${set.map((d) => debtRow(d, true)).join('')}</div></details>` : ''}
      <div class="sechead"><div class="t-sec">History</div></div>
      ${[...byM].map(([m, rs]) => `<div class="mhead">${fMonth(m)}</div><div class="list">${rs.map((r) => { const b = balAfter.get(r); return `<div class="lrow"><div class="d">${fShort(r.date)}</div><div class="grow"><div class="between"><span class="t-row">${r.kind === 'payment' ? 'Paid' : r.kind === 'charge' ? 'Charge' : r.l && r.l.kind === 'addition' ? 'Borrowed more' : 'Borrowed'}</span><span class="t-row money ${r.kind === 'payment' ? 'ok' : ''}">${r.kind === 'payment' ? '−' : '+'} ${money(r.amt)}</span></div><div class="t-meta muted">${esc(r.d.title)}${r.l && r.l.method ? ' · ' + esc(r.l.method) : ''}${r.l && r.l.note ? ' · ' + esc(r.l.note) : ''} · <span class="money">${b < 0 ? 'ahead ' + money(-b) : 'balance ' + money(b)}</span></div></div></div>`; }).join('')}</div>`).join('')}
    </div></div>`;
  }

  const METHODS = ['Cash', 'GCash', 'Maya', 'Bank transfer'];
  const WALLETS = ['GCash', 'Maya', 'GoTyme', 'Bank'];
  // Chips for picking how a payment was made. "Other…" opens a small field to name it (BPI, Palawan…); the name is kept
  // and becomes a chip of its own. Past 6 chips, the rest move into a searchable "More…" list (Erina: chips stay one tap).
  function namePicker(kind, value) {
    const all = [...(kind === 'method' ? METHODS : WALLETS), ...S.custom[kind]];
    const shown = all.length > 6 ? all.slice(0, 5) : all;
    const hiddenSel = all.length > 6 && value && !shown.includes(value);
    const open = S.f.other && S.f.other.kind === kind;
    return `<div class="chips">${shown.map((m) => `<button class="chip" aria-pressed="${value === m}" data-a="pickname" data-kind="${kind}" data-v="${esc(m)}">${esc(m)}</button>`).join('')}${hiddenSel ? `<button class="chip" aria-pressed="true" data-a="pickname" data-kind="${kind}" data-v="${esc(value)}">${esc(value)}</button>` : ''}${all.length > 6 ? `<button class="chip" data-a="namemore" data-kind="${kind}">More…</button>` : ''}<button class="chip" aria-pressed="${open}" data-a="nameother" data-kind="${kind}">Other…</button></div>
      ${open ? `<div class="row mt8" style="gap:8px"><div class="inp grow"><input id="othername" data-f="other.text" value="${esc(S.f.other.text)}" maxlength="20" placeholder="${kind === 'method' ? 'e.g. BPI, Palawan, UnionBank' : 'e.g. ShopeePay, UnionBank'}" autocomplete="off" enterkeyhint="done"></div><button class="btn primary" data-a="nameadd" style="width:auto;padding:0 18px" ${S.f.other.text.trim() ? '' : 'disabled'}>Add</button></div>` : ''}`;
  }
  function logPay(id) {
    const d = find(id); if (!d) return debtDetail(id);
    const money = (c) => fmtCur(c, d.cur || 'PHP');
    const f = S.f.lp, c = E.calc(d);
    const canTick = d.kind !== 'one_time' && !f.editId;
    const open = c.statuses.filter((s) => s.short > 0);
    const sel = canTick && f.mode === 'ticks' ? E.tickUpTo(d, f.count - 1) : null;
    const amt = sel ? sel.total : parseMoney(f.amount);
    const cap = c.remaining + (f.editId ? (d.lines.find((l) => l.id === f.editId) || { amt: 0 }).amt : 0) + (d.kind === 'recurring' ? open.reduce((n, s) => n + s.short, 0) : 0);
    const err = sel ? (f.count ? '' : 'Tick at least one month.') : amt === null ? 'Enter an amount.' : amt <= 0 ? 'Enter an amount.' : amt > cap ? `That is more than the ${money(cap)} left.` : '';
    f.valid = !err && f.date && f.date <= TODAY;
    return `<div class="screen pushed" data-scr="logpay"><div class="page">${top(f.editId ? 'Edit payment' : 'Log payment', { back: 'Back', sub: `${d.person} · ${d.title}` })}
      ${canTick ? seg('lpmode', f.mode, [['ticks', d.kind === 'recurring' ? 'Months' : 'Installments'], ['custom', 'Custom amount']]) : ''}
      ${sel ? `
        <p class="t-meta muted" style="margin:12px 4px 0">Payments go to the oldest month first, so ticking a month also ticks the ones before it.</p>
        <div class="between mt12"><div class="t-sec">Unpaid</div><button class="linkbtn" data-a="tickall">${f.count === open.length ? 'Clear' : 'Select all'}</button></div>
        <div class="ticks mt8" role="group" aria-label="Months to pay">${open.slice(0, f.showAll ? open.length : f.count + 3).map((s, i) => `<button class="tick ${i < f.count ? 'on' : ''}" role="checkbox" aria-checked="${i < f.count}" data-a="tick" data-i="${i}"><span class="box"><i><svg viewBox="0 0 24 24">${P.check}</svg></i></span><span class="grow"><span class="t-row" style="display:block">${s.charge ? 'Late fee' : '#' + s.seq} · ${fShort(s.due)}</span>${s.covered ? `<span class="t-meta muted">${money(s.short)} left of ${money(s.amt)}</span>` : ''}</span>${s.status === 'overdue' ? '<span class="pill over">Overdue</span>' : ''}<span class="t-row money">${money(s.short)}</span></button>`).join('')}</div>
        ${!f.showAll && open.length > f.count + 3 ? `<button class="btn text" data-a="showmonths">Show ${open.length - f.count - 3} more ${open.length - f.count - 3 === 1 ? 'month' : 'months'}</button>` : ''}`
      : `
        <div class="fld"><label class="lbl" for="amt">Amount</label><div class="inp"><span class="pre">${esc(curSign(d.cur || 'PHP'))}</span><input id="amt" data-f="lp.amount" inputmode="decimal" value="${esc(f.amount)}" placeholder="0.00" autocomplete="off"></div>${f.amount && err ? `<div class="t-meta rust mt4">${err}</div>` : ''}</div>
        ${f.editId ? '' : `<div class="chips mt8">${c.next ? `<button class="chip" aria-pressed="${amt === c.next.short}" data-a="amt" data-v="${c.next.short}">Next due ${money(c.next.short)}</button>` : ''}${d.kind !== 'recurring' ? `<button class="chip" aria-pressed="${amt === c.remaining}" data-a="amt" data-v="${c.remaining}">Full balance ${money(c.remaining)}</button>` : ''}</div>`}`}
      <div class="fld"><label class="lbl" for="pdate">Payment date</label>${dateBtn('pdate', 'lp.date', f.date, 'max="${TODAY}"')}</div>
      <div class="fld"><span class="lbl">Method</span>${namePicker('method', f.method)}</div>
      <div class="fld"><label class="lbl" for="pnote">Note <span class="opt">(optional)</span></label><div class="inp"><input id="pnote" data-f="lp.note" value="${esc(f.note)}" maxlength="300" placeholder="Reference number, who received it…"></div></div>
      ${f.editId ? `<div class="mt16"><button class="btn dangertext" data-a="delpay" data-id="${d.id}" data-line="${f.editId}">Delete this payment</button></div>` : ''}
    </div></div>
    <div class="pinned">${sel ? `<div class="paybar"><div class="grow"><div class="t-meta muted">${f.count} selected</div><div class="t-card money" id="seltotal">${money(sel.total)}</div></div><button class="btn primary" data-a="savepay" ${f.valid ? '' : 'disabled'}>Pay selected</button></div>` : `<button class="btn primary" data-a="savepay" ${f.valid ? '' : 'disabled'}>${f.editId ? 'Save changes' : 'Save payment'}</button>`}</div>`;
  }

  function parseMoney(s) {
    const t = String(s || '').replace(/[,\s₱]/g, '');
    if (!t) return null;
    if (!/^\d{1,9}(\.\d{0,2})?$/.test(t)) return NaN;
    const [w, c = ''] = t.split('.');
    return Number(w) * 100 + Number((c + '00').slice(0, 2));
  }
  const toInput = (c) => (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Installments by count: every payment the same, rounding in the last (Erina: ₱833.33 x 2 + ₱833.34)
  function planByCount(total, count, freq, start, payEdited) {
    if (!(total > 0) || !(count > 0) || count > 600 || !start) return null;
    const each = payEdited || Math.floor(total / count);
    const last = total - each * (count - 1);
    if (last <= 0) return { error: 'That payment is too big for that many payments.' };
    return { rows: Array.from({ length: count }, (_, i) => ({ seq: i + 1, due: stepDate(start, freq, i), amt: i < count - 1 ? each : last })), each, last };
  }
  function stepDate(first, freq, i) { return freq === 'weekly' ? E.addDays(first, 7 * i) : freq === 'biweekly' ? E.addDays(first, 14 * i) : E.addMonths(first, i); }

  const curSign = (cur) => (cur === 'PHP' ? '₱' : cur);
  const curBtn = (cur) => `<button class="curbtn" data-a="pickcur" aria-label="Currency of this debt: ${cur}">${esc(curSign(cur))} ${ic('down', 'sm')}</button>`;
  function addDebt() {
    const f = S.f.add;
    const edit = f.editId ? find(f.editId) : null;
    const desc = { one_time: 'Borrowed once, paid back when you can or by a date.', installments: 'A fixed number of payments, on a schedule.', recurring: 'The same amount every month until you stop it.' }[f.kind];
    const total = parseMoney(f.total), count = Number(f.count) || 0, pay = parseMoney(f.pay);
    const auto = total > 0 && count > 0 ? Math.floor(total / count) : null;
    const plan = f.kind === 'installments' ? planByCount(total, count, f.freq, f.start, f.payEdited ? pay : null) : null;
    const amount = parseMoney(f.amount);
    const okPerson = f.person.trim().length > 0;
    const valid = okPerson && (f.kind === 'one_time' ? amount > 0 : f.kind === 'installments' ? plan && plan.rows : amount > 0 && f.start);
    f.valid = !!valid;
    const n = f.person.trim().toLowerCase();
    const ppl = E.people(base());
    const matches = ppl.filter((p) => !n || p.name.toLowerCase().includes(n)).slice(0, 5);
    const exact = ppl.some((p) => p.key === E.personKey(f.person));
    const freqSeg = (name) => seg(name, f.freq, [['monthly', 'Monthly'], ['biweekly', 'Every 2 weeks'], ['weekly', 'Weekly']]);
    return `<div class="screen pushed" data-scr="add"><div class="page">${top(edit ? 'Edit debt' : f.borrowAgain ? 'Borrow again' : 'Add debt', { back: 'Back' })}
      ${edit ? '' : `${seg('kind', f.kind, [['one_time', 'One-time'], ['installments', 'Installment'], ['recurring', 'Recurring']])}<p class="t-meta muted" style="margin:8px 4px 0">${desc}</p>`}
      <div class="fld search"><label class="lbl" for="who">Who do you owe?</label><div class="inp">${ic('user', 'muted')}<input id="who" data-f="add.person" value="${esc(f.person)}" placeholder="Search or add a person" autocomplete="off"><button class="iconbtn" data-a="whodd" aria-label="Show everyone">${ic('down')}</button></div>
        <div id="whohost">${f.whoOpen ? `<div class="dd">${matches.map((p) => `<button class="opt" data-a="pickwho" data-v="${esc(p.name)}">${pav(p.name, ' s36')}<span class="grow"><span class="t-row" style="display:block">${hl(p.name, n)}</span><span class="t-meta muted">${p.open} open · ${money(p.remaining)}</span></span></button>`).join('')}${n && !exact ? `<button class="opt add" data-a="pickwho" data-v="${esc(f.person.trim())}">${ic('plus')} Add “${esc(f.person.trim())}”</button>` : ''}</div>` : ''}</div>
        ${f.cur !== 'PHP' ? `<div class="t-meta muted mt4">Saved in ${esc(f.cur)}. Patas shows it converted (≈) wherever it adds up your debts.</div>` : ''}${exact && !edit ? `<div class="t-meta muted mt4">Goes under ${esc(ppl.find((p) => p.key === E.personKey(f.person)).name)}’s history, with their other debts.</div>` : ''}</div>
      <div class="fld"><label class="lbl" for="what">What it’s for <span class="opt">(optional)</span></label><div class="inp"><input id="what" data-f="add.title" value="${esc(f.title)}" maxlength="60" placeholder="Braces, phone, school fees…"></div></div>
      ${f.kind === 'one_time' ? `
        <div class="fld"><label class="lbl" for="oamt">Amount</label><div class="inp">${curBtn(f.cur)}<input id="oamt" data-f="add.amount" inputmode="decimal" value="${esc(f.amount)}" placeholder="0.00"></div></div>
        <div class="fld"><label class="lbl" for="oon">Borrowed on</label>${dateBtn('oon', 'add.start', f.start, 'max="${TODAY}"')}</div>
        <div class="fld"><label class="lbl" for="odue">Due by <span class="opt">(optional)</span></label>${dateBtn('odue', 'add.due', f.due, '', 'No due date')}<div class="t-meta muted mt4">${f.due ? '' : 'No date: it shows as “Pay when I can”.'}</div></div>`
      : f.kind === 'installments' ? `
        <div class="fld"><label class="lbl" for="itot">Total</label><div class="inp">${curBtn(f.cur)}<input id="itot" data-f="add.total" inputmode="decimal" value="${esc(f.total)}" placeholder="0.00"></div></div>
        <div class="row" style="gap:12px;align-items:flex-start"><div class="fld grow"><label class="lbl" for="icnt">Number of payments</label><div class="inp"><input id="icnt" data-f="add.count" inputmode="numeric" value="${esc(f.count)}" placeholder="6"></div></div>
          <div class="fld grow"><label class="lbl" for="ipay">Each payment</label><div class="inp">${curBtn(f.cur)}<input id="ipay" data-f="add.pay" inputmode="decimal" value="${esc(f.payEdited ? f.pay : auto ? toInput(auto) : '')}" placeholder="auto"></div></div></div>
        ${plan && plan.error ? `<div class="t-meta rust mt4">${plan.error}</div>` : plan && plan.rows && plan.last !== plan.each ? `<div class="t-meta muted mt4">Last payment ${money(plan.last)}, so it adds up to exactly ${money(total)}.</div>` : ''}
        <div class="fld"><span class="lbl">How often</span>${freqSeg('freq')}</div>
        <div class="fld"><label class="lbl" for="istart">First payment</label>${dateBtn('istart', 'add.start', f.start, '')}${plan && plan.rows ? `<div class="t-meta muted mt4">Ends ${fLong(plan.rows[plan.rows.length - 1].due)}</div>` : ''}</div>
        ${plan && plan.rows ? `<details class="card mt12" ${f.showPlan ? 'open' : ''}><summary data-a="showplan" style="list-style:none;cursor:pointer;min-height:44px;display:flex;align-items:center;justify-content:space-between;gap:8px"><span class="t-row">${plan.rows.length} payments of <span class="money">${money(plan.each)}</span> · ${fShort(plan.rows[0].due)} → ${fShort(plan.rows[plan.rows.length - 1].due)}</span>${ic('down', 'sm chev')}</summary><div class="mt8">${plan.rows.slice(0, 24).map((r) => `<div class="between t-meta" style="padding:6px 0;border-top:1px solid var(--border)"><span>#${r.seq} · ${fLong(r.due)}</span><span class="money">${money(r.amt)}</span></div>`).join('')}</div></details>` : ''}`
      : `
        <div class="fld"><label class="lbl" for="ramt">Amount each time</label><div class="inp">${curBtn(f.cur)}<input id="ramt" data-f="add.amount" inputmode="decimal" value="${esc(f.amount)}" placeholder="0.00"></div></div>
        <div class="fld"><span class="lbl">How often</span>${freqSeg('freq')}</div>
        <div class="fld"><label class="lbl" for="rstart">Starts on</label>${dateBtn('rstart', 'add.start', f.start, '')}</div>
        <div class="t-meta muted mt8">${f.endOn ? '' : 'No end date: it runs until you stop it.'} <button class="linkbtn" data-a="recend">${f.endOn ? 'Remove the end date' : 'Set an end date'}</button></div>
        ${f.endOn ? `<div class="fld"><label class="lbl" for="rend">Ends on</label>${dateBtn('rend', 'add.end', f.end, '')}</div>` : ''}`}
      <div class="group mt16"><div class="gi">${ic('bell', 'muted')}<span class="grow"><span class="t-row" style="display:block">Reminder</span><span class="t-meta muted">${f.remind ? '1 day before, at 8:00 AM' : 'Off'} · change it later on the debt</span></span>${toggle(f.remind, 'addremind', 'Remind me')}</div></div>
    </div></div>
    <div class="pinned"><button class="btn primary" data-a="savedebt" ${valid ? '' : 'disabled'}>${edit ? 'Save changes' : 'Save debt'}</button></div>`;
  }

  // ---------------- popups ----------------
  let pop = null;
  const openPop = (htmlStr, opt) => { if (pop && pop.isOpen()) pop.close(); pop = M.open(layer(), htmlStr, opt); return pop; };
  const head = (title, back) => `<div class="shead">${back ? `<button class="xbtn" data-a="${back}" aria-label="Back" style="margin-left:-8px">${ic('left')}</button>` : ''}<h2>${esc(title)}</h2><button class="xbtn" data-close aria-label="Close">${ic('x')}</button></div>`;

  function duePopup() {
    const h = E.home(base(), S.db.cash);
    const left = h.due.filter((x) => x.short > 0), paid = h.due.filter((x) => x.short === 0);
    const order = [...left.filter((x) => x.status === 'overdue' || x.carried), ...left.filter((x) => !(x.status === 'overdue' || x.carried))];
    const pct = h.dueThisMonth ? Math.round((h.dueThisMonthPaid * 100) / h.dueThisMonth) : 0;
    const row = (x, done) => `<button class="li press" data-a="openfrompop" data-id="${x.d.id}" style="padding:10px 4px">${done ? `<span class="av s36">${ic('check', 'sm')}</span>` : pav(x.d.person, ' s36')}<div class="grow"><div class="t-row ell ${done ? 'muted' : ''}">${esc(x.d.person)}</div><div class="t-meta muted ell">${x.charge ? 'Late fee' : esc(x.d.title)} · ${fShort(x.due)}</div></div><div class="r"><div class="t-row money ${done ? 'muted' : ''}">${money(done ? x.amt : x.short)}</div>${x.status === 'overdue' ? '<div class="mt4"><span class="pill over">Overdue</span></div>' : !done && x.short < x.amt ? `<div class="t-cap muted mt4 money">${money(x.amt - x.short)} paid</div>` : ''}</div></button>`;
    const shown = order.slice(0, 8);
    return `${head('Due this month')}
      <div class="t-pop money">${money(h.dueThisMonth)}</div>
      <div class="t-meta muted mt4"><span class="money">${money(h.dueThisMonthPaid)}</span> paid · ${left.length} of ${h.due.length} left${h.due.some((x) => x.carried) ? ' · includes overdue from earlier months' : ''}</div>
      <div class="tbar"><div class="fill" style="width:${pct}%"></div></div>
      ${(() => { const carried = shown.filter((x) => x.carried), now = shown.filter((x) => !x.carried); const byM = [...new Set(carried.map((x) => x.due.slice(0, 7)))]; return byM.map((m) => `<div class="mhead">From ${MONTH[+m.slice(5, 7) - 1]}</div>${carried.filter((x) => x.due.startsWith(m)).map((x) => row(x, false)).join('')}`).join('') + (carried.length ? `<div class="mhead">${MONTH[+TODAY.slice(5, 7) - 1]}</div>` : '<div class="mt12"></div>') + now.map((x) => row(x, false)).join(''); })()}
      ${order.length > 8 ? `<button class="linkbtn" data-a="tabfrompop" data-tab="schedule">See all ${order.length} in Schedule ${ic('right', 'sm')}</button>` : ''}
      ${paid.length ? `<details class="mt8"><summary class="linkbtn" style="list-style:none;cursor:pointer">Paid (${paid.length})</summary>${paid.map((x) => row(x, true)).join('')}</details>` : ''}`;
  }

  function paidPopup() {
    const h = E.home(base(), S.db.cash);
    return `${head('Paid this month')}
      <div class="t-pop money">${money(h.paidThisMonth)}</div><div class="t-meta muted mt4">${h.paidRows.length} ${h.paidRows.length === 1 ? 'payment' : 'payments'} in ${MONTH[+TODAY.slice(5, 7) - 1]}</div>
      <div class="mt12">${h.paidRows.map(({ d, l }) => `<button class="li press" data-a="paydetail" data-id="${d.id}" data-line="${l.id}" style="padding:10px 4px"><div style="width:44px" class="t-meta"><b>${fShort(l.date)}</b></div><div class="grow"><div class="t-row ell">${esc(d.person)}</div><div class="t-meta muted ell">${esc(d.title)}${l.method ? ' · ' + esc(l.method) : ''}</div></div><div class="t-row money">${money(l.amt)}</div>${ic('right', 'sm chev')}</button>`).join('') || '<div class="empty">No payments logged this month yet.</div>'}</div>`;
  }

  function payDetail(id, lineId) {
    const d = find(id), l = d && d.lines.find((x) => x.id === lineId);
    if (!l) return paidPopup();
    const cov = E.coverOf(d, lineId);
    return `${head('Payment', 'paidback')}
      <div class="t-pop money">${money(l.amt)}</div>
      <div class="t-meta muted mt4">${fLong(l.date)}${l.method ? ' · ' + esc(l.method) : ''}${l.note ? ' · ' + esc(l.note) : ''}</div>
      <div class="t-meta muted mt16" style="font-weight:600">What it paid</div>
      <div class="card mt8" style="padding:6px 14px">${cov.rows.map((r) => `<div class="between t-meta" style="padding:8px 0"><span>${d.kind === 'one_time' ? 'Toward the balance' : r.charge ? 'Late fee' : '#' + r.seq + ' · ' + fShort(r.due)}</span><span class="money">${money(r.amt)}${r.amt < r.of ? ` <span class="muted">of ${money(r.of)}</span>` : ''}</span></div>`).join('') || '<div class="t-meta muted" style="padding:8px 0">Nothing left to pay when it was logged.</div>'}</div>
      <div class="group mt12"><button class="gi press" data-a="openfrompop" data-id="${d.id}">${ic('debts', 'muted')}<span class="grow ell">Open debt · ${esc(d.title)}</span>${ic('right', 'sm chev')}</button><button class="gi press" data-a="personfrompop" data-key="${esc(E.personKey(d.person))}">${ic('hist', 'muted')}<span class="grow ell">${esc(d.person)}’s history</span>${ic('right', 'sm chev')}</button></div>
      <div class="mt12"><button class="btn outline" data-a="editpayfrompop" data-id="${d.id}" data-line="${l.id}">Edit payment</button></div>
      <div class="mt4"><button class="btn dangertext" data-a="delpay" data-id="${d.id}" data-line="${l.id}">Delete payment</button></div>`;
  }

  function moreSheet(id) {
    const d = find(id);
    return `${head(d.person)}
      <button class="action press" data-a="editdebt" data-id="${id}">${ic('pencil', 'muted')}Edit debt</button>
      <button class="action press" data-a="add" data-person="${esc(d.person)}">${ic('plus', 'muted')}Borrow again from ${esc(d.person)}</button>
      <div style="height:12px"></div>
      <button class="action red press" data-a="deldebt" data-id="${id}">${ic('trash')}Delete debt</button>`;
  }

  function reminderSheet(id) {
    const d = find(id), r = S.f.rem;
    const dates = E.reminderDates({ ...d, remind: r });
    const c = E.calc(d);
    const row = (o, label) => `<div class="gi"><span class="grow">${label}${c.next ? `<span class="t-meta muted" style="display:block">${fShort(E.addDays(c.next.due, -o))}</span>` : ''}</span>${toggle(r.offsets.includes(o), 'remoff', label, `data-v="${o}"`)}</div>`;
    return `${head('Reminder')}
      <div class="group">${`<div class="gi"><span class="grow t-row">Remind me about this debt</span>${toggle(r.on, 'remon', 'Remind me about this debt')}</div>`}</div>
      <p class="t-meta ${r.on && dates.length ? '' : 'muted'}" style="margin:12px 4px">${!r.on ? 'No reminders for this debt.' : dates.length ? `${dates.length} ${dates.length === 1 ? 'reminder' : 'reminders'}: ${fList(dates.map(fShort))} at ${timeLabel(r.time)}` : 'Pick when below.'}</p>
      ${r.on ? `<div class="group">${row(0, 'On the due date')}${row(1, '1 day before')}${row(3, '3 days before')}${row(7, '7 days before')}<div class="gi datefld"><span class="grow">On a date</span><span class="t-meta ${r.custom ? '' : 'muted'}">${r.custom ? fShort(r.custom) : 'Add a date'}</span>${ic('right', 'sm chev')}<input type="date" class="dnative" data-a="pickdate" data-f="rem.custom" value="${r.custom || ''}" min="${TODAY}" aria-label="Remind me on a date"></div></div>
      <div class="between" style="margin:18px 4px 6px"><span class="glabel" style="margin:0">Time, for all of this debt’s reminders</span><button class="linkbtn" data-a="toast" data-v="A time picker opens here">Other time</button></div>
      <div class="tgrid">${['07:00', '08:00', '09:00', '12:00', '18:00', '20:00'].map((t) => `<button class="chip" aria-pressed="${r.time === t}" data-a="remtime" data-v="${t}">${timeLabel(t)}</button>`).join('')}</div>` : ''}
      <div class="mt16"><button class="btn primary" data-a="saverem" data-id="${id}">Save reminder</button></div>`;
  }

  function cashSheet() {
    const m = TODAY.slice(0, 7), c = S.db.cash[m] || { income: 0, expenses: 0 };
    S.f.cash = S.f.cash || { income: c.income ? toInput(c.income) : '', expenses: c.expenses ? toInput(c.expenses) : '' };
    return `${head(MONTH[+m.slice(5, 7) - 1] + ' cash flow')}
      <p class="t-meta muted" style="margin:0 4px">Kept month by month, so Reports can show how each month went.</p>
      <div class="fld"><label class="lbl" for="cinc">Income this month</label><div class="inp"><span class="pre">₱</span><input id="cinc" data-f="cash.income" inputmode="decimal" value="${esc(S.f.cash.income)}" placeholder="0.00"></div></div>
      <div class="fld"><label class="lbl" for="cexp">Expenses this month</label><div class="inp"><span class="pre">₱</span><input id="cexp" data-f="cash.expenses" inputmode="decimal" value="${esc(S.f.cash.expenses)}" placeholder="0.00"></div></div>
      <div class="mt16"><button class="btn primary" data-a="savecash">Save</button></div>`;
  }

  function settingsSheet(view) {
    if (view === 'profile') return `${head('Profile', 'setback')}<div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:4px 0 8px"><label class="av s96 press" for="photoin" style="overflow:hidden;cursor:pointer" aria-label="${S.photo ? 'Change photo' : 'Add a photo'}">${S.photo ? `<img class="avphoto" src="${S.photo}" alt="Your photo" width="96" height="96">` : esc(initials(S.name || 'P'))}</label><input id="photoin" type="file" accept="image/*" data-a="photo" hidden><div class="row" style="gap:4px"><label class="linkbtn" for="photoin" style="cursor:pointer">${S.photo ? 'Change photo' : 'Add a photo'}</label>${S.photo ? '<button class="linkbtn" data-a="photodel" style="color:var(--danger)">Remove</button>' : ''}</div><div class="t-cap muted" style="text-align:center;max-width:280px">Only you see it. It is kept private to your account, like your QR codes.</div></div><div class="fld"><label class="lbl" for="pname">Your name</label><div class="inp"><input id="pname" data-f="prof.name" value="${esc(S.f.prof.name)}" maxlength="40" placeholder="What Patas calls you"></div><div class="t-meta muted mt4">Shown in the Home greeting. Saved to your account, so every phone greets you the same.</div></div><div class="fld"><span class="lbl">Email</span><div class="t-body muted">${esc(S.email)}</div></div><div class="mt16"><button class="btn primary" data-a="saveprof">Save</button></div>`;
    if (view) return `${head({ security: 'Security & MPIN', currency: 'Currency', notif: 'Notifications', backup: 'Backup & export', about: 'About Patas' }[view], 'setback')}${{
      security: '<div class="group"><div class="gi"><span class="grow">MPIN</span><span class="t-meta muted">On</span></div><div class="gi"><span class="grow">Asks for it</span><span class="t-meta muted">Every time Patas opens</span></div></div><p class="t-meta muted" style="margin:12px 4px">Unchanged in this update: the same MPIN, the same lock, the same 5 tries.</p>',
      currency: `<p class="t-meta muted" style="margin:0 4px 12px">Every amount stays in the currency you typed it in. Patas only converts for display, marked ≈. Rates update by themselves once a day when you are online. Last update: today, 9:00 AM (sample rates in this mockup).</p><div class="glabel" style="margin-top:0">Show amounts in</div><div id="curhost">${curList('display')}</div>`,
      notif: `<div class="group"><div class="gi"><span class="grow">Reminders on this phone</span>${toggle(true, 'toast', 'Reminders on this phone', 'data-v="Saved"')}</div></div><p class="t-meta muted" style="margin:12px 4px">Each debt now has its own reminder: open a debt, then Reminder. This switch turns them all off for this phone.</p>`,
      backup: '<div class="group"><button class="gi" data-a="toast" data-v="Backup saved (mockup)">Download a backup</button><button class="gi" data-a="toast" data-v="CSV exported (mockup)">Export CSV</button><button class="gi" data-a="toast" data-v="Restore opens here">Restore from a backup</button></div>',
      about: `<div style="text-align:center;padding:12px 0"><img src="${ASSET.logo}" alt="Patas logo" style="width:112px;height:112px"><div class="t-sec mt8">Patas</div><div class="t-meta muted">Version 1.1 (round 4 mockup) · MIT licence</div></div>`,
    }[view]}`;
    const m = S.appearance;
    return `${head('Settings')}
      <div class="row" style="padding:4px 4px 8px"><button class="av s48 press" data-a="setview" data-v="profile" aria-label="Profile photo" style="overflow:hidden">${avatarIn(48)}</button><div class="grow"><div class="t-row ell">${esc(S.name || 'Add your name')}</div><div class="t-meta muted ell">${esc(S.email)}</div></div></div>
      <div class="glabel">Account</div><div class="group"><button class="gi press" data-a="setview" data-v="profile">${ic('user', 'muted')}<span class="grow">Profile</span>${ic('right', 'sm chev')}</button><button class="gi press" data-a="setview" data-v="security">${ic('shield', 'muted')}<span class="grow">Security &amp; MPIN</span><span class="t-meta muted">On</span>${ic('right', 'sm chev')}</button></div>
      <div class="glabel">Look</div><div class="group"><div style="padding:12px 12px 0">${seg('appearance', m, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}</div>
        <div class="swatches" role="radiogroup" aria-label="Colour">${ORDER.map((k) => `<button role="radio" aria-pressed="${S.theme === k}" aria-label="${THEMES[k].name}" data-a="theme" data-v="${k}"><i style="background:${mode() === 'dark' ? THEMES[k].d.fill || THEMES[k].d.accent : THEMES[k].l.accent}"></i></button>`).join('')}</div>
        <div class="t-cap muted" style="padding:0 16px 12px">${THEMES[S.theme].name}</div>
        <button class="gi press" data-a="setview" data-v="currency">${ic('coins', 'muted')}<span class="grow">Currency</span><span class="t-meta muted">${S.cur}</span>${ic('right', 'sm chev')}</button></div>
      <div class="glabel">Alerts</div><div class="group"><button class="gi press" data-a="setview" data-v="notif">${ic('bell', 'muted')}<span class="grow">Notifications</span>${ic('right', 'sm chev')}</button><div class="gi">${ic('sound', 'muted')}<span class="grow">Sounds</span>${toggle(S.sounds, 'sounds', 'Sounds')}</div><button class="gi press" data-a="soundtest"><span style="width:20px"></span><span class="grow" style="color:var(--accent);font-weight:600">Play test sound</span></button>${S.device === 'android' ? `<div class="gi">${ic('vib', 'muted')}<span class="grow">Haptics</span>${toggle(S.haptic, 'haptic', 'Haptics')}</div>` : ''}</div>
      <div class="glabel">Paying</div><div class="group"><button class="gi press" data-a="qrgallery">${ic('qr', 'muted')}<span class="grow">Payment QR codes</span><span class="t-meta muted">${S.qrs.length}</span>${ic('right', 'sm chev')}</button></div>
      <div class="glabel">Your data</div><div class="group"><button class="gi press" data-a="setview" data-v="backup">${ic('box', 'muted')}<span class="grow">Backup &amp; export</span>${ic('right', 'sm chev')}</button></div>
      <div class="group mt12"><button class="gi press" data-a="setview" data-v="about">${ic('info', 'muted')}<span class="grow">About Patas</span>${ic('right', 'sm chev')}</button></div>
      <div class="mt16" style="text-align:center"><button class="btn text" data-a="logout" style="width:auto;margin:0 auto;color:var(--text)">Log out</button></div>
      <div class="t-cap muted" style="text-align:center;margin-top:4px">Patas 1.1 · round 4 mockup</div>`;
  }

  function curList(mode) {
    const q = (S.f.curq || '').trim().toLowerCase();
    const sel = mode === 'debt' ? S.f.add.cur : S.cur;
    const list = CUR.filter((c) => !q || c[0].toLowerCase().includes(q) || c[1].toLowerCase().includes(q));
    return `<div class="inp">${ic('search', 'muted')}<input data-f="curq" value="${esc(S.f.curq || '')}" placeholder="Search currencies" aria-label="Search currencies" autocomplete="off"></div>
      <div class="group mt12">${list.map((c) => `<button class="gi press" data-a="${mode === 'debt' ? 'setdebtcur' : 'setcur'}" data-v="${c[0]}"><span class="grow"><span class="t-row" style="display:block">${c[1]}</span><span class="t-meta muted">${c[0]}${c[0] === 'PHP' ? '' : ` · 1 ${c[0]} = ${fmtCur(Math.round(c[2] * 100), 'PHP')}`}</span></span>${c[0] === sel ? ic('check') : ''}</button>`).join('') || '<div class="empty">No currency by that name.</div>'}</div>`;
  }
  function confirmBox(title, body, okLabel, onOk, tone = 'danger') {
    const c = M.open(layer(), `<h2 class="t-sec" style="margin:0">${esc(title)}</h2><p class="t-body muted" style="margin:8px 0 18px">${esc(body)}</p><div style="display:grid;gap:10px"><button class="btn ${tone === 'danger' ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button><button class="btn outline" data-close>Cancel</button></div>`, { kind: 'center', title });
    c.el.classList.add('confirm');
    c.el.querySelector('[data-ok]').addEventListener('click', () => { c.close(); onOk(); });
  }

  // ---------------- opening: loading -> MPIN login -> enter MPIN -> Home (counts up) ----------------
  // Same rules as today's MPIN (Kenshin-reviewed): 5 tries, then an email code. Only the look is new. Mockup MPIN: 2580.
  const MOCK_PIN = '2580';
  const maskEmail = (e) => e.replace(/^(.)[^@]*/, (m, a) => a + '•••');
  const walletIcon = (x, y, r) => `<g transform="translate(${x} ${y}) rotate(${r})" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M-11 -6h18a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-18a3 3 0 0 1-3-3v-12a3 3 0 0 1 3-3z"/><path d="M10 1h-6a2.5 2.5 0 0 0 0 5h6"/><path d="M-11 -6l13-5 3 5"/></g>`;
  const walletPattern = `<svg class="pesobg" aria-hidden="true" width="100%" height="100%"><defs><pattern id="wp" width="112" height="112" patternUnits="userSpaceOnUse">${walletIcon(28, 30, -12)}${walletIcon(84, 86, 10)}</pattern></defs><rect width="100%" height="100%" fill="url(#wp)"/></svg>`;
  const pesoPattern = '<svg class="pesobg" aria-hidden="true" width="100%" height="100%"><defs><pattern id="pp" width="120" height="120" patternUnits="userSpaceOnUse"><text x="18" y="44" font-size="30" font-weight="700" fill="#fff" fill-opacity=".06">₱</text><text x="76" y="104" font-size="30" font-weight="700" fill="#fff" fill-opacity=".06">₱</text></pattern></defs><rect width="100%" height="100%" fill="url(#pp)"/></svg>';
  // the mascot (white on violet, violet on white) beside the word, no tile: Patas's own lockup
  const lockup = (white, w) => `<div class="lockup" style="--lw:${w}px" role="img" aria-label="Patas"><img class="lmark" src="${white ? ASSET.small : ASSET.smallViolet}" alt=""><span class="lword${white ? ' white' : ''}">Patas</span></div>`;
  function gateView() {
    if (S.gate === 'loading') return `<div class="gate loading" role="progressbar" aria-label="Opening Patas">${lockup(false, 210)}<div class="spinner" aria-hidden="true"><svg width="88" height="88"><circle cx="44" cy="44" r="34" fill="none" stroke-width="4" class="ring"/></svg><div class="orbit"><span class="rider"><img src="${ASSET.small}" alt=""><i class="coin">₱</i></span><i class="trail t1"></i><i class="trail t2"></i><i class="trail t3"></i></div></div></div>`;
    if (S.gate === 'lock') return `<div class="gate brand">${walletPattern}<div class="gin">${lockup(true, 236)}
      <button class="acct press" data-a="gswitch" aria-label="Signed in as ${esc(maskEmail(S.email))}. Switch account"><span>${esc(maskEmail(S.email))}</span>${ic('swap')}</button>
      <div style="flex:1"></div>
      <button class="mpincard press" data-a="gpad"><span class="kdots">${'<i></i>'.repeat(9)}</span><span>MPIN Login</span></button>
      <div style="flex:1.5"></div>
      <div class="glinks"><button data-a="gswitch">Not you? Switch</button><button data-a="gforgot">Forgot MPIN?</button></div>
      <div class="gver">Patas 1.1 · mockup MPIN 2580</div></div></div>`;
    // keypad
    return `<div class="gate brand">${walletPattern}<div class="gin">${lockup(true, 160)}
      <div class="gtitle" role="heading" aria-level="1">Enter your MPIN</div>
      <div class="pdots${S.pinShake ? ' shake' : ''}" aria-label="${S.pin.length} of 4 digits">${[0, 1, 2, 3].map((i) => `<i class="${i < S.pin.length ? 'on' : ''}"></i>`).join('')}</div>
      <div class="pmsg" aria-live="polite">${esc(S.pinMsg || ' ')}</div>
      <div style="flex:.6"></div>
      <div class="keypad">${['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map((k) => k === '' ? '<span></span>' : k === 'del' ? `<button class="key del press" data-a="gdel" aria-label="Delete">${ic('back')}</button>` : `<button class="key press" data-a="gkey" data-v="${k}">${k}</button>`).join('')}</div>
      <div style="flex:1"></div>
      <div class="glinks"><button data-a="gswitch">Not you? Switch</button><button data-a="gforgot">Forgot MPIN?</button></div>
      <div class="gver">Patas 1.1 · mockup MPIN 2580</div></div></div>`;
  }
  function renderGate() {
    let g = phone.querySelector('.gatehost');
    if (!S.gate) { if (g) g.remove(); return; }
    if (!g) { g = document.createElement('div'); g.className = 'gatehost'; phone.appendChild(g); }
    g.innerHTML = gateView();
  }
  function openApp() {
    S.gate = 'loading'; S.pin = ''; S.pinMsg = ''; M.resetCounts(); renderGate();
    setTimeout(() => { if (S.gate === 'loading') { S.gate = 'lock'; renderGate(); } }, M.reduce() ? 300 : 1600);
  }
  function unlocked() {
    const g = phone.querySelector('.gatehost');
    S.gate = null; M.resetCounts(); S.stack = []; S.tab = 'home'; S.prevTab = 'home'; render();
    if (g && !M.reduce()) { document.body.appendChild(g); g.style.position = 'fixed'; const r = phone.getBoundingClientRect(); Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); g.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).onfinish = () => g.remove(); } else if (g) g.remove();
  }

  // ---------------- render ----------------
  const cur = () => S.stack[S.stack.length - 1];
  let rendering = false; // a re-render removes the focused field; that must not count as "leaving" it
  function render() {
    rendering = true;
    try { renderNow(); } finally { rendering = false; }
  }
  function renderNow() {
    applyTheme();
    const old = phone.querySelector('.app .screen');
    const keep = old ? { scr: old.dataset.scr, top: old.scrollTop } : null;
    const ae = document.activeElement, af = ae && ae.dataset && ae.dataset.f, sel = af && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
    const r = cur();
    let body;
    if (!r) body = S.tab === 'home' ? home() : S.tab === 'debts' ? debts() : S.tab === 'schedule' ? schedule() : reports();
    else body = r.r === 'debt' ? debtDetail(r.id) : r.r === 'person' ? personScreen(r.key) : r.r === 'logpay' ? logPay(r.id) : r.r === 'qr' ? qrGallery() : r.r === 'qrshow' ? qrShow(r.id) : r.r === 'qrform' ? qrForm() : addDebt();
    const tabs = [['home', 'Home', 'home'], ['debts', 'Debts', 'debts'], ['schedule', 'Schedule', 'cal'], ['reports', 'Reports', 'chart']];
    const ti = tabs.findIndex((t) => t[0] === S.tab), pi = tabs.findIndex((t) => t[0] === S.prevTab);
    const tabbar = r ? '' : `<nav class="tabbar" role="tablist"><span class="tpill" style="left:10px;width:calc((100% - 26px) / 4);transform:translateX(calc(${pi} * (100% + 2px)))"></span>${tabs.map(([k, l, i]) => `<button role="tab" aria-selected="${S.tab === k}" data-a="tab" data-tab="${k}">${ic(i)}<span>${l}</span></button>`).join('')}</nav>`;
    let app = phone.querySelector('.app');
    if (!app) { phone.innerHTML = `<div class="app"></div><div class="status"><span>9:41</span><span>●●● ▮</span></div><div class="layer"></div>`; app = phone.querySelector('.app'); }
    app.innerHTML = body + tabbar;
    phone.classList.remove('scrolled');
    const scr = app.querySelector('.screen');
    if (keep && scr && keep.scr === scr.dataset.scr) scr.scrollTop = keep.top;
    else if (scr && !r && S.tab !== S.prevTab && !M.reduce()) scr.classList.add('fade-in');
    if (af) { const el = app.querySelector(`[data-f="${af}"]`); if (el) { el.focus({ preventScroll: true }); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (_) {} } }
    const pill2 = app.querySelector('.tpill');
    if (pill2 && pi !== ti) requestAnimationFrame(() => requestAnimationFrame(() => (pill2.style.transform = `translateX(calc(${ti} * (100% + 2px)))`)));
    S.prevTab = S.tab;
    for (const row of app.querySelectorAll('.chips.scrollx')) { const on = row.querySelector('[aria-pressed="true"]'); if (on && (on.offsetLeft + on.offsetWidth > row.scrollLeft + row.clientWidth || on.offsetLeft < row.scrollLeft)) row.scrollLeft = on.offsetLeft - 16; }
    placeThumbs(phone);
    fitHome(app);
    M.countAll(app, money);
    M.chartsIn(app);
    renderNotes();
    renderGate();
  }
  // Home fits the screen it is on: spare height goes into the cards (CSS flex), and on a short screen every gap and
  // the big number tighten step by step until nothing needs scrolling (never below 0.55 of the normal spacing).
  function fitHome(app) {
    const scr = app.querySelector('.screen[data-scr="home"]'), page = scr && scr.querySelector('.homefit');
    if (!page) return;
    let k = 1; page.style.setProperty('--hk', '1');
    while (scr.scrollHeight > scr.clientHeight + 1 && k > 0.55) { k = Math.round((k - 0.05) * 100) / 100; page.style.setProperty('--hk', String(k)); }
  }
  addEventListener('resize', () => { const app = phone.querySelector('.app'); if (app) fitHome(app); });
  function placeThumbs(scope) {
    for (const s of scope.querySelectorAll('.seg')) {
      const on = s.querySelector('[aria-checked="true"]'), th = s.querySelector('.thumb');
      if (!on || !th) continue;
      th.style.width = on.offsetWidth + 'px'; th.style.transform = `translateX(${on.offsetLeft - 4}px)`; th.style.left = '4px';
    }
  }
  const refreshPop = (fn) => { if (pop && pop.isOpen()) { pop.body.innerHTML = fn(); placeThumbs(pop.body); } };

  // ---------------- actions ----------------
  const go = (route) => { S.stack.push(route); render(); const s = phone.querySelector('.screen'); if (s) s.scrollTop = 0; };
  const back = () => { S.stack.pop(); render(); };
  const toast = (t, opt) => M.toast(layer(), t, opt);
  function startLogPay(id, editId) {
    S.f.other = null;
    const d = find(id), c = E.calc(d), l = editId ? d.lines.find((x) => x.id === editId) : null;
    S.f.lp = l ? { editId, mode: 'custom', amount: toInput(l.amt), date: l.date, method: l.method || 'Cash', note: l.note || '', count: 0 }
      : { editId: null, mode: d.kind === 'one_time' ? 'custom' : 'ticks', count: d.kind === 'one_time' ? 0 : 1, amount: c.next ? toInput(Math.min(c.next.short, c.remaining || c.next.short)) : '', date: TODAY, method: 'GCash', note: '' };
    go({ r: 'logpay', id });
  }
  function startAdd(person, editId) {
    const e = editId && find(editId);
    S.f.add = e ? { editId, kind: e.kind, person: e.person, title: e.title, amount: e.kind === 'one_time' ? toInput(E.calc(e).owed) : e.kind === 'recurring' ? toInput(e.amount) : '', total: '', count: '', pay: '', payEdited: false, freq: e.freq || 'monthly', start: e.opened, due: e.due || '', remind: e.remind.on, whoOpen: false, cur: e.cur || 'PHP' }
      : { kind: 'one_time', person: person || '', borrowAgain: !!person, title: '', amount: '', total: '', count: '', pay: '', payEdited: false, freq: 'monthly', start: TODAY, due: '', remind: true, whoOpen: false, endOn: false, end: '', cur: 'PHP' };
    go({ r: 'add' });
  }

  phone.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    const k = a.dataset.a, id = a.dataset.id, v = a.dataset.v;
    switch (k) {
      case 'tab': S.stack = []; S.tab = a.dataset.tab; S.showSettled = false; render(); break;
      case 'tabfrompop': pop.close(); S.stack = []; S.tab = a.dataset.tab; render(); break;
      case 'back': back(); break;
      case 'settings': S.f.prof = { name: S.name }; openPop(settingsSheet(), { kind: 'sheet', title: 'Settings', height: '92%' }); placeThumbs(pop.body); break;
      case 'setview': refreshPopPush(settingsSheet(v), false); break;
      case 'setback': refreshPopPush(settingsSheet(), true); break;
      case 'due': openPop(duePopup(), { kind: 'center', title: 'Due this month' }); break;
      case 'paid': openPop(paidPopup(), { kind: 'center', title: 'Paid this month' }); break;
      case 'paydetail': refreshPopPush(payDetail(id, a.dataset.line), false); break;
      case 'paidback': refreshPopPush(paidPopup(), true); break;
      case 'openfrompop': pop.close(); S.stack = [{ r: 'debt', id }]; render(); break;
      case 'personfrompop': pop.close(); S.stack = [{ r: 'person', key: a.dataset.key }]; render(); break;
      case 'editpayfrompop': pop.close(); S.stack = [{ r: 'debt', id }]; startLogPay(id, a.dataset.line); break;
      case 'overdue': S.tab = 'debts'; S.filter = 'overdue'; S.stack = []; render(); break;
      case 'cash': S.f.cash = null; openPop(cashSheet(), { kind: 'sheet', title: 'Cash flow' }); break;
      case 'savecash': {
        const inc = parseMoney(S.f.cash.income) || 0, exp = parseMoney(S.f.cash.expenses) || 0;
        if (Number.isNaN(inc) || Number.isNaN(exp)) { toast('Check the amounts', { quiet: true }); break; }
        S.db.cash[TODAY.slice(0, 7)] = { income: inc, expenses: exp }; pop.close(); render(); toast('Cash flow saved', { sound: true }); break;
      }
      case 'open': S.dd = false; go({ r: 'debt', id }); break;
      case 'person': S.dd = false; go({ r: 'person', key: a.dataset.key }); break;
      case 'allpeople': S.dd = false; S.q = ''; S.qApplied = ''; render(); break;
      case 'ddtoggle': S.dd = !S.dd; render(); if (S.dd) phone.querySelector('[data-f="q"]').focus(); break;
      case 'clearq': S.q = ''; S.qApplied = ''; render(); break;
      case 'filter': S.filter = v; render(); break;
      case 'settled': S.showSettled = v === '1'; render(); break;
      case 'add': if (pop && pop.isOpen()) pop.close(); startAdd(a.dataset.person); break;
      case 'more': openPop(moreSheet(cur().id), { kind: 'sheet', title: 'Actions' }); break;
      case 'editdebt': pop.close(); startAdd(null, id); break;
      case 'deldebt': pop.close(); confirmBox('Delete this debt?', 'It disappears from your lists on every device. Its payments go with it.', 'Delete debt', () => { const d = find(id); d.deleted = true; S.stack = S.stack.filter((r) => r.id !== id); render(); toast('Debt deleted', { quiet: true }); }); break;
      case 'remind': { const d = find(cur().id); S.f.rem = JSON.parse(JSON.stringify(d.remind)); openPop(reminderSheet(d.id), { kind: 'sheet', title: 'Reminder' }); break; }
      case 'remtoggle': { const d = find(cur().id); d.remind.on = !d.remind.on; if (d.remind.on && !d.remind.offsets.length) d.remind.offsets = [1]; render(); toast(d.remind.on ? 'Reminder on' : 'Reminder off', { quiet: true }); break; }
      case 'remon': S.f.rem.on = !S.f.rem.on; if (S.f.rem.on && !S.f.rem.offsets.length) S.f.rem.offsets = [1]; refreshPop(() => reminderSheet(cur().id)); break;
      case 'remoff': { const o = Number(v), r = S.f.rem; r.offsets = r.offsets.includes(o) ? r.offsets.filter((x) => x !== o) : [...r.offsets, o].sort((x, y) => y - x); refreshPop(() => reminderSheet(cur().id)); break; }
      case 'remtime': S.f.rem.time = v; refreshPop(() => reminderSheet(cur().id)); break;
      case 'saverem': { const d = find(id); d.remind = S.f.rem; pop.close(); render(); toast('Reminder saved'); break; }
      case 'logpay': startLogPay(id); break;
      case 'editpay': startLogPay(id, a.dataset.line); break;
      case 'seg': {
        const name = a.dataset.name;
        if (name === 'appearance') { themeChange(a, () => { S.appearance = v; }); break; }
        if (name === 'lpmode') S.f.lp.mode = v; else if (name === 'kind') S.f.add.kind = v; else if (name === 'freq') S.f.add.freq = v;
        render(); break;
      }
      case 'tick': { const i = Number(a.dataset.i), f = S.f.lp; f.count = i < f.count ? i : i + 1; render(); break; }
      case 'showmonths': S.f.lp.showAll = true; render(); break;
      case 'pickdate': try { if (a.showPicker) a.showPicker(); } catch (_) { /* the native tap opens it */ } break;
      case 'tickall': { const d = find(cur().id), n = E.calc(d).statuses.filter((s) => s.short > 0).length; S.f.lp.count = S.f.lp.count === n ? 0 : n; S.f.lp.showAll = S.f.lp.count === n; render(); break; }
      case 'amt': S.f.lp.amount = toInput(Number(v)); render(); break;
      case 'method': S.f.lp.method = v; render(); break;
      case 'savepay': savePay(); break;
      case 'delpay': {
        const d = find(id);
        if (pop && pop.isOpen()) pop.close();
        confirmBox('Delete this payment?', 'The debt’s remaining balance goes back up by this amount.', 'Delete payment', () => { const l = d.lines.find((x) => x.id === a.dataset.line); l.deleted = true; if (cur() && cur().r === 'logpay') S.stack.pop(); render(); toast('Payment deleted', { quiet: true }); });
        break;
      }
      case 'whodd': S.f.add.whoOpen = !S.f.add.whoOpen; render(); break;
      case 'pickwho': S.f.add.person = v; S.f.add.whoOpen = false; render(); break;
      case 'showplan': e.preventDefault(); S.f.add.showPlan = !S.f.add.showPlan; render(); break;
      case 'recend': S.f.add.endOn = !S.f.add.endOn; render(); break;
      case 'addremind': S.f.add.remind = !S.f.add.remind; render(); break;
      case 'savedebt': saveDebt(); break;
      case 'period': S.period = v; S.tip = null; S.periodOpen = false; if (v === 'custom') toast('A date-range picker opens here', { quiet: true }); render(); break;
      case 'tip': S.tip = S.tip === v ? null : v; render(); break;
      case 'theme': themeChange(a, () => { S.theme = v; }); break;
      case 'sounds': S.sounds = !S.sounds; refreshPop(() => settingsSheet()); applyTheme(); toast(S.sounds ? 'Sounds on' : 'Sounds off', { quiet: true }); break;
      case 'haptic': S.haptic = !S.haptic; refreshPop(() => settingsSheet()); applyTheme(); toast(S.haptic ? 'Haptics on' : 'Haptics off', { quiet: true }); break;
      case 'saveprof': S.name = S.f.prof.name.trim(); refreshPopPush(settingsSheet(), true); render(); toast('Saved'); break;
      case 'logout': pop.close(); confirmBox('Log out?', 'Your data stays in your account. Patas asks for an email code next time.', 'Log out', () => toast('Logged out (mockup)', { quiet: true }), 'primary'); break;
      case 'toast': toast(v || 'Saved', { quiet: true }); break;
      case 'soundtest': M.sound(true); toast(S.device === 'iphone' ? 'Hear nothing? Check the silent switch on the side of your iPhone' : 'Hear nothing? Check your media volume', { quiet: true }); break;
      case 'pickname': { const kind = a.dataset.kind; if (kind === 'method') S.f.lp.method = v; else S.f.qr.wallet = v; S.f.other = null; if (pop && pop.isOpen() && pop.body.querySelector('[data-a="pickname"]')) pop.close(); render(); break; }
      case 'nameother': { const kind = a.dataset.kind; S.f.other = S.f.other && S.f.other.kind === kind ? null : { kind, text: '' }; render(); const el = phone.querySelector('#othername'); if (el) el.focus(); break; }
      case 'nameadd': addName(); break;
      case 'namemore': { const kind = a.dataset.kind, all = [...(kind === 'method' ? METHODS : WALLETS), ...S.custom[kind]], cur0 = kind === 'method' ? S.f.lp.method : S.f.qr.wallet;
        openPop(`${head(kind === 'method' ? 'Payment method' : 'Paid with')}<div class="group">${all.map((m) => `<button class="gi press" data-a="pickname" data-kind="${kind}" data-v="${esc(m)}"><span class="grow">${esc(m)}</span>${m === cur0 ? ic('check') : ''}</button>`).join('')}</div>`, { kind: 'sheet', title: 'Pick one' }); break; }
      case 'pphotodel': delete S.personPhotos[a.dataset.key]; render(); toast('Photo removed', { quiet: true }); break;
      case 'gpad': S.gate = 'pad'; renderGate(); break;
      case 'gkey': {
        if (S.pin.length >= 4) break;
        S.pin += v; S.pinMsg = ''; S.pinShake = false; renderGate();
        if (S.pin.length === 4) setTimeout(() => {
          if (S.pin === MOCK_PIN) { S.tries = 5; unlocked(); return; }
          S.tries -= 1; S.pin = ''; S.pinShake = true;
          S.pinMsg = S.tries <= 0 ? 'MPIN locked. Sign in with an email code.' : S.tries === 1 ? 'Wrong MPIN. One try left before you need an email code.' : `Wrong MPIN. ${S.tries} tries left.`;
          renderGate(); M.buzz(30);
        }, 120);
        break;
      }
      case 'gdel': S.pin = S.pin.slice(0, -1); renderGate(); break;
      case 'gforgot': toast('An email code lets you set a new MPIN (same as today)', { quiet: true }); break;
      case 'gswitch': toast('Signs out and asks for another email (same as today)', { quiet: true }); break;
      case 'qrgallery': if (pop && pop.isOpen()) pop.close(); go({ r: 'qr' }); break;
      case 'qrshow': go({ r: 'qrshow', id }); break;
      case 'qradd': if (pop && pop.isOpen()) pop.close(); S.f.other = null; S.f.qr = { person: a.dataset.person || '', wallet: 'GCash', account: a.dataset.person || '', img: null, whoOpen: false }; go({ r: 'qrform' }); break;
      case 'qrwhodd': S.f.qr.whoOpen = !S.f.qr.whoOpen; render(); break;
      case 'qrpickwho': S.f.qr.person = v; S.f.qr.whoOpen = false; if (!S.f.qr.account) S.f.qr.account = v; render(); break;
      case 'qrwallet': S.f.qr.wallet = v; render(); break;
      case 'qrsavedone': {
        const f = S.f.qr, key = E.personKey(f.person), old = S.qrs.find((q) => q.personKey === key);
        confirmBox(old ? 'Replace this QR?' : 'Save this QR?', `Pays ${f.person.trim()} · ${f.wallet} · ${f.account.trim()}.${old ? ' The old one stops being used, and a warning shows for 14 days.' : ''}`, old ? 'Replace QR' : 'Save QR', () => {
          if (old) S.qrs = S.qrs.filter((q) => q !== old);
          const q = { id: nid('q'), personKey: key, label: f.wallet, wallet: f.wallet, account: f.account.trim(), seed: 40 + S.qrs.length, img: f.img, addedOn: TODAY };
          S.qrs.push(q); S.stack.pop(); go({ r: 'qrshow', id: q.id }); toast(old ? 'QR replaced' : 'QR saved', { sound: true });
        }, 'primary');
        break;
      }
      case 'qrmore': openPop(`${head('QR code')}<button class="action press" data-a="qrreplace" data-id="${id}">${ic('swap', 'muted')}Replace with a new QR</button><div style="height:12px"></div><button class="action red press" data-a="qrdel" data-id="${id}">${ic('trash')}Remove this QR</button>`, { kind: 'sheet', title: 'QR code' }); break;
      case 'qrreplace': { pop.close(); const q = S.qrs.find((x) => x.id === id); S.f.qr = { person: nameOf(q.personKey), wallet: q.wallet, account: q.account, img: null, whoOpen: false }; go({ r: 'qrform' }); break; }
      case 'qrdel': pop.close(); confirmBox('Remove this QR?', 'Your debts stay. Paying them shows "Add their payment QR" again.', 'Remove QR', () => { S.qrs = S.qrs.filter((q) => q.id !== id); S.stack.pop(); render(); toast('QR removed', { quiet: true }); }); break;
      case 'qrsave': confirmBox('Save a copy?', "This copy leaves Patas: your MPIN won't lock it, signing out won't delete it, and your photo backup may upload it.", S.device === 'iphone' ? 'Share copy' : 'Save to phone', () => toast(S.device === 'iphone' ? "Copy shared. Patas can't delete it for you." : 'Saved to Downloads. Delete it after you pay.', { quiet: true }), 'primary'); break;
      case 'photodel': S.photo = null; refreshPopPush(settingsSheet('profile'), false); render(); toast('Photo removed', { quiet: true }); break;
      case 'setcur': S.cur = v; S.f.curq = ''; refreshPopPush(settingsSheet(), true); render(); toast(v === 'PHP' ? 'Showing amounts in pesos' : `Showing amounts in ${CUR.find((c) => c[0] === v)[1]}`, { quiet: true }); break;
      case 'pickcur': S.f.curq = ''; openPop(`${head('Currency of this debt')}<p class="t-meta muted" style="margin:0 4px 12px">Type the amounts in the currency you actually owe. Payments to this debt use it too.</p><div id="curhost">${curList('debt')}</div>`, { kind: 'sheet', title: 'Currency of this debt', height: '80%' }); break;
      case 'setdebtcur': S.f.add.cur = v; pop.close(); render(); break;
      case 'calnav': { const m = S.calMonth || TODAY.slice(0, 7); S.calMonth = E.addMonths(m + '-01', Number(v)).slice(0, 7); S.calDay = null; render(); break; }
      case 'calday': S.calDay = S.calDay === v ? null : v; render(); break;
      case 'periodopen': S.periodOpen = !S.periodOpen; render(); break;
    }
  });
  function refreshPopPush(htmlStr, isBack) { if (pop && pop.isOpen()) { M.push(pop.body, htmlStr, isBack); placeThumbs(pop.body); } }

  function themeChange(el, apply) {
    const before = mode() + S.theme;
    const r = el.getBoundingClientRect();
    const run = () => { apply(); render(); if (pop && pop.isOpen() && pop.body.querySelector('.swatches')) { pop.body.innerHTML = settingsSheet(); placeThumbs(pop.body); } };
    // Choosing what is already showing (e.g. "System" while the phone is light and the app is light): no animation
    const after = (() => { const s = { a: S.appearance, t: S.theme }; apply(); const m = mode() + S.theme; S.appearance = s.a; S.theme = s.t; return m; })();
    if (after === before) { run(); return; }
    M.reveal(r.left + r.width / 2, r.top + r.height / 2, run);
  }

  function addName() {
    const o = S.f.other; if (!o) return;
    const name = o.text.trim().replace(/\s+/g, ' ').slice(0, 20); if (!name) return;
    const list = [...(o.kind === 'method' ? METHODS : WALLETS), ...S.custom[o.kind]];
    const same = list.find((m) => m.toLowerCase() === name.toLowerCase());
    if (!same) S.custom[o.kind].push(name);
    if (o.kind === 'method') S.f.lp.method = same || name; else S.f.qr.wallet = same || name;
    S.f.other = null; render(); toast(same ? `${same} picked` : `${name} added`, { quiet: true });
  }
  function savePay() {
    const r = cur(), d = find(r.id), f = S.f.lp;
    const sel = f.mode === 'ticks' && d.kind !== 'one_time' && !f.editId ? E.tickUpTo(d, f.count - 1) : null;
    const amt = sel ? sel.total : parseMoney(f.amount);
    if (!f.valid) return;
    const what = sel ? sel.rows.map((x) => (x.charge ? 'the late fee' : fShort(x.due))).join(', ').replace(/, ([^,]*)$/, ' and $1') : '';
    confirmBox(f.editId ? 'Save these changes?' : `Log ${money(amt)} to ${d.person}?`, sel ? `Pays ${what}.` : f.editId ? 'The balance is worked out again from all payments.' : `Paid ${fLong(f.date)}${f.method ? ' by ' + f.method : ''}.`, f.editId ? 'Save changes' : 'Log payment', () => {
      if (f.editId) { const l = d.lines.find((x) => x.id === f.editId); Object.assign(l, { amt, date: f.date, method: f.method, note: f.note }); }
      else d.lines.push({ id: nid('l'), kind: 'payment', amt, date: f.date, method: f.method, note: f.note });
      S.stack.pop(); render();
      const done = E.calc(d).state === 'settled';
      toast(f.editId ? 'Changes saved' : done ? `Paid in full. Patas na with ${d.person}!` : 'Payment logged', { sound: true });
    }, 'primary');
  }

  function saveDebt() {
    const f = S.f.add; if (!f.valid) return;
    const person = f.person.trim().replace(/\s+/g, ' ');
    const existing = E.people(base()).find((p) => p.key === E.personKey(person));
    const name = existing ? existing.name : person;
    if (f.editId) {
      const d = find(f.editId); d.person = name; d.title = f.title.trim();
      if (d.kind === 'one_time') { d.due = f.due || null; const amt = parseMoney(f.amount); const p = d.lines.find((l) => l.kind === 'principal'); if (p && amt > 0) p.amt = amt - d.lines.filter((l) => !l.deleted && l.kind === 'addition').reduce((n, l) => n + l.amt, 0); }
      d.remind.on = f.remind; S.stack.pop(); render(); toast('Changes saved', { sound: true }); return;
    }
    const id = nid('d');
    const nd = { id, cur: f.cur || 'PHP', person: name, title: f.title.trim(), kind: f.kind, opened: f.kind === 'one_time' ? f.start : TODAY, remind: { on: f.remind, offsets: f.remind ? [1] : [], custom: null, time: '08:00' }, lines: [] };
    if (f.kind === 'one_time') Object.assign(nd, { due: f.due || null, lines: [{ id: nid('l'), kind: 'principal', amt: parseMoney(f.amount), date: f.start, method: '', note: '' }] });
    if (f.kind === 'installments') { const plan = planByCount(parseMoney(f.total), Number(f.count), f.freq, f.start, f.payEdited ? parseMoney(f.pay) : null); Object.assign(nd, { freq: f.freq, plan: plan.rows.map((x) => ({ seq: x.seq, due: x.due, amt: x.amt })) }); }
    if (f.kind === 'recurring') Object.assign(nd, { freq: f.freq, first: f.start, amount: parseMoney(f.amount), stoppedOn: f.endOn && f.end ? f.end : null });
    S.db.debts.push(nd);
    S.stack.pop(); S.stack.push({ r: 'debt', id }); render();
    toast(qrOf(name) ? `Debt added · uses ${name}’s QR` : 'Debt added', { sound: true });
  }

  phone.addEventListener('input', (e) => {
    const f = e.target.dataset && e.target.dataset.f; if (!f) return;
    const [grp, key] = f.includes('.') ? f.split('.') : [null, f];
    const val = e.target.value;
    if (!grp && key !== 'curq') { S.q = val; S.dd = true; const host = phone.querySelector('#ddhost'); if (host) host.innerHTML = searchDD(); return; }
    if (grp === 'lp') { S.f.lp[key] = val; render(); return; }
    if (grp === 'add') { S.f.add[key] = val; if (key === 'pay') S.f.add.payEdited = val !== ''; if (key === 'person') S.f.add.whoOpen = true; render(); return; }
    if (grp === 'rem') { S.f.rem.custom = val || null; refreshPop(() => reminderSheet(cur().id)); return; }
    if (grp === 'cash') { S.f.cash[key] = val; return; }
    if (!grp && key === 'curq') { S.f.curq = val; const h = layer().querySelector('#curhost'); if (h) h.innerHTML = curList(h.closest('.dbody').querySelector('h2').textContent.includes('this debt') ? 'debt' : 'display'); return; }
    if (grp === 'prof') { S.f.prof.name = val; return; }
    if (grp === 'other') { S.f.other.text = val; const b = phone.querySelector('[data-a="nameadd"]'); if (b) b.disabled = !val.trim(); return; }
    if (grp === 'qr') { S.f.qr[key] = val; if (key === 'person') S.f.qr.whoOpen = true; render(); return; }
  });
  // Erina fix 13: money fields read "5,000.00" once you leave them and show the plain digits while you type
  const setField = (f, v) => { const [g, k] = f.split('.'); if (g === 'cash' && S.f.cash) S.f.cash[k] = v; else if (S.f[g]) S.f[g][k] = v; };
  const isMoney = (el) => el && el.dataset && el.dataset.f && el.inputMode === 'decimal';
  phone.addEventListener('focusout', (e) => {
    const el = e.target; if (rendering || !isMoney(el)) return;
    const c = parseMoney(el.value); if (c === null || Number.isNaN(c)) return;
    el.value = (c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    setField(el.dataset.f, el.value);
  });
  phone.addEventListener('focusin', (e) => {
    const el = e.target; if (rendering || !isMoney(el) || !el.value.includes(',')) return;
    el.value = el.value.replace(/,/g, ''); setField(el.dataset.f, el.value);
  });
  // profile photo: read the chosen picture, crop it to a square on the phone, keep it small (256 px)
  phone.addEventListener('change', (e) => {
    if (e.target.classList && e.target.classList.contains('personphoto') && e.target.files && e.target.files[0]) {
      const key = e.target.dataset.person, url = URL.createObjectURL(e.target.files[0]), img = new Image();
      img.onload = () => { const s = Math.min(img.width, img.height), cv = document.createElement('canvas'); cv.width = cv.height = 256; cv.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256); URL.revokeObjectURL(url); S.personPhotos[key] = cv.toDataURL('image/jpeg', 0.86); render(); toast('Photo saved'); };
      img.onerror = () => { URL.revokeObjectURL(url); toast('That file is not a picture Patas can read', { quiet: true }); };
      img.src = url; return;
    }
    if (e.target.id === 'qrin' && e.target.files && e.target.files[0]) {
      const fr = new FileReader(); fr.onload = () => { S.f.qr.img = fr.result; render(); }; fr.readAsDataURL(e.target.files[0]); return;
    }
    if (e.target.id !== 'photoin' || !e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0], url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), cv = document.createElement('canvas'); cv.width = cv.height = 256;
      cv.getContext('2d').drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      S.photo = cv.toDataURL('image/jpeg', 0.86);
      refreshPopPush(settingsSheet('profile'), false); render(); toast('Photo saved');
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('That file is not a picture Patas can read', { quiet: true }); };
    img.src = url;
  });
  phone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.f === 'other.text') { e.preventDefault(); addName(); return; }
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.f === 'q') { S.qApplied = S.q; S.dd = false; render(); e.target.blur(); }
    if (e.key === 'Escape' && S.dd) { S.dd = false; render(); }
  });
  document.addEventListener('pointerdown', (e) => { if (S.dd && !e.target.closest('.search')) { S.dd = false; render(); } });
  M.pressable(phone);
  phone.addEventListener('scroll', (e) => { if (e.target.classList && e.target.classList.contains('screen')) phone.classList.toggle('scrolled', e.target.scrollTop > 4); }, true);

  // ---------------- toolbar and notes (outside the phone) ----------------
  const SCREENS = [
    ['home', 'Home'], ['due', 'Home · Due this month'], ['paid', 'Home · Paid this month'], ['paiddetail', 'Paid · payment detail'],
    ['debts', 'My debts'], ['search', 'My debts · search open'], ['debt', 'Debt details'], ['more', 'Debt details · ⋯ menu'],
    ['remind', 'Reminder sheet'], ['person', 'Person history'], ['logpay', 'Log payment · 3 ticked'], ['add-one', 'Add debt · One-time'],
    ['add-inst', 'Add debt · Installment'], ['add-rec', 'Add debt · Recurring'], ['schedule', 'Schedule'], ['reports', 'Reports · This month'],
    ['reports6', 'Reports · 6 months'], ['settings', 'Settings sheet'], ['cash', 'Cash flow sheet'], ['toast', 'Toast'],
    ['open', 'Opening: loading → MPIN'], ['lock', 'MPIN login'], ['pad', 'Enter your MPIN'], ['qr', 'Payment QR codes'], ['qrshow', 'Show QR'], ['qrform', 'Add a QR code'],
  ];
  const NOTES = {
    home: 'Total I owe is the biggest thing. Tap the cards: Due and Paid open popups, Overdue opens the overdue debts, Edit opens the cash-flow sheet. Money counts up once when the app opens, and moves again only when it changes (log a payment and come back).',
    due: 'Overdue first, then by date. Paid ones fold away at the bottom. Tap a row to open that debt.',
    paid: 'Newest first. Tap a payment to see what it paid for, edit it or delete it, open its debt or the person’s history.',
    debt: 'Log payment stays pinned. Reminder and History are rows that show their state. Edit, Borrow again and Delete live in the ⋯ menu.',
    person: 'One page per person: every debt and payment with them, newest first, with the balance after each line.',
    logpay: 'Ticking a month also ticks the older ones (payments go to the oldest first). The total updates as you tick.',
    reports: 'Two summary cards and four charts. Tap a month in the last chart for exact amounts. Change the period with the chips.',
    settings: 'Opens as a sheet over the blurred app. Tap Light/Dark or a colour: the new look grows in a circle from your tap.',
  };
  function renderNotes() {
    const n = document.getElementById('notes'); if (!n) return;
    const r = cur(), key = r ? r.r : S.tab;
    n.innerHTML = `<h3>Patas round 4 mockup</h3><p>${NOTES[key] || NOTES.home}</p><p class="muted">Fake data. Font: ${FONTS[S.font].name}. Colour: ${THEMES[S.theme].name}. Words are drafts for Rohan.</p>`;
  }
  function renderBar() {
    const b = document.getElementById('bar'); if (!b) return;
    b.innerHTML = `<label>Screen <select id="tbScreen">${SCREENS.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <span style="display:flex;gap:6px" role="radiogroup" aria-label="Colour">${ORDER.map((k) => `<button class="sw" aria-pressed="${S.theme === k}" title="${THEMES[k].name}" data-tb="theme" data-v="${k}" style="background:${THEMES[k].l.accent}"></button>`).join('')}</span>
      <span style="display:flex;gap:4px">${['light', 'dark'].map((m) => `<button class="tb" aria-pressed="${mode() === m}" data-tb="mode" data-v="${m}">${m === 'light' ? 'Light' : 'Dark'}</button>`).join('')}</span>
      <label>Font <select id="tbFont">${Object.entries(FONTS).map(([k, f]) => `<option value="${k}" ${S.font === k ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label>
      <span style="display:flex;gap:4px">${[['iphone', 'iPhone'], ['android', 'Android']].map(([k, l]) => `<button class="tb" aria-pressed="${S.device === k}" data-tb="device" data-v="${k}">${l}</button>`).join('')}</span>
      <span style="display:flex;gap:4px">${[['390', '390 × 844'], ['360', '360 × 640']].map(([k, l]) => `<button class="tb" aria-pressed="${S.w === k}" data-tb="w" data-v="${k}">${l}</button>`).join('')}</span>
      <button class="tb" aria-pressed="${S.overdue}" data-tb="od">Overdue ${S.overdue ? 'on' : 'off'}</button>
      <button class="tb" data-tb="replay">Replay opening</button>`;
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tb]'); if (!t) return;
    const k = t.dataset.tb, v = t.dataset.v;
    if (k === 'theme') S.theme = v;
    if (k === 'mode') S.appearance = v;
    if (k === 'device') S.device = v;
    if (k === 'w') S.w = v;
    if (k === 'od') { S.overdue = !S.overdue; setData(); }
    if (k === 'replay') { if (pop && pop.isOpen()) pop.close(); S.stack = []; S.tab = 'home'; renderBar(); render(); openApp(); return; }
    renderBar(); render();
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'tbFont') { S.font = e.target.value; render(); }
    if (e.target.id === 'tbScreen') { if (pop && pop.isOpen()) { pop.el.remove(); pop = null; } layer().innerHTML = ''; start(e.target.value); }
  });

  // ---------------- start screen from ?s= ----------------
  function start(s) {
    S.gate = null; renderGate();
    S.stack = []; S.dd = false; S.q = ''; S.qApplied = ''; S.filter = 'all'; S.showSettled = false;
    S.tab = ['debts', 'search'].includes(s) ? 'debts' : s === 'schedule' ? 'schedule' : s && s.startsWith('reports') ? 'reports' : 'home';
    S.prevTab = S.tab;
    if (s === 'reports6') S.period = '6m'; else if (s === 'reports') S.period = 'month';
    if (s === 'search') { S.q = 'le'; S.dd = true; }
    if (['debt', 'more', 'remind'].includes(s)) S.stack = [{ r: 'debt', id: 'd3' }];
    if (s === 'person') S.stack = [{ r: 'person', key: 'tita merly' }];
    render();
    if (s === 'logpay') { S.stack = [{ r: 'debt', id: 'd4' }]; startLogPay('d4'); S.f.lp.count = 3; render(); }
    if (s === 'add-one') startAdd();
    if (s === 'add-inst') { startAdd(); Object.assign(S.f.add, { kind: 'installments', person: 'Dental clinic', title: 'Retainer', total: '5,000.00', count: '6', start: '2026-10-28' }); render(); }
    if (s === 'add-rec') { startAdd(); Object.assign(S.f.add, { kind: 'recurring', person: 'Kuya Ramil', title: 'Parking share', amount: '650.00', start: '2026-11-01' }); render(); }
    if (s === 'due') openPop(duePopup(), { kind: 'center', title: 'Due this month' });
    if (s === 'paid') openPop(paidPopup(), { kind: 'center', title: 'Paid this month' });
    if (s === 'paiddetail') { openPop(paidPopup(), { kind: 'center' }); const first = E.home(base(), S.db.cash).paidRows[0]; pop.body.innerHTML = payDetail(first.d.id, first.l.id); }
    if (s === 'more') openPop(moreSheet('d3'), { kind: 'sheet', title: 'Actions' });
    if (s === 'remind') { const d = find('d3'); S.f.rem = JSON.parse(JSON.stringify(d.remind)); S.f.rem.offsets = [3, 0]; openPop(reminderSheet('d3'), { kind: 'sheet', title: 'Reminder' }); }
    if (s === 'settings') { S.f.prof = { name: S.name }; openPop(settingsSheet(), { kind: 'sheet', title: 'Settings', height: '92%' }); placeThumbs(pop.body); }
    if (s === 'cash') { S.f.cash = null; openPop(cashSheet(), { kind: 'sheet', title: 'Cash flow' }); }
    if (s === 'toast') toast('Payment logged', { sound: false });
    if (s === 'qr') go({ r: 'qr' });
    if (s === 'qrshow') go({ r: 'qrshow', id: 'q1' });
    if (s === 'qrform') { S.f.qr = { person: '', wallet: 'GCash', account: '', img: null, whoOpen: false }; go({ r: 'qrform' }); }
    if (s === 'lock' || s === 'pad') { S.gate = s; renderGate(); }
    if (s === 'open' || (!s && !qs.get('bare'))) openApp();
    const sel = document.getElementById('tbScreen'); if (sel) sel.value = s || 'home';
  }
  matchMedia && matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.appearance === 'system') render(); });
  // the small round button that shows and hides the mockup controls on a real phone
  if (fit && !document.getElementById('mockfab')) {
    const fab = document.createElement('button');
    fab.id = 'mockfab'; fab.className = 'mockfab'; fab.type = 'button'; fab.setAttribute('aria-label', 'Mockup controls'); fab.textContent = '⋯';
    fab.addEventListener('click', () => { html.classList.toggle('showbar'); fab.textContent = html.classList.contains('showbar') ? '×' : '⋯'; });
    document.body.appendChild(fab);
    document.addEventListener('change', (e) => { if (e.target.closest && e.target.closest('#bar')) { html.classList.remove('showbar'); fab.textContent = '⋯'; } });
  }
  renderBar();
  document.fonts.ready.then(() => { start(qs.get('s') || ''); window.__m = true; });
})();
