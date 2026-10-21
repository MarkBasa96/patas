/* Patas mockups v3 (2026-10-15). Follows Joe's six boards: Home, Debts, Add debt, Debt details + Log payment,
   Schedule, Reports, QR gallery. Four tabs. Fake data only: a click really changes the numbers, as in round 2.
   Money is whole centavos. Remaining and "next due" are always calculated from the payments, never typed. */
(function () {
  'use strict';
  const $ = (s, e) => (e || document).querySelector(s);
  const $$ = (s, e) => [...(e || document).querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TODAY = '2026-10-15';

  // ---------------- icons (simple stroke set; the real app uses lucide) ----------------
  const P = {
    home: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h3"/>',
    cal: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M16 2.5v4M8 2.5v4M3 10h18"/>',
    chart: '<path d="M6 20V11M12 20V4M18 20v-6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>', checkc: '<circle cx="12" cy="12" r="10"/><path d="m8 12 3 3 5-6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>', plus: '<path d="M5 12h14M12 5v14"/>',
    right: '<path d="m9 18 6-6-6-6"/>', left: '<path d="m15 18-6-6 6-6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    arrowleft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    up: '<path d="M12 19V5M5 12l7-7 7 7"/>', dn: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    search: '<circle cx="11" cy="11" r="7.5"/><path d="m21 21-4.3-4.3"/>',
    more: '<circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    bank: '<path d="M3 21h18M5 18v-7M9.5 18v-7M14.5 18v-7M19 18v-7M12 3 21 8H3z"/>',
    wallet: '<path d="M19 7V5a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v3h-3a2 2 0 0 0 0 4h3v2a1 1 0 0 1-1 1H5a2 2 0 0 1-2-2V6"/>',
    file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a2 2 0 0 0 3.4 0"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    inf: '<path d="M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.3-5.5 4z"/>',
    tag: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    pencil: '<path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.7 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4M12 16h.01"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    imageplus: '<path d="M16 5h6M19 2v6"/><path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h.01M17 21h4v-4"/>',
    settings: '<path d="M12.2 2h-.4a2 2 0 0 0-2 2v.2a2 2 0 0 1-1 1.7l-.4.3a2 2 0 0 1-2 0l-.2-.1a2 2 0 0 0-2.7.7l-.2.4a2 2 0 0 0 .7 2.7l.2.1a2 2 0 0 1 1 1.7v.5a2 2 0 0 1-1 1.7l-.2.1a2 2 0 0 0-.7 2.7l.2.4a2 2 0 0 0 2.7.7l.2-.1a2 2 0 0 1 2 0l.4.3a2 2 0 0 1 1 1.7V20a2 2 0 0 0 2 2h.4a2 2 0 0 0 2-2v-.2a2 2 0 0 1 1-1.7l.4-.3a2 2 0 0 1 2 0l.2.1a2 2 0 0 0 2.7-.7l.2-.4a2 2 0 0 0-.7-2.7l-.2-.1a2 2 0 0 1-1-1.7v-.5a2 2 0 0 1 1-1.7l.2-.1a2 2 0 0 0 .7-2.7l-.2-.4a2 2 0 0 0-2.7-.7l-.2.1a2 2 0 0 1-2 0l-.4-.3a2 2 0 0 1-1-1.7V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    palette: '<path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.9 0 1.6-.7 1.6-1.6 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16c3.3 0 6-2.7 6-6 0-4.9-4.5-9-10-9z"/><circle cx="7.5" cy="11" r="1"/><circle cx="12" cy="7" r="1"/><circle cx="16.5" cy="10" r="1"/>',
    volume: '<path d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 4 10 15 15 0 0 1-4 10 15 15 0 0 1-4-10 15 15 0 0 1 4-10z"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
    msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
    cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    sunmoon: '<path d="M12 8a2.8 2.8 0 0 0 4 4 4 4 0 1 1-4-4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.8 9.8 0 0 1 6.7 2.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.8 9.8 0 0 1-6.7-2.7L3 16M8 16H3v5"/>',
    wifioff: '<path d="M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8a15 15 0 0 0-9.4-4.7M5 12.9a10 10 0 0 1 3.3-2M19 12.9a10 10 0 0 0-3.5-2.1M8.5 16.4a5 5 0 0 1 7 0M12 20h.01M2 2l20 20"/>',
  };
  const ic = (n, c) => `<svg class="i ${c || ''}" viewBox="0 0 24 24" aria-hidden="true">${P[n] || ''}</svg>`;

  // ---------------- themes ----------------
  const hexN = (h) => parseInt(h.slice(1), 16);
  const mix = (a, b, k) => { const pa = hexN(a), pb = hexN(b); const ch = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k); return '#' + [16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('').toUpperCase(); };
  const THEMES = {
    indigo: { name: 'Patas indigo', l: { bg: '#F6F7FD', surface: '#FFFFFF', text: '#14183A', muted: '#5B6180', border: '#DDE0EF', accent: '#4F46E5', soft: '#E9EAFB', m2: '#6A63F3' }, d: { bg: '#0F1120', surface: '#181B30', text: '#ECEEFB', muted: '#A5AACB', border: '#2A2F4C', accent: '#A3A8FB', soft: '#242853', m2: '#7A72F4', fill: '#5A52E8' } },
    ink: { name: 'Ink blue', l: { bg: '#F6F6F3', surface: '#FFFFFF', text: '#161A22', muted: '#5A6170', border: '#DEDFE2', accent: '#364C8C', soft: '#E6EAF4', m2: '#5873B8' }, d: { bg: '#111318', surface: '#1A1D24', text: '#ECEEF3', muted: '#A3A9B6', border: '#2C313C', accent: '#95ADE4', soft: '#1F2740', m2: '#5873B8', fill: '#4A63A8' } },
    green: { name: 'Forest green', l: { bg: '#F6F7F6', surface: '#FFFFFF', text: '#16201B', muted: '#5B6660', border: '#DCE1DE', accent: '#1D6B45', soft: '#E3F0E8', m2: '#3F9D73' }, d: { bg: '#111513', surface: '#1A201D', text: '#EDF1EE', muted: '#A3ADA7', border: '#2C3530', accent: '#5CC48C', soft: '#1F3328', m2: '#2A8A5B', fill: '#2A7A51' } },
    lavender: { name: 'Lavender', l: { bg: '#F7F5FB', surface: '#FFFFFF', text: '#1C1830', muted: '#5F5A6E', border: '#DFDAEA', accent: '#5E4E8C', soft: '#ECE6F8', m2: '#8B7BC0' }, d: { bg: '#131219', surface: '#1C1A24', text: '#ECEAF3', muted: '#A8A5B8', border: '#2F2B3B', accent: '#BBA8F2', soft: '#2A2440', m2: '#6B4FB8', fill: '#6B58A8' } },
    teal: { name: 'Mint teal', l: { bg: '#F3F8F7', surface: '#FFFFFF', text: '#132220', muted: '#566663', border: '#D6E3E1', accent: '#0E716C', soft: '#D9F0EE', m2: '#3FAFA6' }, d: { bg: '#0F1514', surface: '#172020', text: '#E8F1EF', muted: '#9FB0AD', border: '#283533', accent: '#6DD3CA', soft: '#16332F', m2: '#1E8C84', fill: '#1F7F78' } },
    pink: { name: 'Baby pink', l: { bg: '#FBF5F7', surface: '#FFFFFF', text: '#2A1520', muted: '#6E5A63', border: '#EDDCE3', accent: '#B23A6E', soft: '#FCE4EE', m2: '#E58DB2' }, d: { bg: '#171113', surface: '#221A1D', text: '#F3ECEE', muted: '#B5A6AC', border: '#3A2C32', accent: '#F2A7C6', soft: '#3A2130', m2: '#A8456F', fill: '#A8456F' } },
  };
  const THEME_ORDER = ['indigo', 'ink', 'green', 'lavender', 'teal', 'pink'];
  function tokens(key, mode) {
    const T = THEMES[key] || THEMES.indigo, dark = mode === 'dark', s = dark ? T.d : T.l;
    const t = {
      '--bg': s.bg, '--surface': s.surface, '--text': s.text, '--muted': s.muted, '--border': s.border, '--border-soft': mix(s.border, s.surface, 0.55),
      '--accent': s.accent, '--accent-soft': s.soft, '--accent-fill': dark ? s.fill : s.accent, '--mesh2': s.m2,
      '--field': dark ? mix(s.surface, '#FFFFFF', 0.07) : mix(s.bg, s.accent, 0.07), '--track': dark ? mix(s.surface, '#FFFFFF', 0.12) : mix(s.bg, s.text, 0.1),
    };
    const sem = dark
      ? { '--peach-bg': '#3A2B20', '--peach-ink': '#FFB584', '--mint-bg': '#17342A', '--mint-ink': '#5FD6A2', '--mint-on': '#0A2A1B', '--red-bg': '#3C2024', '--danger': '#FF8F96', '--warn': '#FFA566', '--ok': '#46CFA0' }
      : { '--peach-bg': '#FDEBDD', '--peach-ink': '#BD5418', '--mint-bg': '#DDF5EA', '--mint-ink': '#1C8A5F', '--mint-on': '#FFFFFF', '--red-bg': '#FDE4E4', '--danger': '#D13F3F', '--warn': '#D9631F', '--ok': '#2FB589' };
    return Object.assign(t, sem);
  }

  // ---------------- dates and money ----------------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const iso = (dt) => dt.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = pd(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
  const addMonths = (s, n) => { const d = pd(s), day = d.getUTCDate(), t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1)); const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate(); t.setUTCDate(Math.min(day, last)); return iso(t); };
  const stepDate = (first, rep, i) => (rep === 'weekly' ? addDays(first, 7 * i) : rep === 'biweekly' ? addDays(first, 14 * i) : addMonths(first, i));
  const p2 = (n) => String(n).padStart(2, '0');
  const fShort = (s) => `${MON[+s.slice(5, 7) - 1]} ${s.slice(8, 10)}`;
  const fLong = (s) => `${fShort(s)}, ${s.slice(0, 4)}`;
  const monthName = (ym) => `${MONL[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;
  const ymOf = (s) => s.slice(0, 7);
  const addYM = (ym, n) => ymOf(addMonths(ym + '-01', n));
  const daysBetween = (a, b) => Math.round((pd(b) - pd(a)) / 86400000);
  const CURS = { PHP: ['₱', 'Philippine peso'], USD: ['$', 'US dollar'], EUR: ['€', 'Euro'], GBP: ['£', 'British pound'], JPY: ['¥', 'Japanese yen'], SGD: ['S$', 'Singapore dollar'], AUD: ['A$', 'Australian dollar'] };
  const sym = () => CURS[S.cur][0];
  const money = (c) => { const neg = c < 0; c = Math.abs(c); const t = (c / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }); return (neg ? '−' : '') + sym() + t; };
  const parseMoney = (str) => { const t = String(str || '').replace(/[^0-9.]/g, ''); if (!t || t === '.') return null; const n = Number(t); return isFinite(n) ? Math.round(n * 100) : null; };
  const cents2str = (c) => (c % 100 ? (c / 100).toFixed(2) : String(c / 100));
  const initials = (n) => { const w = String(n).trim().split(/\s+/).filter(Boolean); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };
  const isOrg = (n) => /\b(lending|bank|finance|credit|inc|corp|co\.|loans?|coop|sss|pag-?ibig|shop|store)\b/i.test(n);
  // avatar tint follows the order people were added, so the first three look like the boards (lavender, mint, blue)
  const hue = (n) => { const names = [...new Set(DB.debts.map((d) => d.person))], i = names.indexOf(n); return 'c' + (1 + (i < 0 ? [...n].reduce((a, c) => a + c.charCodeAt(0), 0) : i) % 4); };
  const hueSoft = (n) => { const names = [...new Set(DB.debts.map((d) => d.person))], i = Math.max(0, names.indexOf(n)); return ['c4', 'c1', 'c2', 'c3'][i % 4]; };

  // ---------------- data ----------------
  let idc = 1;
  const uid = (p) => p + (idc++);
  function build(demo) {
    const pay = (date, amount, method, note) => ({ id: uid('p'), date, amount, method: method || 'GCash', note: note || '' });
    let debts = [
      { id: 'd1', person: 'Maria Santos', label: 'Personal loan', type: 'inst', original: 1200000, amount: 150000, repeat: 'monthly', first: '2026-08-20', remind: 3, notes: '', payments: [pay('2026-09-20', 150000), pay('2026-10-01', 150000)], settledOn: null },
      { id: 'd2', person: 'Juan Dela Cruz', label: 'Emergency loan', type: 'one', original: 550000, due: '2026-11-05', remind: 3, notes: '', payments: [], settledOn: null },
      { id: 'd3', person: 'ABC Lending', label: 'Laptop loan', type: 'inst', original: 1000000, amount: 300000, repeat: 'monthly', first: '2026-10-28', remind: 3, notes: '', payments: [], settledOn: null },
    ];
    let qrs = [
      { id: 'q1', person: 'Maria Santos', method: 'GCash', account: 'Maria Santos', label: 'Personal loan', seed: 11, img: null, changedOn: null, savedCopyOn: null },
      { id: 'q2', person: 'Juan Dela Cruz', method: 'Maya', account: 'Juan Dela Cruz', label: 'Emergency loan', seed: 23, img: null, changedOn: null, savedCopyOn: null },
      { id: 'q3', person: 'ABC Lending', method: 'BPI', account: 'ABC Lending Corp.', label: 'Laptop loan', seed: 37, img: null, changedOn: null, savedCopyOn: null },
    ];
    if (demo === 'overdue') debts[0].first = '2026-07-20';
    if (demo === 'long') { debts[0].person = 'Maria Magdalena Santos-Villanueva de los Reyes'; debts[0].label = 'Personal loan for the family emergency back in the province'; debts[2].person = 'ABC Lending and Financing Corporation of the Philippines'; qrs[0].person = debts[0].person; qrs[2].person = debts[2].person; }
    if (demo === 'empty') { debts = []; qrs = []; }
    return { debts, qrs };
  }

  function sched(d) {
    if (d.type === 'one') return [{ date: d.due, amt: d.original, cs: 0, ce: d.original }];
    const out = []; let cum = 0, i = 0;
    while (cum < d.original && i < 240) { const a = Math.min(d.amount, d.original - cum); out.push({ date: stepDate(d.first, d.repeat, i), amt: a, cs: cum, ce: cum + a }); cum += a; i++; }
    return out;
  }
  function calc(d) {
    const paid = d.payments.reduce((s, p) => s + p.amount, 0), settled = !!d.settledOn;
    const remaining = settled ? 0 : Math.max(0, d.original - paid);
    const open = settled ? [] : sched(d).filter((x) => x.ce > paid).map((x) => ({ date: x.date, amt: x.ce - Math.max(paid, x.cs) }));
    const next = open[0] || null;
    const state = !next ? 'none' : next.date < TODAY ? 'overdue' : next.date === TODAY ? 'today' : 'upcoming';
    return { paid, settled, remaining, open, next, state, writeOff: settled ? Math.max(0, d.original - paid) : 0, pct: d.original ? Math.min(100, Math.round((paid / d.original) * 100)) : 0 };
  }
  const active = () => DB.debts.filter((d) => !d.settledOn);
  const findDebt = (id) => DB.debts.find((d) => d.id === id);
  const nextAll = () => active().map((d) => ({ d, c: calc(d) })).filter((x) => x.c.next).sort((a, b) => a.c.next.date.localeCompare(b.c.next.date) || a.d.person.localeCompare(b.d.person));
  const allOpenItems = () => active().flatMap((d) => calc(d).open.map((it) => ({ d, date: it.date, amt: it.amt })));
  const curYM = ymOf(TODAY);
  function dueIn(ym) { return allOpenItems().filter((x) => (ym === curYM ? ymOf(x.date) <= ym : ymOf(x.date) === ym)).reduce((s, x) => s + x.amt, 0); }
  const allPayments = () => DB.debts.flatMap((d) => d.payments.map((p) => ({ ...p, d })));
  const paidIn = (ym) => allPayments().filter((p) => ymOf(p.date) === ym).reduce((s, p) => s + p.amount, 0);

  // ---------------- state ----------------
  const q = new URLSearchParams(location.search);
  const store = { get(k) { try { return localStorage.getItem('patas-v3-' + k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem('patas-v3-' + k, v); } catch (e) {} } };
  const S = { device: 'android', look: 'auto', theme: 'indigo', cur: 'PHP', sounds: false, demo: 'normal', name: 'Alex', remindOn: true, remindDays: 3, month: curYM, calMonth: curYM, calSel: null, calAll: false, dtype: 'all', dq: '', rep: 'range', cash: { income: 3000000, expenses: 1200000 }, pending: 0, qrf: 'All', nav: [{ r: 'home', p: {} }], f: {} };
  if (!q.get('fresh')) ['device', 'look', 'theme', 'cur', 'demo', 'name'].forEach((k) => { const v = store.get(k); if (v) S[k] = v; });
  if (!q.get('fresh') && store.get('sounds') === '1') S.sounds = true;
  ['device', 'look', 'theme', 'cur', 'demo', 'name'].forEach((k) => { if (q.get(k)) S[k] = q.get(k); });
  if (!THEMES[S.theme]) S.theme = 'indigo';
  if (!CURS[S.cur]) S.cur = 'PHP';
  let DB = build(S.demo);
  const phone = $('#phone');
  const modeNow = () => (S.look === 'auto' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.look);

  // ---------------- sounds (off until switched on; silent money, like Gastos) ----------------
  let actx = null; const soundLog = []; window.__sounds = soundLog;
  function tone(c, type, f0, f1, t0, dur, vol) { const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur); o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.02); }
  function play(name) {
    if (!S.sounds) return; soundLog.push(name);
    try { const C = window.AudioContext || window.webkitAudioContext; if (!C) return; actx = actx || new C(); if (actx.state === 'suspended') actx.resume(); const t = actx.currentTime + 0.01;
      if (name === 'tick') { tone(actx, 'sine', 1500, 900, t, 0.06, 0.1); tone(actx, 'triangle', 240, 170, t, 0.08, 0.08); }
      else if (name === 'done') { [523.25, 659.25, 783.99].forEach((f, i) => tone(actx, 'sine', f, f, t + i * 0.13, 0.45, 0.09)); }
      else if (name === 'swish') { tone(actx, 'sawtooth', 600, 120, t, 0.14, 0.03); }
      else if (name === 'thanks') { [659.25, 987.77].forEach((f, i) => tone(actx, 'sine', f, f, t + i * 0.14, 0.4, 0.09)); } } catch (e) {}
  }

  // ---------------- chrome ----------------
  const TABS = [['home', 'Home', 'home'], ['debts', 'Debts', 'card'], ['schedule', 'Schedule', 'cal'], ['reports', 'Reports', 'chart']];
  let lastKey = '', toastTimer = null;
  const cur = () => S.nav[S.nav.length - 1];
  function applyTheme() { const t = tokens(S.theme, modeNow()); for (const k in t) phone.style.setProperty(k, t[k]); phone.dataset.device = S.device; document.body.dataset.mode = modeNow(); for (const k in t) document.body.style.setProperty(k, t[k]); }
  function statusBar() {
    const sys = S.device === 'iphone'
      ? '<svg class="i" viewBox="0 0 24 24"><path d="M3 18v-3M8 18v-6M13 18V9M18 18V6" stroke-width="2.6"/></svg><svg class="i" viewBox="0 0 24 24"><path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/></svg><svg class="i" viewBox="0 0 24 24" style="width:24px"><rect x="2" y="7" width="18" height="10" rx="3"/><rect x="4" y="9" width="12" height="6" rx="1.5" fill="currentColor" stroke="none"/></svg>'
      : '<svg class="i" viewBox="0 0 24 24"><path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/></svg><svg class="i" viewBox="0 0 24 24"><path d="M2 20 22 4v16z" fill="currentColor"/></svg><svg class="i" viewBox="0 0 24 24"><rect x="7" y="3" width="10" height="18" rx="2" fill="currentColor"/></svg>';
    return `<div class="statusbar"><span>${S.device === 'iphone' ? '9:41' : '10:30'}</span><span class="sys">${sys}</span></div>`;
  }
  function tabbar(active) {
    return `<nav class="tabbar" aria-label="Main">${TABS.map(([k, l, i]) => `<button class="tab ${active === k ? 'on' : ''}" data-a="tab" data-t="${k}" ${active === k ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span></button>`).join('')}</nav>`;
  }
  const dateF = (key, val, o) => `<div class="in dt ${o && o.bad ? 'bad' : ''}"><span class="val" id="v-${key}">${val ? fLong(val) : '<span class="muted">Pick a date</span>'}</span>${ic('down', 'chev sm')}<input type="date" data-f="${key}" value="${esc(val || '')}" ${o && o.min ? `min="${o.min}"` : ''} ${o && o.max ? `max="${o.max}"` : ''} aria-label="${esc((o && o.label) || key)}"></div>`;
  const selF = (key, val, opts, label) => `<div class="in sel"><span class="val" id="v-${key}">${esc((opts.find((o) => o[0] == val) || [0, ''])[1])}</span>${ic('down', 'chev sm')}<select data-f="${key}" aria-label="${esc(label || key)}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${v == val ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
  const REMIND = [['none', "Don't remind me"], ['0', 'On the day'], ['1', '1 day before'], ['3', '3 days before'], ['7', '1 week before']];
  const REPEAT = [['monthly', 'Monthly'], ['biweekly', 'Every 2 weeks'], ['weekly', 'Weekly']];
  const METHODS = ['Cash', 'GCash', 'Maya', 'Bank transfer', 'Other'];
  const remindLabel = (v) => (REMIND.find((r) => r[0] == v) || REMIND[3])[1];

  // ---------------- QR art (sample only: never a real code) ----------------
  function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const MCOL = { GCash: '#1B63D6', Maya: '#14A56C', BPI: '#D2232A', BDO: '#1F46B8', Other: '#1B1B25' };
  function qrSvg(v, wm) {
    const N = 29, r = rng(v.seed || 1), col = MCOL[v.method] || MCOL.Other; let s = `<svg viewBox="0 0 33 33" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sample QR code"><rect width="33" height="33" fill="#fff"/><g transform="translate(2 2)">`;
    const fin = (x, y) => (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!fin(x, y) && r() > 0.52 && !(x > 11 && x < 17 && y > 11 && y < 17)) s += `<rect x="${x}" y="${y}" width="1" height="1" fill="#14162A"/>`;
    [[0, 0], [N - 7, 0], [0, N - 7]].forEach(([x, y]) => { s += `<rect x="${x}" y="${y}" width="7" height="7" fill="${col}"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" fill="${col}"/>`; });
    s += `<circle cx="14.5" cy="14.5" r="3.4" fill="#fff"/><circle cx="14.5" cy="14.5" r="2.5" fill="${col}"/><text x="14.5" y="15.7" font-size="3.3" font-weight="800" text-anchor="middle" fill="#fff" font-family="Inter,Arial">${esc((v.method || '?')[0])}</text></g>`;
    if (wm !== false) s += `<g transform="rotate(-22 16.5 16.5)"><rect x="-4" y="13.6" width="38" height="5.6" fill="#fff" fill-opacity=".82"/><text x="16.5" y="17.6" font-size="4.4" font-weight="800" text-anchor="middle" fill="#8A8EA6" letter-spacing=".4" font-family="Inter,Arial">SAMPLE</text></g>`;
    return s + '</svg>';
  }
  const qrArt = (v) => (v.img ? `<img src="${esc(v.img)}" alt="Your payment QR code">` : qrSvg(v));

  // ---------------- screens ----------------
  const R = {};
  const offlineBanner = () => (S.demo === 'offline' ? `<div class="banner off" style="margin:4px 0 6px">${ic('wifioff')}<span>You're offline. Saves wait on this phone and sync later${S.pending ? ` <span class="pendingpill">${S.pending} waiting</span>` : ''}.</span></div>` : '');
  const appbar = (right) => `<div class="appbar"><div class="brand"><img src="${LOGO}" alt="">PATAS</div>${right}</div>`;

  R.home = () => {
    const ds = active(), total = ds.reduce((s, d) => s + calc(d).remaining, 0), m = S.month, due = dueIn(m), paid = paidIn(m), nx = nextAll()[0];
    const cf = S.cash, left = cf.income - cf.expenses - paid;
    const next = nx ? `<button class="card nextrow" style="width:100%" data-a="go" data-r="debt" data-id="${nx.d.id}"><span class="avatar ${isOrg(nx.d.person) ? 'org' : hue(nx.d.person)}">${isOrg(nx.d.person) ? ic('bank') : esc(initials(nx.d.person))}</span><div class="grow"><div class="sb ell">${esc(nx.d.person)}</div><div class="t13 muted ell">${nx.d.type === 'inst' ? ({ monthly: 'Monthly', weekly: 'Weekly', biweekly: 'Every 2 weeks' }[nx.d.repeat]) + ' installment' : 'One-time'}</div></div><div style="text-align:right"><div class="sb num" style="font-size:17px">${money(nx.c.next.amt)}</div><div class="t13 ${nx.c.state === 'overdue' ? 'status over' : 'muted'}">${nx.c.state === 'overdue' ? 'Overdue · ' : nx.c.state === 'today' ? 'Due today · ' : 'Due '}${fShort(nx.c.next.date)}</div></div></button>`
      : `<div class="card"><div class="muted t14">${ds.length ? "You're all caught up. Nothing is due." : 'Nothing due yet. Add your first debt to see it here.'}</div></div>`;
    return { tab: 'home', html: `${offlineBanner()}${appbar(`<button class="avatar-btn" data-a="go" data-r="settings" aria-label="Settings">${esc((S.name || 'A')[0].toUpperCase())}</button>`)}
      <h1 class="big">Hi, ${esc(S.name)}</h1>
      <button class="monthpick" data-a="monthsheet">${monthName(m)} ${ic('down', 'sm')}</button>
      <button class="hero" data-a="tab" data-t="debts"><div class="lab">Total I owe</div><div class="amt num">${money(total)}</div><div class="sub">${ds.length} active ${ds.length === 1 ? 'debt' : 'debts'}</div>${ic('right', 'chev lg')}<svg class="wave" viewBox="0 0 210 70"><path d="M0 70C40 10 100 0 140 30S190 60 210 40V70z" fill="#fff"/></svg></button>
      <div class="tiles"><button class="tile peach" data-a="tab" data-t="schedule"><span class="tic">${ic('cal', 'lg')}</span><div><div class="tl">Due this month</div><div class="ta num">${money(due)}</div></div>${ic('right', 'sm tchev')}</button>
        <button class="tile mint" data-a="tab" data-t="reports"><span class="tic">${ic('check')}</span><div><div class="tl">Paid this month</div><div class="ta num">${money(paid)}</div></div>${ic('right', 'sm tchev')}</button></div>
      <div class="card"><div class="sechead"><h2>Monthly cash flow</h2><button class="link" data-a="cashsheet">View details ${ic('right', 'sm')}</button></div>
        <div class="cf-row"><span class="cf-ic up">${ic('up', 'sm')}</span><span class="grow">Income</span><span class="num">${money(cf.income)}</span></div>
        <div class="cf-row"><span class="cf-ic dn">${ic('dn', 'sm')}</span><span class="grow">Expenses</span><span class="num">${money(cf.expenses)}</span></div>
        <div class="cf-row"><span class="cf-ic cd">${ic('card', 'sm')}</span><span class="grow">Debt payments</span><span class="num">${money(paid)}</span></div>
        <div class="cf-remain">${ic('wallet')}<span>Cash remaining</span><span class="v num">${money(left)}</span></div></div>
      <div class="sechead" style="margin:14px 0 8px"><h2>Next payment</h2>${nx ? `<button class="link" data-a="tab" data-t="schedule">${ic('right', 'sm')}</button>` : ''}</div>${next}
      <div class="btnrow"><button class="btn primary half" data-a="go" data-r="adddebt">${ic('plus')} Add debt</button><button class="btn outline half" data-a="logfromhome" ${ds.length ? '' : 'disabled'}>${ic('file')} Log payment</button></div>` };
  };

  function debtCard(d) {
    const c = calc(d), inst = d.type === 'inst', st = c.settled
      ? `<span class="status ok">Settled</span>` : c.state === 'overdue' ? `<span class="status over">Overdue</span>` : c.state === 'today' ? `<span class="status today">Due today</span>` : `<span class="status up">Upcoming</span>`;
    return `<button class="debt" data-a="go" data-r="debt" data-id="${d.id}"><div class="top"><span class="avatar ${hue(d.person)}">${esc(initials(d.person))}</span><div class="grow"><div class="sb ell">${esc(d.person)}</div><div class="t13 muted ell">${esc(d.label)}</div></div><span class="badge ${c.settled ? 'settled' : inst ? 'inst' : 'one'}">${c.settled ? 'Settled' : inst ? 'Installments' : 'One-time'}</span></div>
      <div class="bot"><div class="grow"><div class="rem num">${money(c.remaining)} <span style="font-weight:500">remaining</span></div><div class="bar-track"><div class="bar-fill" style="width:${c.pct}%"></div></div></div>
      ${c.next ? `<div class="due"><div class="when num">${ic('cal', 'sm')} ${money(c.next.amt)} • ${fShort(c.next.date)}</div>${st}</div>` : `<div class="due">${st}</div>`}</div></button>`;
  }
  function debtList() {
    const f = S.dtype, qq = S.dq.trim().toLowerCase();
    const ds = active().filter((d) => (f === 'all' || d.type === (f === 'one' ? 'one' : 'inst')) && (!qq || (d.person + ' ' + d.label).toLowerCase().includes(qq)));
    ds.sort((a, b) => ((calc(a).next || { date: '9999' }).date).localeCompare((calc(b).next || { date: '9999' }).date));
    const tot = ds.reduce((s, d) => s + calc(d).remaining, 0);
    const empty = !ds.length ? (active().length ? `<div class="empty"><div class="ei">${ic('search', 'lg')}</div><h3>Nothing matches</h3><div>Try another word or filter.</div></div>` : `<div class="empty"><div class="ei">${ic('card', 'lg')}</div><h3>No debts yet</h3><div>Tap + to add the first one.</div></div>`) : '';
    return { sum: `<div class="outstanding"><span class="oc">${ic('wallet', 'lg')}</span><div><div class="ol">Outstanding</div><div class="oa num">${money(tot)}</div></div></div>`, list: ds.map(debtCard).join('') + empty };
  }
  R.debts = () => {
    const L = debtList(), nSet = DB.debts.filter((d) => d.settledOn).length;
    return { tab: 'debts', fab: `<button class="fab" data-a="go" data-r="adddebt" aria-label="Add debt">${ic('plus')}</button>`, html: `${offlineBanner()}${appbar(`<button class="circ-btn" data-a="go" data-r="adddebt" aria-label="Add debt">${ic('plus', 'lg')}</button>`)}<h1 class="big">My debts</h1>
      <label class="search">${ic('search')}<input id="dq" type="search" placeholder="Search a person or debt" value="${esc(S.dq)}" autocomplete="off" aria-label="Search a person or debt"></label>
      <div class="chips" role="group" aria-label="Type">${[['all', 'All'], ['one', 'One-time'], ['inst', 'Installments']].map(([k, l]) => `<button class="chip ${S.dtype === k ? 'on' : ''}" data-a="dtype" data-v="${k}" aria-pressed="${S.dtype === k}">${l}</button>`).join('')}</div>
      <div id="dsum">${L.sum}</div><div id="dlist">${L.list}</div>
      <button class="settledlink" data-a="go" data-r="settled">${ic('list')}<span>View settled debts${nSet ? ` (${nSet})` : ''}</span>${ic('right', 'chev sm')}</button><div style="height:70px"></div>` };
  };
  R.settled = () => {
    const ds = DB.debts.filter((d) => d.settledOn);
    return { tab: 'debts', html: `${formHead('Settled debts')}${ds.length ? ds.map(debtCard).join('') : `<div class="empty"><div class="ei">${ic('check', 'lg')}</div><h3>Nothing settled yet</h3><div>When a debt reaches zero it moves here.</div></div>`}` };
  };

  function formHead(title, o) {
    o = o || {};
    const left = o.cancel && S.device === 'iphone' ? `<button class="cancel" data-a="back">Cancel</button>` : `<button class="back" data-a="back" aria-label="Back">${S.device === 'iphone' ? ic('left', 'lg') : ic('arrowleft', 'lg')}</button>`;
    return `<div class="formhead">${left}<div class="ttl">${esc(title)}</div>${o.kebab ? `<button class="kebab" data-a="${o.kebab}" aria-label="More">${ic('more', 'lg')}</button>` : '<span style="width:40px"></span>'}</div>`;
  }

  R.debt = (p) => {
    const d = findDebt(p.id); if (!d) return R.debts();
    const c = calc(d), hist = [...d.payments].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    const repLabel = { monthly: 'Monthly', weekly: 'Weekly', biweekly: 'Every 2 weeks' }[d.repeat];
    const tiles = c.settled ? `<div class="settledmark">${ic('check', 'sm')} Settled on ${fLong(d.settledOn)}${c.writeOff ? ` · ${money(c.writeOff)} written off` : ''}</div>`
      : d.type === 'inst' ? `<div class="mini"><div class="card"><span class="mic">${ic('cal', 'lg')}</span><div><div class="ml">${repLabel} payment</div><div class="mv num">${money(d.amount)}</div></div></div><div class="card"><span class="mic">${ic('cal', 'lg')}</span><div><div class="ml">Next due</div><div class="mv ${c.state === 'overdue' ? 'status over' : ''}">${c.next ? fShort(c.next.date) : '—'}</div></div></div></div>`
      : `<div class="mini"><div class="card"><span class="mic">${ic('cal', 'lg')}</span><div><div class="ml">Due date</div><div class="mv ${c.state === 'overdue' ? 'status over' : ''}">${fShort(d.due)}</div></div></div><div class="card"><span class="mic">${ic('bell', 'lg')}</span><div><div class="ml">Reminder</div><div class="mv" style="font-size:14.5px">${esc(remindLabel(d.remind))}</div></div></div></div>`;
    const warn = c.state === 'overdue' ? `<div class="banner warn">${ic('alert' in P ? 'alert' : 'info')}<span>${money(c.next.amt)} was due ${fLong(c.next.date)} (${daysBetween(c.next.date, TODAY)} days ago).</span></div>` : '';
    return { tab: 'debts', html: `${formHead('Debt details', { kebab: 'debtmenu' })}
      <div class="dhead"><span class="avatar ${isOrg(d.person) ? 'org' : hue(d.person)}">${isOrg(d.person) ? ic('bank', 'lg') : esc(initials(d.person))}</span><div class="grow"><div style="font-size:20px;font-weight:700;line-height:1.2" class="ell">${esc(d.person)}</div><div class="muted ell">${esc(d.label)}</div></div></div>
      <div class="bigrem num">${money(c.remaining)}</div><div class="muted" style="margin:0 0 12px;font-size:16px">remaining</div>${warn}
      <div class="card progcard"><div class="t"><span class="num">${money(c.paid)} of ${money(d.original)} paid</span><span>${c.pct}%</span></div><div class="progbar"><i style="width:${c.pct}%"></i></div></div>
      ${tiles}${d.notes ? `<div class="note">${ic('file', 'sm')}<span>${esc(d.notes)}</span></div>` : ''}
      <div class="hist"><h3>Payment history</h3>${hist.length ? hist.map((x) => `<button class="hrow" data-a="paysheet" data-id="${d.id}" data-pid="${x.id}"><div><div class="hd">${fLong(x.date)} · ${esc(x.method)}</div><div class="ha num">${money(x.amount)}</div></div><span class="tag">Recorded</span></button>`).join('') : `<div class="muted t14" style="padding:6px 2px">No payments yet.</div>`}</div>
      <div class="savebar">${c.settled ? `<button class="btn outline block" data-a="reopen" data-id="${d.id}">${ic('refresh')} Reopen debt</button>` : `<button class="btn primary block" data-a="logpay" data-id="${d.id}">${ic('plus')} Log payment</button>`}</div>` };
  };

  // ---- Add / edit debt ----
  function newAD(src) {
    if (src) return { id: src.id, person: src.person, label: src.label, amount: cents2str(src.original), type: src.type, due: src.due || '', payment: src.amount ? cents2str(src.amount) : '', repeat: src.repeat || 'monthly', first: src.first || '', remind: src.remind == null ? 'none' : String(src.remind), notes: src.notes || '', dirty: false };
    return { id: null, person: '', label: '', amount: '', type: 'one', due: '', payment: '', repeat: 'monthly', first: '', remind: S.remindOn ? String(S.remindDays) : 'none', notes: '', dirty: false };
  }
  function adErrors() {
    const f = S.f.ad, e = {}, amt = parseMoney(f.amount), pay = parseMoney(f.payment);
    if (!f.person.trim()) e.person = 1; if (!f.label.trim()) e.label = 1; if (!amt || amt <= 0) e.amount = 1;
    if (f.type === 'one') { if (!f.due) e.due = 1; } else { if (!pay || pay <= 0) e.payment = 1; else if (amt && pay > amt) e.payment = 'Payment can’t be more than the amount borrowed.'; if (!f.first) e.first = 1; }
    return e;
  }
  R.adddebt = () => {
    const f = S.f.ad, i = S.device === 'iphone', edit = !!f.id;
    const names = [...new Set(DB.debts.map((d) => d.person))];
    return { tab: null, html: `${offlineBanner()}${formHead(edit ? 'Edit debt' : 'Add debt', { cancel: true })}
      ${edit ? '' : `<div class="muted t14" style="margin:-2px 2px 10px;text-align:center">One-time borrowing or a repeating repayment schedule</div>`}
      <div class="formcard">
        <div class="fld"><label for="f-person">${i ? 'Creditor' : 'Who do you owe?'}</label><div class="frow"><span class="fic">${ic('user')}</span><div class="in"><input id="f-person" data-f="person" list="plist" value="${esc(f.person)}" placeholder="${i ? 'Maria Santos' : 'Juan Dela Cruz'}" autocomplete="off"><datalist id="plist">${names.map((n) => `<option value="${esc(n)}">`).join('')}</datalist></div></div></div>
        <div class="fld"><label for="f-label">What is it for?</label><div class="frow"><span class="fic">${ic('file')}</span><div class="in"><input id="f-label" data-f="label" value="${esc(f.label)}" placeholder="${i ? 'Personal loan' : 'Emergency loan'}" autocomplete="off"></div></div></div>
        <div class="fld"><label for="f-amount">Amount borrowed</label><div class="frow"><span class="fic"><b>${esc(sym())}</b></span><div class="in"><input id="f-amount" data-f="amount" inputmode="decimal" value="${esc(f.amount)}" placeholder="0" autocomplete="off"></div></div></div>
        <div class="seg" role="group" aria-label="Debt type"><button data-a="adtype" data-v="one" class="${f.type === 'one' ? 'on' : ''}" aria-pressed="${f.type === 'one'}">${ic('checkc', 'sm')} One-time</button><button data-a="adtype" data-v="inst" class="${f.type === 'inst' ? 'on' : ''}" aria-pressed="${f.type === 'inst'}">${ic('chart', 'sm')} Installments</button></div>
        <div id="adtypebody">${adTypeBody()}</div></div>
      <div class="savebar"><button class="btn primary block" id="adsave" data-a="adsave" disabled>${edit ? 'Save changes' : 'Save debt'}</button></div>` };
  };
  function adTypeBody() {
    const f = S.f.ad;
    if (f.type === 'one') return `<div class="fld"><div class="lbl">Due date</div><div class="frow"><span class="fic">${ic('cal')}</span>${dateF('due', f.due, { label: 'Due date' })}</div></div>
      <div class="fld"><div class="lbl">Remind me</div><div class="frow"><span class="fic">${ic('bell')}</span>${selF('remind', f.remind, REMIND, 'Remind me')}</div></div>
      <div class="fld" style="margin-bottom:4px"><label for="f-notes">Notes <span class="opt">(optional)</span></label><textarea id="f-notes" class="nt" data-f="notes" placeholder="Add any notes…">${esc(f.notes)}</textarea></div>`;
    return `<div class="fld"><label for="f-payment">Payment amount</label><div class="frow"><span class="fic"><b>${esc(sym())}</b></span><div class="in"><input id="f-payment" data-f="payment" inputmode="decimal" value="${esc(f.payment)}" placeholder="0" autocomplete="off"></div></div><div class="hint bad" id="h-payment" hidden></div></div>
      <div class="fld"><div class="lbl">Repeat</div><div class="frow"><span class="fic">${ic('repeat')}</span>${selF('repeat', f.repeat, REPEAT, 'Repeat')}</div></div>
      <div class="fld"><div class="lbl">First due date</div><div class="frow"><span class="fic">${ic('cal')}</span>${dateF('first', f.first, { label: 'First due date' })}</div></div>
      <div class="infocard"><span class="big">${ic('inf', 'lg')}</span><div><div class="sb" style="font-size:14px">Ends when balance is paid</div><div class="t13 muted" id="adplan">No new principal will be added.</div></div></div>
      <div class="fld" style="margin-bottom:4px"><div class="lbl">Remind me</div><div class="frow"><span class="fic">${ic('bell')}</span>${selF('remind', f.remind, REMIND, 'Remind me')}</div></div>`;
  }
  function refreshAD() {
    const f = S.f.ad; if (!f) return;
    const e = adErrors(), btn = $('#adsave'); if (btn) btn.disabled = !!Object.keys(e).length;
    const h = $('#h-payment'); if (h) { h.hidden = typeof e.payment !== 'string'; h.textContent = typeof e.payment === 'string' ? e.payment : ''; }
    const pl = $('#adplan'); if (pl) { const amt = parseMoney(f.amount), pay = parseMoney(f.payment); if (amt && pay && pay > 0 && pay <= amt && f.first) { const n = Math.ceil(amt / pay); pl.textContent = `${n} ${n === 1 ? 'payment' : 'payments'} · last one ${fLong(stepDate(f.first, f.repeat, n - 1))}`; } else pl.textContent = 'No new principal will be added.'; }
  }

  // ---- Log payment ----
  R.logpay = (p) => {
    const d = findDebt(p.id); if (!d) return R.debts();
    const f = S.f.lp, c = calc(d), cap = c.remaining + (f.editId ? (d.payments.find((x) => x.id === f.editId) || { amount: 0 }).amount : 0);
    return { tab: 'debts', html: `${offlineBanner()}${formHead(f.editId ? 'Edit payment' : 'Log payment')}
      <div class="row" style="margin:2px 0 14px"><span class="avatar ${isOrg(d.person) ? 'org' : hue(d.person)}">${isOrg(d.person) ? ic('bank') : esc(initials(d.person))}</span><div class="grow"><div class="sb ell" style="font-size:16.5px">${esc(d.person)}</div><div class="muted ell t14">${esc(d.label)}</div></div><div style="text-align:right"><div class="t12 muted">Current balance</div><div class="sb num" style="font-size:19px">${money(cap)}</div></div></div>
      <div class="fld"><label for="f-lamount">Amount</label><div class="in" id="amtbox"><span class="pre">${esc(sym())}</span><input id="f-lamount" data-f="amount" inputmode="decimal" value="${esc(f.amount)}" autocomplete="off"></div><div class="hint bad" id="h-lamount" hidden></div></div>
      <div class="fld"><div class="lbl">Payment date</div><div class="frow">${dateF('date', f.date, { max: TODAY, label: 'Payment date' })}</div></div>
      <div class="fld"><div class="lbl">Payment method</div>${selF('method', f.method, METHODS.map((m) => [m, m]), 'Payment method')}</div>
      <div class="fld"><label for="f-lnote">Note <span class="opt">(optional)</span></label><div class="in"><input id="f-lnote" data-f="note" value="${esc(f.note)}" placeholder="Add a note…" autocomplete="off"></div></div>
      <div class="remainafter" id="remafter"><span>${ic('chart', 'lg')}</span><div><div class="l">Remaining after payment</div><div class="v num" id="remv">${money(cap)}</div></div></div>
      <div class="note">${ic('info', 'sm')}<span>Records a payment you already made. Patas never moves money.</span></div>
      <div class="savebar"><button class="btn primary block" id="lpsave" data-a="lpsave" disabled>${f.editId ? 'Save changes' : 'Save payment'}</button></div>`, cap };
  };
  function refreshLP() {
    const f = S.f.lp; if (!f) return; const d = findDebt(f.debtId); if (!d) return;
    const c = calc(d), cap = c.remaining + (f.editId ? (d.payments.find((x) => x.id === f.editId) || { amount: 0 }).amount : 0), amt = parseMoney(f.amount), ok = amt && amt > 0 && amt <= cap && f.date && f.date <= TODAY;
    const btn = $('#lpsave'); if (btn) btn.disabled = !ok;
    const h = $('#h-lamount'); if (h) { h.hidden = !(amt && amt > cap); h.textContent = amt > cap ? `That's more than what's left (${money(cap)}).` : ''; }
    const box = $('#amtbox'); if (box) box.classList.toggle('bad', !!(amt && amt > cap));
    const rv = $('#remv'), ra = $('#remafter'); if (rv) rv.textContent = amt && amt > 0 ? money(Math.max(0, cap - amt)) : money(cap); if (ra) ra.classList.toggle('bad', !!(amt && amt > cap));
  }

  // ---- Schedule ----
  R.schedule = () => {
    const m = S.calMonth, first = pd(m + '-01'), dow = first.getUTCDay(), dim = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    const items = allOpenItems(), byDate = {}; items.forEach((x) => { (byDate[x.date] = byDate[x.date] || []).push(x); });
    const cells = []; const prevLast = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 0)).getUTCDate();
    for (let i = 0; i < dow; i++) cells.push(`<span class="d out">${prevLast - dow + 1 + i}</span>`);
    for (let d = 1; d <= dim; d++) {
      const ds = `${m}-${p2(d)}`, has = byDate[ds], cls = [has ? (ds < TODAY ? 'over' : 'due') : '', ds === TODAY ? 'today' : '', S.calSel === ds ? 'sel' : ''].join(' ');
      cells.push(has ? `<button class="${cls}" data-a="calday" data-d="${ds}" aria-label="${fLong(ds)}, ${has.length} due">${d}</button>` : `<span class="d ${cls}">${d}</span>`);
    }
    let n = 1; while (cells.length % 7) cells.push(`<span class="d out">${n++}</span>`);
    let list = items.filter((x) => (S.calAll ? true : S.calSel ? x.date === S.calSel : m === curYM ? ymOf(x.date) <= m : ymOf(x.date) === m)).sort((a, b) => a.date.localeCompare(b.date));
    const shown = list.slice(0, S.calAll ? 40 : 12), tot = dueIn(m);
    return { tab: 'schedule', html: `${offlineBanner()}${appbar(`<button class="avatar-btn" data-a="go" data-r="settings" aria-label="Settings">${ic('user')}</button>`)}<h1 class="big">Payment schedule</h1>
      <div class="cal"><div class="calhead"><button data-a="calnav" data-v="-1" aria-label="Previous month">${ic('left')}</button><span>${monthName(m)}</span><button data-a="calnav" data-v="1" aria-label="Next month">${ic('right')}</button></div>
        <div class="calgrid">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((x) => `<span class="dow">${x}</span>`).join('')}${cells.join('')}</div></div>
      <div class="sechead" style="margin:16px 0 8px"><h2>${S.calSel ? 'Due ' + fShort(S.calSel) : 'Upcoming payments'}</h2><button class="link" data-a="calall">${S.calAll || S.calSel ? 'Show month' : 'View all'} ${ic('right', 'sm')}</button></div>
      ${shown.length ? shown.map((x) => `<button class="uprow" data-a="go" data-r="debt" data-id="${x.d.id}"><span class="avatar ${isOrg(x.d.person) ? 'org' : hueSoft(x.d.person)}">${isOrg(x.d.person) ? ic('bank') : esc(initials(x.d.person))}</span><div class="grow"><div class="sb ell">${esc(x.d.person)}</div><div class="t13 ${x.date < TODAY ? 'status over' : 'muted'}">${x.date < TODAY ? 'Overdue since' : 'Due'} ${fLong(x.date)}</div></div><div class="sb num">${money(x.amt)}</div>${ic('right', 'sm chev muted')}</button>`).join('') : `<div class="card muted t14">Nothing due ${S.calSel ? 'on this day' : 'in ' + monthName(m)}.</div>`}
      <div class="dueplate"><div><div class="l">Total due ${m === curYM ? 'this month' : 'in ' + MONL[+m.slice(5, 7) - 1]}</div><div class="a num">${money(tot)}</div></div><span class="ci">${ic('cal', 'lg')}</span></div>
      <div class="remrow"><span class="rb">${ic('bell')}</span><button class="grow" data-a="remindsheet"><div class="sb">Remind me</div><div class="t13 muted">${S.remindOn ? remindLabel(String(S.remindDays)) : 'Off'}</div></button><button class="sw ${S.remindOn ? 'on' : ''}" data-a="remindtoggle" role="switch" aria-checked="${S.remindOn}" aria-label="Reminders"></button></div>` };
  };

  // ---- Reports ----
  function repRange() { const pm = allPayments().map((p) => ymOf(p.date)).sort(); const a = pm[0] || curYM; return { a, label: a === curYM ? monthName(curYM) : `${MON[+a.slice(5, 7) - 1]}–${MON[+curYM.slice(5, 7) - 1]} ${curYM.slice(0, 4)}` }; }
  R.reports = () => {
    const rg = repRange(), per = S.rep === 'month' ? { a: curYM, label: monthName(curYM) } : S.rep === 'all' ? { a: '0000-00', label: 'All time' } : rg;
    const pays = allPayments().filter((p) => ymOf(p.date) >= per.a && ymOf(p.date) <= curYM), rep = pays.reduce((s, p) => s + p.amount, 0);
    const start = DB.debts.reduce((s, d) => s + d.original, 0), rem = active().reduce((s, d) => s + calc(d).remaining, 0), wo = DB.debts.reduce((s, d) => s + calc(d).writeOff, 0);
    const repAll = allPayments().reduce((s, p) => s + p.amount, 0), pctR = start ? repAll / start * 100 : 0;
    const by = {}; active().forEach((d) => { by[d.person] = (by[d.person] || 0) + calc(d).remaining; });
    const rows = Object.entries(by);
    return { tab: 'reports', html: `${offlineBanner()}${appbar(`<button class="avatar-btn" data-a="go" data-r="settings" aria-label="Settings">${ic('user')}</button>`)}
      <div class="pagehead"><h1 class="big" style="margin:6px 0">Debt progress</h1><button class="periodpick" data-a="persheet">${per.label} ${ic('down', 'sm')}</button></div>
      <div class="repto" style="margin-top:12px"><span class="ri">${ic('wallet', 'lg')}</span><div><div class="rl">Total repaid</div><div class="rv num">${money(rep)}</div></div></div>
      <div class="pair"><div class="card"><div class="pl">Starting debt</div><div class="pv num">${money(start)}</div></div><div class="card"><div class="pl">Remaining debt</div><div class="pv num">${money(rem)}</div></div></div>
      <div class="bigbar" role="img" aria-label="${pctR.toFixed(1)} percent repaid"><i style="width:${Math.min(100, pctR)}%"></i></div>
      <div class="bbl"><div><span class="num">${money(repAll)}</span> repaid<div class="s">(${pctR.toFixed(1)}%)</div></div><div style="text-align:right"><span class="num">${money(rem)}</span> remaining<div class="s">(${start ? (100 - pctR - (wo / start) * 100).toFixed(1) : '0.0'}%)</div></div></div>
      ${wo ? `<div class="note">${ic('info', 'sm')}<span>${money(wo)} was written off when you settled a debt for less.</span></div>` : ''}
      <h2 style="font-size:17px;margin:18px 0 6px">Balance by creditor</h2>
      <div class="card" style="padding:4px 14px">${rows.length ? rows.map(([n, v]) => `<button class="cred" data-a="credgo" data-n="${esc(n)}"><span class="avatar ${isOrg(n) ? 'org' : hueSoft(n)}">${isOrg(n) ? ic('bank') : ic('user')}</span><span class="grow ell">${esc(n)}</span><span class="sb num">${money(v)}</span>${ic('right', 'sm chev muted')}</button>`).join('') : `<div class="muted t14" style="padding:14px 0">No balances. You're patas with everyone.</div>`}</div>
      <button class="recbar" data-a="recsheet"><span class="rb">${ic('file')}</span><div class="grow"><div class="sb">${pays.length} ${pays.length === 1 ? 'payment' : 'payments'} recorded</div><div class="t13 muted">${per.label}</div></div>${ic('right', 'chev muted')}</button>
      <button class="btn outline block" data-a="exportsheet">${ic('download')} Export report</button>` };
  };

  // ---- QR gallery ----
  const vOf = (id) => DB.qrs.find((v) => v.id === id);
  const recent = (v) => v.changedOn && daysBetween(v.changedOn, TODAY) <= 14;
  const stale = (v) => v.changedOn && v.savedCopyOn && v.staleCopy; // a copy was saved, then the QR was replaced
  const bankish = (m) => m !== 'GCash' && m !== 'Maya';
  R.qr = () => {
    const f = S.qrf, list = DB.qrs.filter((v) => f === 'All' || (f === 'Banks' ? bankish(v.method) : v.method === f));
    return { tab: null, html: `${formHead('QR gallery')}
      <div class="muted t14" style="margin:-4px 2px 6px">Keep payment references linked to the people you owe.</div>
      <label class="search">${ic('search')}<input id="qq" type="search" placeholder="Search name or payment method" autocomplete="off" aria-label="Search QR codes"></label>
      <div class="chips" style="margin-bottom:12px">${['All', 'GCash', 'Maya', 'Banks'].map((k) => `<button class="chip ${f === k ? 'on' : ''}" data-a="qrf" data-v="${k}" aria-pressed="${f === k}">${k}</button>`).join('')}</div>
      <div id="qrgrid" class="qrgrid">${qrCards(list)}</div>${!DB.qrs.length ? `<div class="empty"><div class="ei">${ic('qr', 'lg')}</div><h3>No QR codes yet</h3><div>Save a payment QR so paying someone is one tap.</div></div>` : ''}
      <div class="note" style="margin-top:12px">${ic('lock', 'sm')}<span>QR images are private to you. They stay out of backups unless you choose to include them.</span></div>
      <div class="savebar"><button class="btn primary block" data-a="go" data-r="qradd">${ic('plus')} Add QR</button></div>` };
  };
  function qrCards(list) { return list.map((v) => `<button class="qrcard" data-a="go" data-r="qrdetail" data-id="${v.id}"><span class="qimg">${qrArt(v)}</span><div class="qn"><span class="ell">${esc(v.person)}</span><span data-a="qrmenu" data-id="${v.id}" role="button" tabindex="0" aria-label="Options" style="padding:4px 2px;margin-right:-4px">${ic('more')}</span></div><span class="mth ${v.method}">${esc(v.method)}</span></button>`).join(''); }
  R.qrdetail = (p) => {
    const v = vOf(p.id); if (!v) return R.qr();
    const ip = S.device === 'iphone', debt = DB.debts.find((d) => d.person === v.person && !d.settledOn);
    const banner = stale(v) ? `<div class="banner warn">${ic('shield')}<span>QR changed on ${fLong(v.changedOn)}. You saved a copy of the old QR on ${fLong(v.savedCopyOn)}. Delete that copy so you don't pay from it by mistake.</span></div>` : recent(v) ? `<div class="banner warn">${ic('shield')}<span>QR changed on ${fLong(v.changedOn)}. Check the account name below before you pay.</span></div>` : '';
    return { tab: null, html: `${formHead(v.person, { kebab: 'qrmenu2' })}<div class="qrcentre"><span class="mth ${v.method}" style="font-size:14px;padding:6px 16px;margin:0">${esc(v.method)}</span></div>${banner}
      <div class="qrbig">${qrArt(v)}</div>
      <div class="acct"><div class="al">Account name</div><div class="an">${esc(v.account)}</div>${v.label ? `<span class="lblchip">${esc(v.label)}</span>` : ''}</div>
      <div class="btnrow">${ip ? `<button class="btn primary block" data-a="qrout" data-id="${v.id}" data-k="share">${ic('share')} Share QR</button>` : `<button class="btn soft half" data-a="qrout" data-id="${v.id}" data-k="save">${ic('download')} Save to phone</button><button class="btn primary half" data-a="qrout" data-id="${v.id}" data-k="share">${ic('share')} Share QR</button>`}</div>
      <div class="banner info" style="margin-top:12px">${ic('info')}<span>Open your payment app and upload this image. Wallets read QR codes from your gallery.</span></div>
      <div class="muted t13" style="text-align:center;margin:8px 0 4px">After paying, log your payment in Patas.</div>
      <div class="savebar"><button class="btn primary block" data-a="logfromqr" data-id="${v.id}">${ic('file')} Log payment</button></div>` };
  };
  function newQF(src, person) { return src ? { id: src.id, person: src.person, method: src.method, account: src.account, label: src.label, img: src.img, picked: !!src.img, dirty: false } : { id: null, person: person || (DB.debts[0] || {}).person || '', method: 'GCash', account: person || (DB.debts[0] || {}).person || '', label: '', img: null, picked: false, dirty: false }; }
  R.qradd = () => {
    const f = S.f.qf, persons = [...new Set(DB.debts.map((d) => d.person))], ip = S.device === 'iphone';
    return { tab: null, html: `${formHead(f.id ? 'Edit QR' : 'Add payment QR', { cancel: true })}
      <div class="dropzone" id="dz">${f.img ? `<img src="${f.img}" alt="QR you picked">` : `<div><div class="dz-i">${ic('imageplus', 'lg')}</div><div class="dz-t">Choose QR image</div><div class="muted t13">JPG, PNG up to 5 MB</div></div>`}<input type="file" id="qrfile" accept="image/png,image/jpeg" aria-label="Choose QR image"></div>
      <div class="hint bad" id="h-qr" hidden style="margin-top:8px"></div>
      <div class="fld" style="margin-top:14px"><div class="lbl">Link to person</div><div class="frow">${persons.length ? selF('person', f.person, persons.map((n) => [n, n]), 'Link to person') : '<div class="in muted">Add a debt first</div>'}</div></div>
      <div class="fld"><div class="lbl">Payment method</div><div class="frow">${selF('method', f.method, ['GCash', 'Maya', 'BPI', 'BDO', 'Other'].map((n) => [n, n]), 'Payment method')}</div></div>
      <div class="fld"><label for="f-account">Account name</label><div class="in"><input id="f-account" data-f="account" value="${esc(f.account)}" autocomplete="off"></div><div class="hint">Names only. Patas never stores account numbers.</div></div>
      <div class="fld"><label for="f-qlabel">Label <span class="opt">(optional)</span></label><div class="in"><input id="f-qlabel" data-f="label" value="${esc(f.label)}" placeholder="Personal GCash" autocomplete="off"></div></div>
      <div class="savebar"><button class="btn primary block" id="qrsave" data-a="qrsave" disabled>Save QR</button></div>` };
  };
  function refreshQF() { const f = S.f.qf; if (!f) return; const b = $('#qrsave'); if (b) b.disabled = !(f.img && f.person && f.account.trim() && f.method); }

  // ---- Settings ----
  R.settings = () => {
    const sw = (on, a, lbl) => `<button class="sw ${on ? 'on' : ''}" data-a="${a}" role="switch" aria-checked="${on}" aria-label="${lbl}"></button>`;
    const row = (icn, t, sub, right, a) => `<${a ? 'button' : 'div'} class="setrow" ${a ? `data-a="${a}"` : ''}><span class="si">${ic(icn)}</span><div class="grow"><div class="sb" style="font-size:15px">${t}</div>${sub ? `<div class="t13 muted">${sub}</div>` : ''}</div>${right || ''}</${a ? 'button' : 'div'}>`;
    return { tab: null, html: `${formHead('Settings')}
      <div class="setgroup"><div class="setrow"><span class="avatar" style="width:46px;height:46px">${esc((S.name || 'A')[0].toUpperCase())}</span><div class="grow"><div class="sb">${esc(S.name)}</div><div class="t13 muted">you@example.com</div></div><button class="btn soft small" data-a="namesheet">Edit</button></div>
      <div class="setrow" style="font-size:13px;color:var(--muted)">${ic('cloud', 'sm')}<span>${S.demo === 'offline' ? `Offline. ${S.pending} waiting to sync.` : 'Last synced just now. Every entry saves to your phone first, then here.'}</span></div></div>
      <div class="grouphead">Appearance</div><div class="setgroup"><div style="padding:12px 0 0"><div class="seg3" role="group" aria-label="Appearance">${[['auto', 'Auto', 'sunmoon'], ['light', 'Light', 'sun'], ['dark', 'Dark', 'moon']].map(([k, l, i]) => `<button class="${S.look === k ? 'on' : ''}" data-a="look" data-v="${k}" aria-pressed="${S.look === k}">${ic(i, 'sm')} ${l}</button>`).join('')}</div></div>
        <div class="swatches" role="group" aria-label="Colour theme">${THEME_ORDER.map((k) => `<button class="swatch ${S.theme === k ? 'on' : ''}" data-a="theme" data-v="${k}" aria-pressed="${S.theme === k}" aria-label="${THEMES[k].name}"><i style="background:linear-gradient(135deg,${THEMES[k].l.accent} 50%,${THEMES[k].l.m2} 50%)"></i>${THEMES[k].name.split(' ')[0]}</button>`).join('')}</div></div>
      <div class="grouphead">Preferences</div><div class="setgroup">${row('globe', 'Currency', `${CURS[S.cur][0]} ${CURS[S.cur][1]} · display only`, ic('right', 'sm muted'), 'cursheet')}${row('bell', 'Remind me', S.remindOn ? remindLabel(String(S.remindDays)) : 'Off', sw(S.remindOn, 'remindtoggle', 'Reminders'))}${row('volume', 'Sounds', 'A soft tick when you save. Off until you turn it on.', sw(S.sounds, 'sounds', 'Sounds'))}</div>
      <div class="grouphead">Your data</div><div class="setgroup">${row('qr', 'Payment QR gallery', `${DB.qrs.length} saved`, ic('right', 'sm muted'), 'qrgo')}${row('download', 'Back up to a file', '', '', 'mocktoast:Back up is a mockup')}${row('upload', 'Restore from a file', '', '', 'mocktoast:Restore is a mockup')}${row('file', 'Export CSV', 'Debts and payments, for a spreadsheet', '', 'mocktoast:Export is a mockup')}${row('lock', 'Include QR codes in backups', 'Off. QR images stay out unless you turn this on.', sw(!!S.qrb, 'qrb', 'Include QR in backups'))}</div>
      <div class="grouphead">Help</div><div class="setgroup">${row('help', 'FAQ', '', ic('right', 'sm muted'), 'faqsheet')}${row('msg', 'Send feedback', '', ic('right', 'sm muted'), 'fbsheet')}${row('shield', 'Privacy', '', ic('right', 'sm muted'), 'privsheet')}</div>
      <div class="grouphead">Account</div><div class="setgroup">${row('logout', 'Sign out', 'Cached QR images are cleared from this phone.', '', 'mocktoast:Sign out is a mockup')}<button class="setrow" data-a="delacct" style="color:var(--danger)"><span class="si" style="background:var(--red-bg);color:var(--danger)">${ic('trash')}</span><div class="grow"><div class="sb" style="font-size:15px">Delete my account</div><div class="t13 muted">Removes every debt, payment and QR file.</div></div></button></div><div style="height:16px"></div>` };
  };

  // ---------------- modal + toast ----------------
  const modalEl = () => $('#modal');
  function modal(html, mid) { const m = modalEl(); m.innerHTML = `<div class="scrim ${mid ? 'mid' : ''}" data-a="scrim"><div class="sheet" role="dialog" aria-modal="true" tabindex="-1">${mid ? '' : '<div class="grab"></div>'}${html}</div></div>`; const sh = $('.sheet', m); if (sh) sh.focus({ preventScroll: true }); }
  function closeModal() { modalEl().innerHTML = ''; }
  function toast(msg, ico) { const t = $('#toast'); t.innerHTML = `<div class="toast" role="status">${ic(ico || 'check', 'sm')}<span>${esc(msg)}</span></div>`; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.innerHTML = ''; }, 2600); }
  const saved = (msg) => { if (S.demo === 'offline') { S.pending++; toast((msg || 'Saved') + ' on this phone. It will sync when you’re online.', 'cloud'); } else toast((msg || 'Saved') + ' on this phone and synced.'); };
  const dl = (rows) => `<div class="card" style="background:var(--bg);box-shadow:none;padding:6px 14px">${rows.map(([a, b]) => `<div class="dl"><span>${a}</span><span class="num">${b}</span></div>`).join('')}</div>`;
  const menu = (items) => items.map(([i, t, a, extra, danger]) => `<button class="mrow ${danger ? 'danger' : ''}" data-a="${a}" ${extra || ''}>${ic(i)}<span>${t}</span></button>`).join('');

  // ---------------- navigation ----------------
  function go(r, p, o) { S.nav.push({ r, p: p || {} }); if (r === 'adddebt') S.f.ad = newAD(p && p.edit ? findDebt(p.edit) : null); if (r === 'qradd') S.f.qf = newQF(p && p.edit ? vOf(p.edit) : null, p && p.person); render(); }
  function tab(t) { S.nav = [{ r: t, p: {} }]; S.calSel = null; S.calAll = false; render(); }
  function back(force) {
    const t = cur(), dirty = (t.r === 'adddebt' && S.f.ad && S.f.ad.dirty) || (t.r === 'logpay' && S.f.lp && S.f.lp.dirty) || (t.r === 'qradd' && S.f.qf && S.f.qf.dirty);
    if (dirty && !force) { modal(`<h3>Discard this entry?</h3><p>What you typed hasn't been saved.</p><div class="btns"><button class="btn outline" data-a="closesheet">Keep editing</button><button class="btn danger" data-a="discard">Discard</button></div>`, true); return; }
    if (S.nav.length > 1) S.nav.pop(); render();
  }
  function render() {
    applyTheme(); const t = cur(), fn = R[t.r] || R.home; let out;
    try { out = fn(t.p || {}); } catch (e) { out = { tab: 'home', html: `<pre>${esc(e.stack)}</pre>` }; console.error(e); }
    const key = t.r + JSON.stringify(t.p || {}) + S.nav.length, view = $('#view'), keep = view && key === lastKey ? view.scrollTop : 0;
    $('#statusbar').outerHTML = statusBar().replace('class="statusbar"', 'id="statusbar" class="statusbar"');
    $('#view').innerHTML = out.html; $('#fabslot').innerHTML = out.fab || '';
    $('#nav').innerHTML = out.tab !== undefined && out.tab !== null ? tabbar(out.tab) : '';
    $('#view').scrollTop = keep; lastKey = key;
    $('#phone').dataset.route = t.r; renderBar(); bindDirect(); if (t.r === 'adddebt') refreshAD(); if (t.r === 'logpay') refreshLP(); if (t.r === 'qradd') refreshQF();
  }
  function bindDirect() {
    const dq = $('#dq'); if (dq) dq.addEventListener('input', () => { S.dq = dq.value; const L = debtList(); $('#dlist').innerHTML = L.list; $('#dsum').innerHTML = L.sum; });
    const qq = $('#qq'); if (qq) qq.addEventListener('input', () => { const t = qq.value.trim().toLowerCase(); $('#qrgrid').innerHTML = qrCards(DB.qrs.filter((v) => (S.qrf === 'All' || (S.qrf === 'Banks' ? bankish(v.method) : v.method === S.qrf)) && (!t || (v.person + ' ' + v.method + ' ' + v.label).toLowerCase().includes(t)))); });
    const qf = $('#qrfile'); if (qf) qf.addEventListener('change', () => {
      const file = qf.files && qf.files[0], h = $('#h-qr'); if (!file) return;
      if (!/^image\/(png|jpeg)$/.test(file.type)) { h.hidden = false; h.textContent = 'That file isn’t a JPG or PNG.'; return; }
      if (file.size > 5 * 1024 * 1024) { h.hidden = false; h.textContent = 'That image is over 5 MB.'; return; }
      h.hidden = true; const f = S.f.qf; f.img = URL.createObjectURL(file); f.dirty = true; $('#dz').innerHTML = `<img src="${f.img}" alt="QR you picked"><input type="file" id="qrfile" accept="image/png,image/jpeg" aria-label="Choose QR image">`; bindDirect(); refreshQF();
    });
  }

  // ---------------- toolbar (review only) ----------------
  function renderBar() {
    const b = $('#bar'); if (!b) return;
    const seg = (key, opts) => opts.map(([v, l]) => `<button class="pill ${S[key] === v ? 'on' : ''}" data-tb="${key}" data-v="${v}">${l}</button>`).join('');
    b.innerHTML = `<div class="grp"><span class="lab">Phone</span>${seg('device', [['android', 'Android'], ['iphone', 'iPhone']])}</div>
      <div class="grp"><span class="lab">Mode</span>${seg('look', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}</div>
      <div class="grp"><span class="lab">Colour</span>${THEME_ORDER.map((k) => `<button class="dot ${S.theme === k ? 'on' : ''}" data-tb="theme" data-v="${k}" title="${THEMES[k].name}" aria-label="${THEMES[k].name}" style="background:linear-gradient(135deg,${THEMES[k].l.accent} 50%,${THEMES[k].l.m2} 50%)"></button>`).join('')}</div>
      <div class="grp"><span class="lab">Demo data</span><select data-tb="demo" aria-label="Demo data">${[['normal', 'Normal'], ['overdue', 'A payment is overdue'], ['empty', 'First run (empty)'], ['offline', 'Offline'], ['long', 'Very long names']].map(([v, l]) => `<option value="${v}" ${S.demo === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    $('#notes').innerHTML = `<h4>What this is</h4><p>Joe's six boards, rebuilt as a clickable phone. Four tabs, the same screens, the same wording. Tap the round letter at the top of Home for Settings (colours, currency, sounds, backup).</p><h4>Saving</h4><p>Every save asks first, then confirms "saved on this phone". Switch Demo data to Offline to see saves wait to sync.</p><h4>Fake data</h4><p>All names and amounts are made up. QR codes are labelled SAMPLE.</p>`;
  }

  // ---------------- actions ----------------
  const A = {
    tab: (el) => tab(el.dataset.t), go: (el) => go(el.dataset.r, el.dataset.id ? { id: el.dataset.id } : {}), back: () => back(), discard: () => { closeModal(); back(true); },
    closesheet: () => closeModal(), scrim: (el, ev) => { if (ev.target === el) closeModal(); },
    dtype: (el) => { S.dtype = el.dataset.v; render(); },
    monthsheet: () => modal(`<h3>Show month</h3>${menu([-1, 0, 1, 2].map((n) => { const ym = addYM(curYM, n); return ['cal', monthName(ym) + (ym === S.month ? ' ✓' : ''), 'setmonth', `data-v="${ym}"`]; }))}`),
    setmonth: (el) => { S.month = el.dataset.v; closeModal(); render(); },
    cashsheet: () => modal(`<h3>Monthly cash flow</h3><p>Income and expenses are numbers you enter yourself. Patas adds your debt payments for the month.</p><div class="fld"><label for="f-inc">Income</label><div class="in"><span class="pre">${esc(sym())}</span><input id="f-inc" data-f="cf-income" inputmode="decimal" value="${cents2str(S.cash.income)}"></div></div><div class="fld"><label for="f-exp">Expenses</label><div class="in"><span class="pre">${esc(sym())}</span><input id="f-exp" data-f="cf-expenses" inputmode="decimal" value="${cents2str(S.cash.expenses)}"></div></div><div class="btns"><button class="btn outline" data-a="closesheet">Cancel</button><button class="btn primary" data-a="cashsave">Save</button></div>`),
    cashsave: () => { const a = parseMoney($('#f-inc').value), b = parseMoney($('#f-exp').value); if (a == null || b == null) { toast('Enter both amounts.', 'info'); return; } S.cash = { income: a, expenses: b }; closeModal(); saved('Cash flow saved'); render(); },
    logfromhome: () => { const ds = active(); if (ds.length === 1) A.logpay({ dataset: { id: ds[0].id } }); else modal(`<h3>Which debt did you pay?</h3>${menu(nextAll().map((x) => ['user', `${esc(x.d.person)} · ${esc(x.d.label)}`, 'logpay', `data-id="${x.d.id}"`]).concat(ds.filter((d) => !calc(d).next).map((d) => ['user', `${esc(d.person)} · ${esc(d.label)}`, 'logpay', `data-id="${d.id}"`])))}`); },
    logpay: (el, ev, edit) => { closeModal(); const d = findDebt(el.dataset.id), c = calc(d); const pay = edit ? d.payments.find((x) => x.id === edit) : null; S.f.lp = pay ? { debtId: d.id, editId: pay.id, amount: cents2str(pay.amount), date: pay.date, method: pay.method, note: pay.note, dirty: false } : { debtId: d.id, editId: null, amount: c.next ? cents2str(Math.min(c.next.amt, c.remaining)) : cents2str(c.remaining), date: TODAY, method: 'GCash', note: '', dirty: false }; S.nav.push({ r: 'logpay', p: { id: d.id, e: edit || '' } }); render(); },
    logfromqr: (el) => { const v = vOf(el.dataset.id), ds = active().filter((d) => d.person === v.person); if (ds.length === 1) A.logpay({ dataset: { id: ds[0].id } }); else if (!ds.length) toast(`No active debt with ${v.person}.`, 'info'); else modal(`<h3>Which debt?</h3>${menu(ds.map((d) => ['file', esc(d.label), 'logpay', `data-id="${d.id}"`]))}`); },
    lpsave: () => { const f = S.f.lp, d = findDebt(f.debtId), amt = parseMoney(f.amount), c = calc(d), cap = c.remaining + (f.editId ? (d.payments.find((x) => x.id === f.editId) || { amount: 0 }).amount : 0); if (!amt || amt > cap) return; const left = Math.max(0, cap - amt);
      modal(`<h3>${f.editId ? 'Save these changes?' : 'Save this payment?'}</h3>${dl([['Paid to', esc(d.person)], ['Debt', esc(d.label)], ['Amount', money(amt)], ['Date', fLong(f.date)], ['Method', esc(f.method)], ['Left after', left ? money(left) : 'Nothing. Patas na!']])}<div class="btns"><button class="btn outline" data-a="closesheet">Cancel</button><button class="btn primary" data-a="lpconfirm">Save it</button></div>`, true); },
    lpconfirm: () => { const f = S.f.lp, d = findDebt(f.debtId), amt = parseMoney(f.amount); closeModal();
      if (f.editId) { const x = d.payments.find((p) => p.id === f.editId); Object.assign(x, { amount: amt, date: f.date, method: f.method, note: f.note }); } else d.payments.push({ id: uid('p'), date: f.date, amount: amt, method: f.method, note: f.note });
      if (d.settledOn && !f.editId) d.settledOn = null;
      const c = calc(d); let msg = 'Payment saved';
      if (!c.remaining && !d.settledOn) { d.settledOn = f.date > TODAY ? TODAY : f.date; msg = `Patas na! You're even with ${d.person.split(' ')[0]}`; play('done'); } else play('tick');
      f.dirty = false; S.nav = S.nav.filter((n) => n.r !== 'logpay'); if (!S.nav.length) S.nav = [{ r: 'debt', p: { id: d.id } }]; saved(msg); render(); },
    paysheet: (el) => { const d = findDebt(el.dataset.id), x = d.payments.find((p) => p.id === el.dataset.pid); modal(`<h3>${money(x.amount)} · ${fLong(x.date)}</h3><p>${esc(x.method)}${x.note ? ' · ' + esc(x.note) : ''}</p>${menu([['pencil', 'Edit this payment', 'editpay', `data-id="${d.id}" data-pid="${x.id}"`], ['trash', 'Delete this payment', 'delpay', `data-id="${d.id}" data-pid="${x.id}"`, true]])}`); },
    editpay: (el) => A.logpay(el, null, el.dataset.pid),
    delpay: (el) => { const d = findDebt(el.dataset.id), x = d.payments.find((p) => p.id === el.dataset.pid); modal(`<h3>Delete this payment?</h3><p>${money(x.amount)} on ${fLong(x.date)} will be removed and the balance goes back up.</p><div class="btns"><button class="btn outline" data-a="closesheet">Keep it</button><button class="btn danger" data-a="delpayok" data-id="${d.id}" data-pid="${x.id}">Delete</button></div>`, true); },
    delpayok: (el) => { const d = findDebt(el.dataset.id); d.payments = d.payments.filter((p) => p.id !== el.dataset.pid); if (d.settledOn && !d.writtenOff) d.settledOn = null; closeModal(); play('swish'); saved('Payment deleted'); render(); },
    debtmenu: () => { const t = cur(), d = findDebt(t.p.id), c = calc(d), hasQr = DB.qrs.some((v) => v.person === d.person); modal(`<h3>${esc(d.person)}</h3>${menu([['pencil', 'Edit debt', 'editdebt', `data-id="${d.id}"`], ['qr', hasQr ? 'Pay with QR' : 'Add a payment QR', 'payqr', `data-id="${d.id}"`], c.settled ? ['refresh', 'Reopen debt', 'reopen', `data-id="${d.id}"`] : ['checkc', 'Mark as settled', 'settlesheet', `data-id="${d.id}"`], ['trash', 'Delete debt', 'deldebt', `data-id="${d.id}"`, true]])}`); },
    editdebt: (el) => { closeModal(); go('adddebt', { edit: el.dataset.id }); },
    payqr: (el) => { closeModal(); const d = findDebt(el.dataset.id), v = DB.qrs.find((x) => x.person === d.person); if (v) go('qrdetail', { id: v.id }); else go('qradd', { person: d.person }); },
    settlesheet: (el) => { const d = findDebt(el.dataset.id), c = calc(d); modal(`<h3>Mark as settled?</h3><p>${c.remaining ? `${money(c.remaining)} is still left. It will be recorded as written off, and the debt moves to Settled. You can reopen it later.` : 'The debt moves to Settled. You can reopen it later.'}</p><div class="btns"><button class="btn outline" data-a="closesheet">Cancel</button><button class="btn primary" data-a="settleok" data-id="${d.id}">Settle it</button></div>`, true); },
    settleok: (el) => { const d = findDebt(el.dataset.id); d.settledOn = TODAY; d.writtenOff = true; closeModal(); play('done'); saved('Debt settled'); render(); },
    reopen: (el) => { const d = findDebt(el.dataset.id); d.settledOn = null; d.writtenOff = false; closeModal(); saved('Debt reopened'); render(); },
    deldebt: (el) => { const d = findDebt(el.dataset.id); modal(`<h3>Delete this debt?</h3><p>${esc(d.person)} · ${esc(d.label)} and its ${d.payments.length} ${d.payments.length === 1 ? 'payment' : 'payments'} will be removed.</p><div class="btns"><button class="btn outline" data-a="closesheet">Keep it</button><button class="btn danger" data-a="deldebtok" data-id="${d.id}">Delete</button></div>`, true); },
    deldebtok: (el) => { DB.debts = DB.debts.filter((d) => d.id !== el.dataset.id); closeModal(); S.nav = S.nav.filter((n) => !(n.r === 'debt' && n.p.id === el.dataset.id)); if (!S.nav.length) S.nav = [{ r: 'debts', p: {} }]; play('swish'); saved('Debt deleted'); render(); },
    adtype: (el) => { S.f.ad.type = el.dataset.v; S.f.ad.dirty = true; $$('.seg button').forEach((b) => { b.classList.toggle('on', b.dataset.v === S.f.ad.type); b.setAttribute('aria-pressed', b.dataset.v === S.f.ad.type); }); $('#adtypebody').innerHTML = adTypeBody(); refreshAD(); },
    adsave: () => { const f = S.f.ad, e = adErrors(); if (Object.keys(e).length) return; const amt = parseMoney(f.amount), pay = parseMoney(f.payment);
      const rows = [['Who', esc(f.person.trim())], ['For', esc(f.label.trim())], ['Amount', money(amt)], ['Type', f.type === 'one' ? 'One-time' : 'Installments']].concat(f.type === 'one' ? [['Due', fLong(f.due)]] : [['Payment', `${money(pay)} ${REPEAT.find((r) => r[0] === f.repeat)[1].toLowerCase()}`], ['First due', fLong(f.first)]]).concat([['Reminder', remindLabel(f.remind)]]);
      modal(`<h3>${f.id ? 'Save these changes?' : 'Save this debt?'}</h3>${dl(rows)}<div class="btns"><button class="btn outline" data-a="closesheet">Cancel</button><button class="btn primary" data-a="adconfirm">Save it</button></div>`, true); },
    adconfirm: () => { const f = S.f.ad, amt = parseMoney(f.amount), pay = parseMoney(f.payment); closeModal();
      const body = { person: f.person.trim(), label: f.label.trim(), type: f.type, original: amt, remind: f.remind === 'none' ? null : Number(f.remind), notes: f.notes.trim() };
      if (f.type === 'one') Object.assign(body, { due: f.due, amount: undefined, first: undefined, repeat: undefined }); else Object.assign(body, { amount: pay, repeat: f.repeat, first: f.first, due: undefined });
      let d = f.id && findDebt(f.id); if (d) Object.assign(d, body); else { d = Object.assign({ id: uid('d'), payments: [], settledOn: null }, body); DB.debts.push(d); }
      f.dirty = false; S.nav = S.nav.filter((n) => n.r !== 'adddebt'); if (!f.id || !S.nav.length) S.nav = [{ r: f.id ? 'debt' : 'debts', p: f.id ? { id: f.id } : {} }]; play('tick'); saved(f.id ? 'Changes saved' : 'Debt saved'); render(); },
    calnav: (el) => { S.calMonth = addYM(S.calMonth, Number(el.dataset.v)); S.calSel = null; S.calAll = false; render(); },
    calday: (el) => { S.calSel = S.calSel === el.dataset.d ? null : el.dataset.d; S.calAll = false; render(); },
    calall: () => { if (S.calAll || S.calSel) { S.calAll = false; S.calSel = null; } else S.calAll = true; render(); },
    remindtoggle: () => { S.remindOn = !S.remindOn; render(); },
    remindsheet: () => modal(`<h3>Remind me</h3>${menu(REMIND.filter((r) => r[0] !== 'none').map(([v, l]) => ['bell', l + (S.remindOn && String(S.remindDays) === v ? ' ✓' : ''), 'setremind', `data-v="${v}"`]))}<p style="margin-top:8px">New debts start with this. Each debt can have its own.</p>`),
    setremind: (el) => { S.remindDays = Number(el.dataset.v); S.remindOn = true; closeModal(); render(); },
    persheet: () => { const rg = repRange(); modal(`<h3>Period</h3>${menu([['cal', rg.label + (S.rep === 'range' ? ' ✓' : ''), 'setper', 'data-v="range"'], ['cal', monthName(curYM) + (S.rep === 'month' ? ' ✓' : ''), 'setper', 'data-v="month"'], ['cal', 'All time' + (S.rep === 'all' ? ' ✓' : ''), 'setper', 'data-v="all"']])}`); },
    setper: (el) => { S.rep = el.dataset.v; closeModal(); render(); },
    credgo: (el) => { S.dq = el.dataset.n; S.dtype = 'all'; tab('debts'); },
    recsheet: () => { const ps = allPayments().sort((a, b) => b.date.localeCompare(a.date)); modal(`<h3>Payments recorded</h3>${ps.length ? ps.map((p) => `<div class="dl"><span>${fLong(p.date)} · ${esc(p.d.person)}</span><span class="num">${money(p.amount)}</span></div>`).join('') : '<p>No payments yet.</p>'}`); },
    exportsheet: () => modal(`<h3>Export report</h3>${menu([['file', 'Save as CSV', 'mocktoast:Export is a mockup'], ['share', 'Share a summary', 'mocktoast:Share is a mockup']])}`),
    qrf: (el) => { S.qrf = el.dataset.v; render(); },
    qrmenu: (el, ev) => { ev.stopPropagation(); const v = vOf(el.dataset.id); modal(`<h3>${esc(v.person)}</h3>${menu([['pencil', 'Edit label and name', 'qredit', `data-id="${v.id}"`], ['refresh', 'Replace the QR image', 'qrreplace', `data-id="${v.id}"`], ['trash', 'Remove from gallery', 'qrdel', `data-id="${v.id}"`, true]])}`); },
    qrmenu2: () => A.qrmenu({ dataset: { id: cur().p.id } }, { stopPropagation() {} }),
    qredit: (el) => { closeModal(); go('qradd', { edit: el.dataset.id }); },
    qrreplace: (el) => { closeModal(); go('qradd', { edit: el.dataset.id }); S.f.qf.replacing = true; S.f.qf.img = null; render(); },
    qrdel: (el) => { const v = vOf(el.dataset.id); modal(`<h3>Remove this QR?</h3><p>${esc(v.person)} · ${esc(v.method)} is removed from Patas. Copies you saved or shared elsewhere stay where they are.</p><div class="btns"><button class="btn outline" data-a="closesheet">Keep it</button><button class="btn danger" data-a="qrdelok" data-id="${v.id}">Remove</button></div>`, true); },
    qrdelok: (el) => { DB.qrs = DB.qrs.filter((v) => v.id !== el.dataset.id); closeModal(); S.nav = S.nav.filter((n) => !(n.r === 'qrdetail' && n.p.id === el.dataset.id)); if (!S.nav.length) S.nav = [{ r: 'home', p: {} }]; play('swish'); saved('QR removed'); render(); },
    qrsave: () => { const f = S.f.qf; modal(`<h3>${f.id ? 'Save these changes?' : 'Save this QR?'}</h3>${dl([['Person', esc(f.person)], ['Method', esc(f.method)], ['Account name', esc(f.account.trim())], ['Label', esc(f.label.trim() || 'None')]].concat(f.replacing ? [['Image', 'Replaced today']] : []))}${f.replacing ? `<div class="banner warn">${ic('shield')}<span>Replacing a QR shows a warning for 14 days, so a swapped code is easy to spot.</span></div>` : ''}<div class="btns"><button class="btn outline" data-a="closesheet">Cancel</button><button class="btn primary" data-a="qrok">Save it</button></div>`, true); },
    qrok: () => { const f = S.f.qf; closeModal(); let v = f.id && vOf(f.id); const body = { person: f.person, method: f.method, account: f.account.trim(), label: f.label.trim(), img: f.img };
      if (v) { if (f.replacing) { body.changedOn = TODAY; if (v.savedCopyOn) v.staleCopy = true; } Object.assign(v, body); } else DB.qrs.push(Object.assign({ id: uid('q'), seed: 50 + DB.qrs.length, changedOn: null, savedCopyOn: null }, body));
      f.dirty = false; S.nav = S.nav.filter((n) => n.r !== 'qradd'); if (!S.nav.length) S.nav = [{ r: 'qr', p: {} }]; play('tick'); saved('QR saved'); render(); },
    qrout: (el) => { const v = vOf(el.dataset.id), share = el.dataset.k === 'share';
      modal(`<h3>${share ? 'Share this QR?' : 'Save a copy to your phone?'}</h3><p>${share ? 'Your phone’s share sheet opens. Pick the app you want to send it to.' : 'The copy goes into your phone’s Downloads and may show in your gallery.'}</p>
        <div class="card" style="background:var(--bg);box-shadow:none;padding:8px 14px"><div class="dl"><span>QR</span><span>${esc(v.person)} · ${esc(v.method)}</span></div><div class="dl"><span>Match check</span><span style="color:var(--ok)">${ic('check', 'sm')} Same QR as in Patas</span></div><div class="dl"><span>The copy has</span><span>White border, no names</span></div></div>
        <div class="banner warn">${ic('shield')}<span>A copy lives outside Patas. Signing out or deleting your account won't remove it. Delete it after you pay.</span></div>
        <div class="btns"><button class="btn outline" data-a="closesheet">Cancel</button><button class="btn primary" data-a="qroutok" data-id="${v.id}" data-k="${el.dataset.k}">${share ? 'Share…' : 'Save copy'}</button></div>`, true); },
    qroutok: (el) => { const v = vOf(el.dataset.id); closeModal(); if (el.dataset.k === 'save') { v.savedCopyOn = TODAY; v.staleCopy = false; saved('Copy saved'); toast('Copy saved to your phone. Delete it after you pay.', 'download'); } else toast('The share sheet opens here on a real phone.', 'share'); render(); },
    qrgo: () => go('qr'),
    namesheet: () => modal(`<h3>Your name</h3><div class="fld"><div class="in"><input id="f-name" data-f="name" value="${esc(S.name)}" maxlength="24" aria-label="Your name"></div></div><div class="btns"><button class="btn outline" data-a="closesheet">Cancel</button><button class="btn primary" data-a="namesave">Save</button></div>`, true),
    namesave: () => { const v = $('#f-name').value.trim(); if (v) { S.name = v; store.set('name', v); } closeModal(); render(); },
    look: (el) => { S.look = el.dataset.v; store.set('look', S.look); render(); }, theme: (el) => { S.theme = el.dataset.v; store.set('theme', S.theme); render(); },
    cursheet: () => modal(`<h3>Currency</h3><p>Display only. Patas doesn't convert anything.</p>${menu(Object.entries(CURS).map(([k, [s, n]]) => ['globe', `${s}  ${n}${S.cur === k ? ' ✓' : ''}`, 'setcur', `data-v="${k}"`]))}`),
    setcur: (el) => { S.cur = el.dataset.v; store.set('cur', S.cur); closeModal(); render(); },
    sounds: () => { S.sounds = !S.sounds; store.set('sounds', S.sounds ? '1' : '0'); if (S.sounds) play('tick'); render(); }, qrb: () => { S.qrb = !S.qrb; render(); },
    faqsheet: () => modal(`<h3>FAQ</h3>${[['Where are my debts saved?', 'On this phone first, so Patas works with no signal. When you are signed in they also back up to your account.'], ['Does Patas move money?', 'No. It records payments you already made, and it keeps your payment QR codes so paying is one tap in your own wallet app.'], ['What does Settled mean?', 'The balance reached zero, or you closed the debt on purpose. Settled debts live under "View settled debts" and can be reopened.'], ['Why did my QR show a warning?', 'If a saved QR was replaced in the last 14 days, Patas tells you. A swapped QR is the main way money goes to the wrong person.'], ['Is there a backup?', 'Yes. Signed-in data backs up by itself, and you can save a backup file from Settings. QR images stay out unless you include them.']].map(([a, b]) => `<details class="faq"><summary>${a}${ic('down', 'sm')}</summary><p>${b}</p></details>`).join('')}`),
    fbsheet: () => modal(`<h3>Send feedback</h3><div class="fld"><textarea class="nt" id="f-fb" placeholder="What could be better?" aria-label="Feedback"></textarea></div><div class="btns"><button class="btn outline" data-a="closesheet">Cancel</button><button class="btn primary" data-a="fbsend">Send</button></div>`, true),
    fbsend: () => { closeModal(); play('thanks'); toast('Thanks. That helps.', 'msg'); },
    privsheet: () => modal(`<h3>Privacy</h3><p>Your debts are private from other users. The person running this server can technically see stored data. They don't look at it, sell it or share it, and you can delete everything at any time.</p><p>A QR you save or share leaves Patas. Signing out or deleting your account doesn't remove that copy.</p><p class="t12">Draft wording. The final text is settled with the security review.</p>`),
    delacct: () => modal(`<h3>Delete my account?</h3><p>Every debt, payment and QR file is removed from this phone and from the server. This can't be undone.</p><div class="btns"><button class="btn outline" data-a="closesheet">Keep it</button><button class="btn danger" data-a="mocktoast:Delete account is a mockup">Delete</button></div>`, true),
  };

  // ---------------- wiring ----------------
  function onClick(ev) {
    const tb = ev.target.closest('[data-tb]');
    if (tb && tb.tagName !== 'SELECT') { const k = tb.dataset.tb; S[k] = tb.dataset.v; if (k !== 'demo') store.set(k, S[k]); render(); return; }
    const el = ev.target.closest('[data-a]'); if (!el || !phone.contains(el)) return;
    const a = el.dataset.a;
    if (a.startsWith('mocktoast:')) { closeModal(); toast(a.slice(10), 'info'); return; }
    if (A[a]) { if (a !== 'scrim' && el.tagName === 'SPAN') ev.stopPropagation(); A[a](el, ev); }
  }
  function onField(ev) {
    const el = ev.target.closest('[data-f]'); if (!el) return; const k = el.dataset.f, v = el.value, r = cur().r;
    if (k === 'cf-income' || k === 'cf-expenses' || k === 'name') return;
    const o = $('#v-' + k); if (o && el.tagName === 'SELECT') o.textContent = el.options[el.selectedIndex].text; else if (o && el.type === 'date') o.innerHTML = v ? fLong(v) : '<span class="muted">Pick a date</span>';
    if (r === 'adddebt') { S.f.ad[k] = v; S.f.ad.dirty = true; refreshAD(); }
    else if (r === 'logpay') { S.f.lp[k] = v; S.f.lp.dirty = true; refreshLP(); }
    else if (r === 'qradd') { S.f.qf[k] = v; S.f.qf.dirty = true; if (k === 'person' && !S.f.qf.account.trim()) { S.f.qf.account = v; const ac = $('#f-account'); if (ac) ac.value = v; } refreshQF(); }
  }
  document.addEventListener('click', onClick);
  document.addEventListener('input', onField); document.addEventListener('change', (ev) => { const sel = ev.target.closest('[data-tb]'); if (sel && sel.tagName === 'SELECT') { S.demo = sel.value; store.set('demo', S.demo); DB = build(S.demo); S.pending = 0; S.nav = [{ r: 'home', p: {} }]; S.f = {}; S.dq = ''; S.dtype = 'all'; render(); return; } onField(ev); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && modalEl().innerHTML) closeModal(); if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.getAttribute && ev.target.getAttribute('role') === 'button' && ev.target.dataset.a) { ev.preventDefault(); ev.target.click(); } });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.look === 'auto') render(); });
  if (q.get('bare')) document.body.classList.add('bare');

  // first paint: fixed frame, then screens
  phone.innerHTML = `<div id="statusbar" class="statusbar"></div><div class="body"><div class="view" id="view"></div><div id="fabslot"></div></div><div id="nav"></div><div class="homebar"></div><div id="modal"></div><div id="toast"></div>`;
  if (q.get('route')) { const r = q.get('route'); if (R[r]) { S.nav = [{ r, p: q.get('id') ? { id: q.get('id') } : {} }]; if (r === 'adddebt') S.f.ad = newAD(null); if (r === 'qradd') S.f.qf = newQF(null); if (r === 'logpay') A.logpay({ dataset: { id: q.get('id') } }); } }
  render();
  window.__m = { S, get DB() { return DB; }, calc, go, tab, A, money, parseMoney, render };
})();
