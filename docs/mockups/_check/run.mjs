// Drives headless Edge over DevTools against docs/mockups/index.html. Fake data only. Round 2 suite.
// Usage: node run.mjs screens|fit|tap|contrast|flows|review|shots|all
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = process.env.PAGE_URL || 'file:///' + path.resolve(HERE, '..', 'index.html').split(path.sep).join('/');
const OUT = process.env.OUT || path.join(process.env.TEMP, 'patas-shots');
fs.mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0, errors = [];
const pending = new Map();
const profile = fs.mkdtempSync(path.join(process.env.TEMP, 'edgeprof-patas-'));
const edge = spawn(EDGE, ['--headless', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => (ws.onopen = r));
        ws.onmessage = (m) => {
          const d = JSON.parse(m.data);
          if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
          if (d.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 240));
          if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 240));
        };
        await cdp('Runtime.enable'); await cdp('Page.enable');
        return;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('Edge did not start');
}
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('eval: ' + r.result.exceptionDetails.exception?.description); return r.result?.result?.value; };
async function open(w, h, qs = '', scheme = 'light') {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp('Page.navigate', { url: `${PAGE}?bare=1&fresh=1&size=${w}&${qs}` });
  for (let i = 0; i < 80; i++) { await sleep(100); if (await ev('!!window.__mock && document.readyState==="complete"')) break; }
  await ev('document.fonts.ready.then(()=>true)');
  await sleep(150);
}
async function shot(name) {
  const r = await cdp('Page.captureScreenshot', { format: 'png' });
  const f = path.join(OUT, name + '.png'); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); return f;
}
const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NOEL';e.click();return 'ok'})()`);
// click the INNERMOST tappable element whose text contains txt (a backdrop contains the whole sheet's text, so it must lose)
const clickText = (txt, scope = '#phone') => ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(scope)}+' button, '+${JSON.stringify(scope)}+' [data-go], '+${JSON.stringify(scope)}+' [data-act], '+${JSON.stringify(scope)}+' [data-sheet]')].filter(e=>e.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(txt)})).sort((a,b)=>a.textContent.length-b.textContent.length);if(!els.length)return 'NOEL';els[0].click();return 'ok'})()`);
const text = () => ev('document.querySelector("#phone").innerText');
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
const rect = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom}})()`);
let pass = 0, fail = 0;
const T = (ok, label, detail = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + detail : '')); return ok; };
const cents = (s) => Math.round(parseFloat(String(s).replace(/[₱$,\s]/g, '')) * 100);
const moneyAfter = (t, label) => { const m = t.match(new RegExp(label + '\\s*(₱[\\d,]+\\.\\d{2})')); return m ? cents(m[1]) : null; };
const jumpIdx = (label) => `__mock.J.findIndex(j=>j[0]===${JSON.stringify(label)}&&j[1])`;
const J = (label) => `__mock.jump(${jumpIdx(label)})`;
const sounds = () => ev('window.__sounds.slice()');

// ---------------- 1. every screen opens ----------------
const EXPECT = {
  welcome: /Patas|Continue|Check your email|What's your email/, log: /Log/, overview: /Due next|Nothing here yet|Patas na|Total I still owe|October|Couldn.t load/, list: /List/,
  debt: /You owe|owes you|Debt|Couldn.t load|isn't here/, debtAdd: /Add a debt|Edit debt/, charge: /Add a charge/, people: /People/, person: /Debts/, vault: /Pay vault/,
  showQr: /Account name|Waiting for a connection/, qrExport: /saved copy/i, qrAdd: /Add a QR/, settings: /Settings/, shareSummary: /Share summary/, importTool: /Import from spreadsheet/,
  appicons: /Brand previews/, loading: /Patas/, splash: /Patas/,
};
async function screens() {
  console.log('== 1. every screen opens (no script errors, expected heading, no NaN/undefined, no sideways scroll) ==');
  await open(390, 844);
  await ev(`__mock.go('nonexistent')`);
  T(!(/Settings/.test(await text())) && /Unknown screen/.test(await text()), 'CONTROL: a made-up screen name reports missing (this proves the check can fail)');
  let n = 0, bad = 0;
  const list = await ev('__mock.J.map((j,i)=>[j[0],!!j[1],j[1]&&j[1].route])');
  const runSet = async (size, scheme, theme, only) => {
    await open(size, size === 360 ? 640 : 844, `look=${scheme}&theme=${theme}`, scheme);
    for (let i = 0; i < list.length; i++) {
      const [label, isScreen, route] = list[i]; if (!isScreen) continue;
      if (only && !only.includes(route)) continue;
      errors = []; let thrown = '';
      try { await ev(`__mock.jump(${i})`); } catch (e) { thrown = e.message.slice(0, 160); }
      await sleep(25);
      const t = await text();
      const over = await ev(`(()=>{const s=document.querySelector('#phone .screen, #phone .qrscreen, #phone .splash');return s? s.scrollWidth-s.clientWidth : -1})()`);
      const probs = [];
      if (thrown) probs.push('threw: ' + thrown);
      if (!EXPECT[route] || !EXPECT[route].test(t)) probs.push('heading text missing');
      if (/undefined|NaN|\[object/.test(t)) probs.push('undefined/NaN in text');
      if (over > 1) probs.push('sideways scroll ' + over + 'px');
      if (errors.length) probs.push(errors[0]);
      n++; if (probs.length) { bad++; console.log(`FAIL [${size} ${scheme} ${theme}] ${label}: ${probs.join('; ')}`); }
    }
  };
  for (const size of [390, 360]) for (const scheme of ['light', 'dark']) await runSet(size, scheme, 'ink');
  for (const theme of ['green', 'lavender', 'teal', 'pink']) for (const scheme of ['light', 'dark']) await runSet(390, scheme, theme, ['log', 'overview', 'list', 'settings', 'debt']);
  T(bad === 0, `screens checked: ${n}, problems: ${bad}`);
}

// ---------------- 2. fit at 360x640 ----------------
async function fit() {
  console.log('== 2. at 360x640: Overview glance items and the Log screen sit fully above the nav (measured) ==');
  const probe = async (qs, label, spacer) => {
    await open(360, 640, `route=overview&${qs}`);
    if (spacer) await ev(`(()=>{const s=document.createElement('div');s.style.height='200px';const t=document.querySelector('[data-glance="owed"]');t.parentNode.insertBefore(s,t)})()`);
    const r = await ev(`(()=>{const nav=document.querySelector('.nav').getBoundingClientRect().top;const g=[...document.querySelectorAll('[data-glance]')].map(e=>e.getBoundingClientRect().bottom);return {nav,last:Math.max(...g),n:g.length}})()`);
    return { ok: r.last <= r.nav, last: Math.round(r.last), nav: Math.round(r.nav), n: r.n, label };
  };
  for (const [qs, label] of [['data=normal', 'normal'], ['data=overdue', 'overdue'], ['data=long', 'long names']]) { const r = await probe(qs, label); T(r.ok && r.n >= 2, `Overview (${label}): bottom of last glance item ${r.last}px <= nav top ${r.nav}px`, `[${r.n} glance blocks]`); }
  const neg = await probe('data=normal', 'spacer', true);
  T(!neg.ok, `CONTROL: injecting a 200px spacer makes the fit check fail (last ${neg.last}px vs nav ${neg.nav}px)`);
  for (const [qs, label] of [['data=normal', 'normal'], ['data=overdue', 'overdue'], ['data=long', 'long names']]) {
    await open(360, 640, `route=log&${qs}`); await ev(`__mock.A.logfor({dataset:{id:'d1'}})`);
    const r = await ev(`(()=>{const nav=document.querySelector('.nav').getBoundingClientRect().top;const s=document.querySelector('#logsave').getBoundingClientRect();return {nav,save:s.bottom}})()`);
    T(r.save <= r.nav, `Log (${label}) with a debt picked: the Save button ends at ${Math.round(r.save)}px, above the nav at ${Math.round(r.nav)}px`);
  }
}

// ---------------- 3. tap targets ----------------
async function tap() {
  console.log('== 3. every tappable control is at least 44 x 44 px (measured) ==');
  const list = await (async () => { await open(390, 844); return ev('__mock.J.map((j,i)=>[j[0],!!j[1]])'); })();
  const seen = new Map();
  for (const size of [390, 360]) {
    await open(size, size === 360 ? 640 : 844);
    for (let i = 0; i < list.length; i++) {
      if (!list[i][1]) continue;
      await ev(`__mock.jump(${i})`); await sleep(15);
      const small = await ev(`[...document.querySelectorAll('#phone button, #phone a[href], #phone input:not([type=hidden]), #phone select, #phone textarea, #phone [role=switch], #phone tr[role=button]')].filter(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&e.offsetParent!==null&&!e.closest('[hidden]')&&!(e.closest('.chips')&&false)}).map(e=>{const r=e.getBoundingClientRect();return {t:(e.textContent||e.getAttribute('aria-label')||e.id||e.tagName).replace(/\\s+/g,' ').trim().slice(0,28),w:Math.round(r.width),h:Math.round(r.height)}}).filter(x=>x.w<44||x.h<44)`);
      for (const s of small) { const k = `${s.t} ${s.w}x${s.h}`; if (!seen.has(k)) seen.set(k, `${list[i][0]} @${size}`); }
    }
  }
  for (const [k, where] of seen) console.log(`FAIL too small: "${k}" (first seen on: ${where})`);
  T(seen.size === 0, `tap targets under 44px: ${seen.size}`);
}

// ---------------- 4. contrast ----------------
function decodePng(buf) {
  let p = 8, w = 0, h = 0, bpp = 4; const idat = [];
  while (p < buf.length) { const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8); const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); const ct = data[9]; bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp || data[8] !== 8 || data[12] !== 0) throw new Error('unsupported png'); }
    if (type === 'IDAT') idat.push(data); p += len + 12; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) { const a = x >= bpp ? out[y * stride + x - bpp] : 0, b = y ? out[(y - 1) * stride + x] : 0, c = x >= bpp && y ? out[(y - 1) * stride + x - bpp] : 0; let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[y * stride + x] = v & 255; } }
  return { w, h, bpp, px: (x, y) => { const i = y * stride + x * bpp; return [out[i], out[i + 1], out[i + 2]]; } };
}
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
async function heroContrast(qs, scheme, label) {
  await open(390, 844, `route=overview&look=${scheme}&${qs}`, scheme);
  const spans = await ev(`(()=>{const hero=document.querySelector('.hero');const out=[];const w=document.createTreeWalker(hero,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(!n.textContent.trim())continue;const el=n.parentElement;const cs=getComputedStyle(el);const rg=document.createRange();rg.selectNodeContents(n);for(const r of rg.getClientRects()){if(r.width<2||r.height<2)continue;const pl=el.closest('.pill');out.push({x:r.x,y:r.y,w:r.width,h:r.height,color:cs.color,size:parseFloat(cs.fontSize),weight:+cs.fontWeight,t:n.textContent.trim().slice(0,22),pillBg:pl?getComputedStyle(pl).backgroundColor:null,btn:!!el.closest('.btn'),btnBg:el.closest('.btn')?getComputedStyle(el.closest('.btn')).backgroundColor:null})}}return out})()`);
  await ev(`(()=>{const s=document.createElement('style');s.id='hide';s.textContent='.hero *{color:transparent!important} .hero svg{stroke:transparent!important;fill:transparent!important} .hero .pill{background:transparent!important} .hero .btn{background:transparent!important;border-color:transparent!important}';document.head.appendChild(s)})()`);
  await sleep(100);
  const png = decodePng(Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
  let worst = 99, worstT = '';
  for (const s of spans) {
    const fg = s.color.match(/[\d.]+/g).map(Number).slice(0, 3);
    const large = s.size >= 24 || (s.size >= 18.66 && s.weight >= 700); const need = large ? 3 : 4.5;
    let min = 99;
    const solid = s.pillBg || s.btnBg;
    if (solid) min = ratio(fg, solid.match(/[\d.]+/g).map(Number).slice(0, 3));
    else for (let y = Math.max(0, Math.floor(s.y)); y < Math.min(png.h, Math.ceil(s.y + s.h)); y += 2) for (let x = Math.max(0, Math.floor(s.x)); x < Math.min(png.w, Math.ceil(s.x + s.w)); x += 2) min = Math.min(min, ratio(fg, png.px(x, y)));
    const margin = min - need; if (margin < worst) { worst = margin; worstT = `"${s.t}" ${s.size}px ${min.toFixed(2)}:1 (needs ${need})`; }
  }
  T(worst >= 0, `hero ${label} ${scheme}: worst text is ${worstT}`);
}
async function contrast() {
  console.log('== 4. hero text contrast over the glass and mesh (rendered pixels, text hidden), in every theme ==');
  for (const [qs, label] of [['data=normal&theme=ink', 'ink'], ['data=overdue&theme=ink', 'ink overdue'], ['data=normal&theme=green', 'green'], ['data=normal&theme=lavender', 'lavender'], ['data=normal&theme=teal', 'teal'], ['data=normal&theme=pink', 'pink']])
    for (const scheme of ['light', 'dark']) await heroContrast(qs, scheme, label);
  T(ratio([200, 200, 200], [205, 205, 205]) < 4.5, 'CONTROL: near-identical colours score under 4.5:1 (the maths can fail)');
}

// ---------------- 5. tap-through flows ----------------
async function flows() {
  console.log('== 5. tap-through flows: the numbers on screen change by exactly the amount typed ==');
  await open(390, 844, 'route=overview');
  let t = await text(); const owe0 = moneyAfter(t, 'Total I still owe'), owed0 = moneyAfter(t, 'Owed to me');
  T(owe0 === 4302633 && owed0 === 320000, 'Overview starts at I owe ₱43,026.33 and owed to me ₱3,200.00', `${owe0} / ${owed0}`);
  errors = [];
  T((await ev('PatasFx.isOn()')) === false, 'sounds ship switched OFF (a chime on a jeepney tells strangers what you just did)');
  await ev('__mock.S.sw.sounds=true;PatasFx.setSounds(true)'); // the sound checks below need them on, as a person who turned them on
  // F1 log a partial payment: tile, amount fills in, Save, confirm pop-up, Save it
  await click('.nav [data-go="log"]');
  let dis = await ev(`document.querySelector('#logsave').disabled`);
  T(dis === true, 'Log: Save is disabled until you tap what you paid');
  T((await clickText('Home Credit', '[data-log]')) === 'ok', 'tap the Home Credit tile');
  const prefill = await ev(`document.querySelector('#f-lamount').value`);
  T(prefill === '1,247.50', 'the amount fills in with the installment that is due', `value "${prefill}"`);
  T((await ev(`document.querySelectorAll('.tile.on').length`)) === 1, 'exactly one tile is selected');
  await setVal('#f-lamount', '500');
  dis = await ev(`document.querySelector('#logsave').disabled`); T(dis === false, 'Save turns on once a debt and an amount are there');
  const beforeSounds = (await sounds()).length;
  await click('#logsave'); t = await text();
  T(/Save this payment\?/.test(t) && /Home Credit/.test(t) && /₱500/.test(t), 'the check pop-up shows exactly what will be saved (Home Credit, ₱500)');
  T((await sounds()).length === beforeSounds, 'nothing is saved and no sound plays until you confirm');
  await clickText('Save it', '.scrim'); t = await text();
  T(/Saved\. Home Credit has ₱6,985\.00 left\./.test(t), 'toast: "Saved. Home Credit has ₱6,985.00 left." (7,485.00 minus 500.00)');
  T((await sounds()).slice(-1)[0] === 'tick', 'a soft "tick" sound played on save');
  await click('.nav [data-go="overview"]'); t = await text(); const owe1 = moneyAfter(t, 'Total I still owe');
  T(owe0 - owe1 === 50000, 'Overview total I owe drops by exactly 500.00', `${(owe0 - owe1) / 100}`);
  // sounds switch
  await click('.nav [data-go="settings"]'); await click('[data-sw="sounds"]');
  const s0 = (await sounds()).length;
  await click('.nav [data-go="log"]'); await clickText('Lazada', '[data-log]'); await setVal('#f-lamount', '100'); await click('#logsave'); await clickText('Save it', '.scrim');
  T((await sounds()).length === s0, 'with the Sounds switch off, saving plays nothing');
  await click('.nav [data-go="overview"]'); t = await text(); const owe1b = moneyAfter(t, 'Total I still owe');
  T(owe1 - owe1b === 10000, 'and the 100.00 payment still lowered the total by exactly 100.00', `${(owe1 - owe1b) / 100}`);
  await click('.nav [data-go="settings"]'); await click('[data-sw="sounds"]');
  // F2 charge
  await ev(`__mock.go('debt',{id:'d1'})`); await click('[data-go="charge"]');
  T((await ev('__mock.S.route')) === 'charge', 'tap "+ Add" under Charges');
  await setVal('#f-camount', '100'); await clickText('Add charge');
  await click('.nav [data-go="overview"]').catch(() => {}); await ev(`__mock.go('overview')`); t = await text(); const owe2 = moneyAfter(t, 'Total I still owe');
  T(owe2 - owe1b === 10000, 'a 100.00 late fee raises the total I owe by exactly 100.00', `${(owe2 - owe1b) / 100}`);
  // F3 tab crossing zero, logged from the Log tab on the I-received side
  await ev(`__mock.go('log')`); await click('[data-seg="f-ldir"][data-v="recv"]'); await clickText('Carlo', '[data-log]'); await setVal('#f-lamount', '500'); await click('#logsave'); await clickText('Save it', '.scrim');
  await ev(`__mock.go('debt',{id:'e1'})`); t = await text();
  T(/You owe Carlo/.test(t) && /₱150\.00/.test(t), 'a tab that crosses zero flips to "You owe Carlo" and ₱150.00');
  await ev(`__mock.go('overview')`); t = await text();
  const owe3 = moneyAfter(t, 'Total I still owe'), owed3 = moneyAfter(t, 'Owed to me');
  T(owe3 - owe2 === 15000, 'the flipped 150.00 lands in "I owe", never netted away', `${(owe3 - owe2) / 100}`);
  T(owed0 - owed3 === 35000, '"Owed to me" falls by the 350.00 that was owed', `${(owed0 - owed3) / 100}`);
  // F4 settle (confirm pop-up), list shows it, reopen from the menu
  await ev(`__mock.go('debt',{id:'d6'})`); await clickText('Mark as settled'); t = await text();
  T(/Mark as settled\?/.test(t) && /Gas money/.test(t), 'settling asks first, showing which debt');
  await clickText('Write off and settle', '.scrim');
  T((await ev(`!!__mock.db.debts.find(d=>d.id==='d6').settledOn`)) === true, 'confirming settles that debt');
  await click('.nav [data-go="list"]'); await clickText('Settled', '#lfstatus'); t = await text();
  T(/Gas money/.test(t), 'the debt just settled (Gas money) is in the List under Settled');
  const settledBefore = await ev(`__mock.db.debts.filter(d=>d.settledOn).length`);
  await ev(`__mock.go('debt',{id:'d6'})`); await click('[data-sheet="debtmenu"]'); await clickText('Reopen this debt'); t = await text();
  T(/removed/.test(t) && (await ev(`__mock.db.debts.filter(d=>d.settledOn).length`)) === settledBefore - 1, 'Reopen (from the "..." menu) puts exactly one debt back');
  // F5 paying the last installment settles it by itself
  await ev(`__mock.go('log')`); await click('[data-seg="f-ldir"][data-v="pay"]'); // Log stays on "I received" after the Carlo entry, on purpose
  await clickText('Atome', '[data-log]'); t = await ev(`document.querySelector('#f-lamount').value`);
  T(t === '1,433.33', 'Atome has one installment left, and the amount fills in as 1,433.33');
  await click('#logsave'); await clickText('Save it', '.scrim'); t = await text();
  T(/Patas na\. Atome is paid off\./.test(t) && (await ev(`!!__mock.db.debts.find(d=>d.id==='d5').settledOn`)), 'paying the last installment says "Patas na." and moves it to Settled');
  T((await sounds()).slice(-1)[0] === 'done', 'the gentle "patas na" chime played');
  // F6 new fixed plan 1,200.00 x 3
  await ev(`__mock.go('overview')`); t = await text(); const oweA = moneyAfter(t, 'Total I still owe');
  await ev(`__mock.go('debtAdd')`); await setVal('#f-person', 'Test Lender'); await setVal('#f-label', 'Sample'); await setVal('#f-amount', '1200'); await setVal('#f-count', '3'); await clickText('Save debt');
  t = await text(); T(/₱3,600\.00/.test(t) && /You owe Test Lender/.test(t), 'a new plan of 3 x 1,200.00 shows ₱3,600.00');
  await ev(`__mock.go('overview')`); t = await text(); T(moneyAfter(t, 'Total I still owe') - oweA === 360000, 'and the Overview total I owe rises by exactly 3,600.00');
  // F7 Show QR in dark
  await open(360, 640, 'look=dark&route=showQr&params=%7B%22id%22%3A%22v1%22%2C%22from%22%3A%22d1%22%7D', 'dark');
  const bg = await ev(`getComputedStyle(document.querySelector('.qrscreen')).backgroundColor`);
  T(bg === 'rgb(255, 255, 255)', 'Show QR is white even in dark mode', bg);
  const fr = await rect('.qrframe'); T(fr && fr.w >= 220, 'the QR frame is at least 220px wide at 360px', fr ? `${Math.round(fr.w)}px` : 'missing');
  const filt = await ev(`getComputedStyle(document.querySelector('.qrframe svg')).filter`); T(filt === 'none', 'the QR image has no filter applied (never altered)', filt);
  await ev(J('Confirm sheet'));
  const top = await ev(`(()=>{const s=document.querySelector('.sheet').getBoundingClientRect();const e=document.elementFromPoint(s.x+s.width/2,s.y+40);return !!(e&&e.closest('.sheet'))})()`);
  T(top === true, 'the confirm sheet is actually ON TOP of the Show QR screen (asked the browser what is at that point)');
  await ev(`(()=>{const s=document.createElement('style');s.id='zctl';s.textContent='.scrim{z-index:40!important}';document.head.appendChild(s)})()`);
  T((await ev(`(()=>{const s=document.querySelector('.sheet').getBoundingClientRect();const e=document.elementFromPoint(s.x+s.width/2,s.y+40);return !!(e&&e.closest('.sheet'))})()`)) === false, 'CONTROL: with the old stacking order (sheet at 40) the same check says "hidden"');
  await ev(`document.getElementById('zctl').remove()`);
  t = await text(); T(/Save to phone/.test(t) && /Share…/.test(t) && /Save a copy of this QR\?/.test(t), 'Android confirm sheet offers Save to phone and Share');
  await ev(`__mock.S.device='iphone';__mock.render()`); t = await text();
  T(!/Save to phone/.test(t) && /Share…/.test(t) && /Choose Save Image/.test(t), 'iPhone confirm sheet offers Share only, with the Save Image hint');
  T(/This copy leaves Patas: your MPIN won't lock it, signing out won't delete it, and your photo backup may upload it\./.test(t), "Kenshin's one-sentence warning is shown word for word");
  // F8 appearance
  await open(390, 844, 'look=light&route=settings', 'light'); await click('[data-seg="look"][data-v="dark"]');
  T((await ev(`document.querySelector('#phone').dataset.mode`)) === 'dark', 'Settings > Appearance > Dark switches the app to dark');
  T(errors.length === 0, 'no script errors during all flows', errors[0] || '');
}

// ---------------- 6. round 2 features, each measured ----------------
const rgbOf = (c) => c.match(/[\d.]+/g).map(Number).slice(0, 3);
const labOf = ([r, g, b]) => { const f = (v) => { v /= 255; return v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92; }; const R = f(r), G = f(g), B = f(b); const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047, Y = 0.2126 * R + 0.7152 * G + 0.0722 * B, Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883; const g2 = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); return [116 * g2(Y) - 16, 500 * (g2(X) - g2(Y)), 200 * (g2(Y) - g2(Z))]; };
const dE = (a, b) => { const x = labOf(a), y = labOf(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
async function review() {
  console.log('== 6. round 2: Log, List, entries, themes, currency, sounds, FAQ, feedback, marks, pop-ups ==');
  let t;
  // --- six tabs ---
  await open(360, 640, 'route=log');
  const nav = await ev(`[...document.querySelectorAll('.nav button')].map(b=>{const s=b.querySelector('span');const r=b.getBoundingClientRect();return {l:s.innerText,w:Math.round(r.width),h:Math.round(r.height),clip:s.scrollWidth>s.clientWidth,icon:!!b.querySelector('svg')}})`);
  T(nav.length === 6 && nav.map((n) => n.l).join(',') === 'Log,Overview,List,People,Vault,Settings', 'six tabs in order: Log, Overview, List, People, Vault, Settings', nav.map((n) => n.l).join(','));
  T(nav.every((n) => n.icon && !n.clip && n.w >= 44 && n.h >= 44), 'each tab has an icon, its label is not clipped, and it is at least 44px at 360px wide', nav.map((n) => n.w).join('/') + 'px');
  T((await ev(`document.querySelector('.nav button.on span').innerText`)) === 'Log', 'the app opens on Log');
  // --- Log ---
  await open(390, 844, 'route=log&data=overdue');
  t = await ev(`document.querySelectorAll('.tiles .tile:not(.other)').length`); T(t >= 4 && t <= 5, 'Log shows up to five tiles plus Other', `${t} tiles`);
  T((await ev(`!!document.querySelector('.tile .rdot')`)) === true, 'an overdue payment is marked on its tile with the rust dot');
  await click('.tile'); t = await ev(`document.querySelector('#lhint').innerText`);
  T(/Installment 4 of 10/.test(t) && /already paid/.test(t), 'the hint under the amount names the installment and what is already paid', t);
  await ev(`__mock.go('log')`); await click('.tile.other'); t = await text();
  T(/Which debt\?/.test(t) && /Kuya Jun/.test(t) && /New debt/.test(t), '"Other" opens a searchable list of every debt, plus "New debt"');
  await setVal('#oq', 'kuya'); const vis = await ev(`[...document.querySelectorAll('#otherlist [data-q]')].filter(r=>!r.hidden&&!r.matches('[data-go]')).length`);
  T(vis === 1, 'searching "kuya" leaves exactly one debt', `${vis}`);
  await clickText('Kuya Jun', '#otherlist'); T((await ev('__mock.S.logSel')) === 'd6', 'picking it selects that debt on Log');
  t = await text(); T(/Paying back/.test(t) && /Borrowed more/.test(t) && !/I paid back|I borrowed more/.test(t), 'a tab shows two small chips under Amount (Paying back, Borrowed more), not a second "I paid" switch');
  const kc = await ev(`[...document.querySelectorAll('.kc')].map(b=>({h:Math.round(b.getBoundingClientRect().height),w:Math.round(b.getBoundingClientRect().width),pill:Math.round(b.querySelector('span').getBoundingClientRect().height)}))`);
  T(kc.length === 2 && kc.every((k) => k.h >= 44 && k.w >= 44 && k.pill === 32), 'the chips are 32px pills inside a 44px tap area', JSON.stringify(kc));
  T((await ev(`document.querySelectorAll('#phone .seg3').length`)) === 1, 'only ONE segmented switch is on the Log screen (I paid / I received)');
  await ev(`__mock.go('log')`); await click('.tile'); await click('[data-sheet="logdate"]');
  T((await ev(`document.querySelectorAll('.sheet .btn.primary').length`)) === 0 && !/Use this date/.test(await text()), 'the date sheet has no "Use this date" confirm; Today and Yesterday are choices, not a filled button');
  await clickText('Yesterday', '.sheet');
  T((await ev(`!document.querySelector('.sheet')`)) === true, 'tapping Yesterday chooses it and closes the sheet in one tap');
  T(/Yesterday/.test(await text()), 'the date chip says "Yesterday" after choosing it');
  await click('[data-sheet="logdate"]');
  T((await ev(`document.querySelector('.sheet .seg3 button.on').innerText`)) === 'Yesterday', 'reopened, the chosen day is the raised segment');
  await ev(`(()=>{const i=document.querySelector('#f-pick');i.value='2026-09-28';i.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  T((await ev(`!document.querySelector('.sheet')`)) === true && /Mon, Sep 28/.test(await text()), '"Another day" picks a date and closes the sheet by itself: the chip says Mon, Sep 28');
  await click('[data-sheet="logdate"]'); await clickText('Yesterday', '.sheet'); // the saved payment below must be dated Oct 1
  await setVal('#f-lamount', '300'); await click('#logsave'); await clickText('Save it', '.scrim');
  const lastPay = await ev(`(()=>{const d=__mock.db.debts.find(x=>x.id==='d1');return d.payments[d.payments.length-1]})()`);
  T(lastPay && lastPay.date === '2026-10-01' && lastPay.amount === 30000, 'the payment is saved dated Oct 1 for exactly 300.00', JSON.stringify(lastPay));
  await open(390, 844, 'route=overview'); await clickText('Record payment', '.hero');
  T((await ev('__mock.S.route')) === 'log' && (await ev(`document.querySelectorAll('.tile.on').length`)) === 1, 'Overview "Record payment" lands on Log with that debt already picked');
  // --- List ---
  // each section: its header text and how many rows sit under it
  const sections = () => ev(`[...document.querySelectorAll('#phone .grouphead')].map(h=>({h:h.innerText.replace(/\\s+/g,' ').trim(),n:h.nextElementSibling?h.nextElementSibling.querySelectorAll('.rw').length:0}))`);
  await open(390, 844, 'route=list'); let sec = await sections();
  T(sec.length === 2 && /^I owe \(6\) · ₱43,026\.33$/.test(sec[0].h) && sec[0].n === 6 && /^Owed to me \(2\) · ₱3,200\.00$/.test(sec[1].h) && sec[1].n === 2, 'List under All: two separate sections, "I owe (6) · ₱43,026.33" first and "Owed to me (2) · ₱3,200.00" second, each with its own total', JSON.stringify(sec));
  const owedNames = await ev(`[...document.querySelectorAll('#phone .grouphead')].map(h=>h.nextElementSibling.innerText)`);
  T(/Ate Gina/.test(owedNames[1]) && /Carlo/.test(owedNames[1]) && !/Ate Gina|Carlo/.test(owedNames[0]), 'the two people who owe Joe sit only under "Owed to me", never between rows he owes');
  T((await ev(`!document.querySelector('[data-list-summary]')`)) === true && !sec.some((s) => /This week|Later/.test(s.h)), 'no summary card and no "This week / Later" sub-groups: the section headers carry the totals');
  await clickText('I owe', '.chips'); sec = await sections(); T(sec.length === 1 && /^I owe \(6\)/.test(sec[0].h), 'the I owe filter shows one section of 6');
  await clickText('Owed to me', '.chips'); sec = await sections(); T(sec.length === 1 && /^Owed to me \(2\)/.test(sec[0].h), 'the Owed to me filter shows one section of 2');
  await clickText('All', '.chips'); await clickText('Settled', '#lfstatus'); sec = await sections(); t = await text();
  T(sec.length === 1 && sec[0].h === 'Settled (3)' && sec[0].n === 3 && !/3 settled debts/.test(t), 'the Settled filter shows "Settled (3)" with 3 rows, and no card holding one sentence');
  await click('[data-sheet="lfilter"]'); t = await text();
  T(!/\bShow\b/.test(await ev(`document.querySelector('.sheet').innerText`)) && /What kind/.test(t) && /Sort by/.test(t) && /Anyone/.test(t), 'the filters sheet no longer repeats the Open/Overdue/Settled choices ("Show"), and Who is one row ("Anyone")');
  await clickText('Tab', '.sheet'); await clickText('Done', '.sheet'); await clickText('Open', '#lfstatus'); sec = await sections();
  T(sec.length === 2 && sec[0].n + sec[1].n === 2, 'Filters > Tab shows the 2 open tabs, one under each direction', JSON.stringify(sec));
  await click('[data-sheet="lfilter"]'); await click('[data-sheet="lfperson"]'); await setVal('#pq', 'kuya');
  T((await ev(`[...document.querySelectorAll('#personlist [data-q]')].filter(r=>!r.hidden).length`)) === 1, 'the Who picker is searchable: "kuya" leaves one person');
  await clickText('Kuya Jun', '#personlist'); t = await text();
  T(/Filters/.test(t) && /Kuya Jun/.test(t), 'choosing a person returns to the filters sheet showing that person');
  await clickText('Done', '.sheet'); sec = await sections(); T(sec.length === 1 && sec[0].n === 1, 'Tab + Kuya Jun leaves exactly one debt');
  await open(390, 844, 'route=list&data=overdue'); await clickText('Overdue', '#lfstatus'); sec = await sections(); t = await text();
  T(sec.length === 1 && sec[0].h === 'I owe (1) · ₱747.50 overdue' && sec[0].n === 1 && /Home Credit/.test(t), 'Overdue filter: one section "I owe (1) · ₱747.50 overdue" holding only Home Credit, and no empty "Owed to me ₱0.00"', JSON.stringify(sec));
  T(/₱747\.50 overdue/.test(await ev(`document.querySelector('.rw').innerText`)) && /left/.test(await ev(`document.querySelector('.rw').innerText`)), 'the row says "₱747.50 overdue" with the balance left shown as "... left" under it, so the balance is not mistaken for the late amount');
  await open(390, 844, 'route=list'); await click('[data-act="lfsearch"]'); await setVal('#lf-q', 'merly'); sec = await sections();
  T(sec.length === 1 && sec[0].n === 1, 'searching "merly" finds exactly one debt');
  await ev(J('List: nothing matches')); t = await text(); T(/No debts match/.test(t) && /Clear filters/.test(t) && !/₱0\.00/.test(t), 'a filter with no results says so, offers to clear them, and shows no "₱0.00" summary');
  // --- settled mark options (tick is the default; line and = stay in the toolbar only so Joe can compare) ---
  for (const [m, sel] of [['tick', '.row .pill.soft svg'], ['line', '.row .struck'], ['equal', '.row .pill .eq']]) {
    await open(390, 844, `route=list&mark=${m}`); await clickText('Settled', '#lfstatus');
    const ok = await ev(`!!document.querySelector(${JSON.stringify(sel)})`); const word = await ev(`[...document.querySelectorAll('#phone .rw')].some(r=>/Settled/.test(r.innerText))`);
    T(ok && !word, `settled mark "${m}": drawn in each settled row, and the word "Settled" is not printed`);
  }
  await open(390, 844, 'route=list'); await clickText('Settled', '#lfstatus');
  const sbars = await ev(`[...document.querySelectorAll('#phone .rw .rowbar .bar4')].map(b=>Math.round(b.querySelector('i').getBoundingClientRect().width/b.getBoundingClientRect().width*100))`);
  T(sbars.length === 3 && sbars.every((w) => w === 100), 'settled rows carry the full-length bar (the "straight line" that means all good)', sbars.join('/'));
  await open(390, 844, 'route=debt&params=%7B%22id%22%3A%22s3%22%7D');
  const topbar = await ev(`(()=>{const b=document.querySelector('.card .bar6 i');return b?Math.round(b.getBoundingClientRect().width/b.parentElement.getBoundingClientRect().width*100):-1})()`);
  T(topbar === 100 && (await ev(`!!document.querySelector('.card .pill.soft svg')`)), 'a settled debt (even one written off) shows the tick and a full-length bar on its top card', `${topbar}%`);
  // --- entries: details, edit, delete ---
  await open(390, 844, 'route=debt&params=%7B%22id%22%3A%22d1%22%7D'); await ev('__mock.S.sw.sounds=true;PatasFx.setSounds(true)');
  const rowsBefore = await ev(`document.querySelectorAll('.ledger tr.tap').length`);
  await click('.ledger tr.tap[data-k="pay"][data-i="3"]'); t = await text();
  T(/Payment/.test(t) && /Edit/.test(t) && /Added/.test(t), 'tapping a history line opens its details pop-up with an Edit button');
  t = await ev(`document.querySelector('.dialog').innerText.replace(/\\s+/g,' ')`);
  T(/For Installment 4 of 10/.test(t) && !/\bWhat\b/.test(t) && !(await ev(`!!document.querySelector('.dialog .pill.soft')`)), 'entry details: "For Installment 4 of 10", no repeated "What: I paid" row, and no tick-in-a-square that looks like a checkbox', t.slice(0, 160));
  T((await ev(`getComputedStyle(document.querySelector('.scrim')).backdropFilter`)).includes('blur'), 'the pop-up blurs the screen behind it');
  await click('.editpill');
  T((await ev(`document.querySelector('#editsave').disabled`)) === true, 'Edit: "Save changes" stays off while nothing has changed');
  const dg = await ev(`(()=>{const s=document.querySelector('#editsave').getBoundingClientRect(),d=document.querySelector('.dellink').getBoundingClientRect();return {gap:Math.round(d.top-s.bottom),cls:document.querySelector('.dellink').className}})()`);
  T(dg.gap >= 20 && !/btn/.test(dg.cls), 'Delete sits at least 20px below Save and is a text button, not an outlined block the same size as Save', JSON.stringify(dg));
  await setVal('#e-amount', '1200'); T((await ev(`document.querySelector('#editsave').disabled`)) === false, 'typing a new amount turns "Save changes" on');
  await setVal('#e-amount', '1,247.50'); T((await ev(`document.querySelector('#editsave').disabled`)) === true, 'typing the old amount back turns it off again (CONTROL: it follows real changes)');
  await setVal('#e-amount', '1200'); await click('[data-sheet="confirmedit"]'); t = await text();
  T(/Save these changes\?/.test(t) && /₱1,247\.50 →/.test(t), 'saving an edit shows before and after first');
  T(/Amount/.test(await ev(`document.querySelector('.dialog').innerText`)) && !/Date|Note/.test(await ev(`document.querySelector('.dialog').innerText`)), 'the confirm lists only the field that changed (Amount), not Date or Note');
  await clickText('Save it', '.scrim'); t = await text();
  T(/₱7,532\.50/.test(t), 'after changing the payment to 1,200.00 the balance is exactly ₱7,532.50 (it was 7,485.00)');
  await click('.ledger tr.tap[data-k="pay"][data-i="3"]'); await click('.editpill'); await click('[data-sheet="confirmdel"]'); t = await text();
  T(/Delete this payment\?/.test(t) && /removed from all your phones/.test(t), 'deleting asks first: "removed from all your phones"');
  const sw0 = (await sounds()).length; await clickText('Delete', '.scrim');
  T((await ev(`document.querySelectorAll('.ledger tr.tap[data-k="pay"]').length`)) === 3 && (await sounds()).slice(sw0).includes('swish'), 'confirming removes exactly one payment line and plays a quiet swish');
  // --- themes ---
  const lumF = `const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)};const L=c=>{const m=c.match(/[\\d.]+/g).map(Number);return 0.2126*f(m[0])+0.7152*f(m[1])+0.0722*f(m[2])};const R=(a,b)=>{const x=L(a),y=L(b);return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)};`;
  const themeBad = [];
  for (const th of ['ink', 'green', 'lavender', 'teal', 'pink']) for (const sch of ['light', 'dark']) {
    await open(390, 844, `route=overview&theme=${th}&look=${sch}`, sch);
    const r = await ev(`(()=>{${lumF}const cs=getComputedStyle(document.querySelector('#phone'));const g=(n)=>cs.getPropertyValue(n).trim();const hex=(h)=>{h=h.replace('#','');return 'rgb('+[0,2,4].map(i=>parseInt(h.substr(i,2),16)).join(',')+')'};return {text:R(hex(g('--text')),hex(g('--bg'))),muted:R(hex(g('--muted')),hex(g('--bg'))),accent:R(hex(g('--accent')),hex(g('--bg'))),accentSurface:R(hex(g('--accent')),hex(g('--surface'))),accentSoft:R(hex(g('--accent')),hex(g('--accent-soft'))),fill:R('rgb(255,255,255)',hex(g('--accent-fill'))),acc:hex(g('--accent')),fillc:hex(g('--accent-fill')),over:'rgb(176,68,27)',overD:'rgb(232,121,74)',due:'rgb(154,103,0)',dueD:'rgb(232,163,61)'}})()`);
    const probs = [];
    if (r.text < 7) probs.push('text ' + r.text.toFixed(1)); if (r.muted < 4.5) probs.push('muted ' + r.muted.toFixed(2)); if (r.accent < 4.5) probs.push('accent/bg ' + r.accent.toFixed(2));
    if (r.accentSurface < 4.5) probs.push('accent/surface ' + r.accentSurface.toFixed(2)); if (r.accentSoft < 4.5) probs.push('accent/soft ' + r.accentSoft.toFixed(2)); if (r.fill < 4.5) probs.push('button text ' + r.fill.toFixed(2));
    const over = rgbOf(sch === 'dark' ? r.overD : r.over), due = rgbOf(sch === 'dark' ? r.dueD : r.due), acc = rgbOf(r.acc), fil = rgbOf(r.fillc);
    if (dE(acc, over) < 20 || dE(fil, over) < 20) probs.push('overdue rust too close to the accent (dE ' + Math.min(dE(acc, over), dE(fil, over)).toFixed(0) + ')');
    if (dE(acc, due) < 20) probs.push('due-today amber too close to the accent');
    if (probs.length) themeBad.push(`${th} ${sch}: ${probs.join(', ')}`);
  }
  T(themeBad.length === 0, 'all 5 themes x light/dark: text 7:1, muted, accent on background/card/tint and button text each 4.5:1, and overdue and due-today stay clearly different from the accent', themeBad.join(' | '));
  T(dE(rgbOf('rgb(181,67,42)'), rgbOf('rgb(176,68,27)')) < 20, 'CONTROL: Gastos\'s "Sunset coral" (#B5432A) is too close to the overdue rust, which is why it is not offered');
  await open(390, 844, 'route=settings'); await click('[data-sheet="themepick"]'); await clickText('Lavender', '.sheet');
  T((await ev(`getComputedStyle(document.querySelector('#phone')).getPropertyValue('--accent').trim()`)) === '#5E4E8C', 'picking Lavender in the sheet changes the accent for the whole app (#5E4E8C, a dustier "ube" instead of saturated violet)');
  t = await text(); T(/Color theme/.test(t) && /Baby pink/.test(t) && /Forest green/.test(t), 'the theme sheet shows each theme as a mini top card with its name');
  // --- currency ---
  await open(390, 844, 'route=overview'); const phpTotal = moneyAfter(await text(), 'Total I still owe');
  await ev(`__mock.go('settings')`); await click('[data-sheet="currency"]'); await setVal('#cq', 'yen');
  T((await ev(`[...document.querySelectorAll('#curlist [data-q]')].filter(r=>!r.hidden).length`)) === 1, 'searching "yen" leaves exactly one currency');
  await setVal('#cq', ''); await clickText('USD', '#curlist'); await ev(`__mock.go('overview')`); t = await text();
  T(/\$757\.26/.test(t), 'switching to US dollars shows the total as $757.26 (43,026.33 x the sample rate 0.0176)');
  await ev(`__mock.go('settings')`); await click('[data-sheet="currency"]'); await clickText('PHP', '#curlist'); await ev(`__mock.go('overview')`);
  T(moneyAfter(await text(), 'Total I still owe') === phpTotal, 'switching back to pesos gives exactly ₱43,026.33 again (original amounts kept)');
  await open(390, 844, 'route=settings&cond=offline'); await click('[data-sheet="currency"]'); t = await text();
  T(/Needs internet to change/.test(t) && (await ev(`[...document.querySelectorAll('#curlist .row')].every(r=>r.disabled)`)), 'offline: the currency list is locked with "Needs internet to change"');
  // --- FAQ ---
  await open(390, 844, 'route=settings'); await click('[data-sheet="faq"]');
  const total = await ev(`document.querySelectorAll('#faqlist [data-q]').length`); T(total === 11 && !/line or tick/.test(await ev(`document.querySelector('#faqlist').innerText`)), 'the FAQ has 11 questions (the one explaining the settled mark is gone: a mark that needs an FAQ entry has failed)', `${total}`);
  await setVal('#fq', 'qr'); const hits = await ev(`[...document.querySelectorAll('#faqlist [data-q]')].filter(r=>!r.hidden).map(r=>r.dataset.q)`);
  T(hits.length >= 1 && hits.length < total && hits.every((h) => h.includes('qr')), 'searching "qr" keeps only questions that mention it', `${hits.length} of ${total}`);
  await setVal('#fq', 'zzzz'); T((await ev(`!document.querySelector('#faqnone').hidden`)) === true, 'a search with no match says so');
  await setVal('#fq', ''); const q2 = await ev(`(()=>{const b=document.querySelectorAll('#faqlist .faq-q')[1];const a=b.nextElementSibling;const before=a.hidden;b.click();return [before,a.hidden]})()`);
  T(q2[0] === true && q2[1] === false, 'tapping a question opens its answer');
  // --- feedback ---
  await open(390, 844, 'route=settings'); await ev('__mock.S.sw.sounds=true;PatasFx.setSounds(true)'); await click('[data-sheet="feedback"]');
  T((await ev(`document.querySelector('#fbsend').disabled`)) === true, 'Send is off until you type something');
  await setVal('#f-fb', 'The List tab is great'); T((await ev(`document.querySelector('#fbsend').disabled`)) === false, 'Send turns on once there are words');
  await click('#fbsend'); t = await text(); T(/Sent\. Thank you!/.test(t) && (await sounds()).slice(-1)[0] === 'thanks', 'sending shows "Sent. Thank you!" and a two-note chime');
  await open(390, 844, 'route=settings&cond=offline'); await click('[data-sheet="feedback"]'); await setVal('#f-fb', 'hello');
  T((await ev(`document.querySelector('#fbsend').disabled`)) === true && /Needs internet to send/.test(await text()), 'offline: feedback cannot be sent and says why');
  // --- Overview and the rest, carried from round 1 ---
  await open(390, 844, 'route=overview&data=overdue'); t = await ev(`document.querySelector('.thens')?.innerText||''`);
  T(/Home Credit/.test(t) && /Oct 4/.test(t), 'overdue hero: "then" includes the Home Credit payment due Oct 4');
  t = await text(); T(/₱500\.00 paid/.test(t), 'overdue hero: the partly-paid installment says how much was paid');
  await ev(`__mock.go('debt',{id:'d1'})`); t = await text();
  T(/Next: ₱747\.50 · overdue since Fri, Sep 4/.test(t), 'debt detail leads with "Next: ₱747.50 · overdue since Fri, Sep 4"');
  T((await ev(`document.querySelectorAll('#phone .pill.overdue').length`)) === 1, 'debt detail has exactly one solid rust pill');
  T(/Show 3 paid/.test(t) && !/#1 ·/.test(t), 'paid installments are collapsed behind "Show 3 paid"');
  await click('[data-sheet="debtmenu"]'); t = await text(); T(/Edit/.test(t) && /Share summary/.test(t) && /Delete/.test(t), 'the "..." menu holds Edit, Share summary and Delete');
  await open(390, 844, 'route=people'); t = await text();
  T(/I owe \(\d+\)/.test(t) && /Owed to me \(\d+\)/.test(t) && t.indexOf('I owe (') < t.indexOf('Owed to me (') && !/Owes you/.test(t), 'People: two grouped lists, "I owe" first');
  await click('[data-go="person"]'); await click('[data-sheet="personmenu"]'); await click('[data-sheet="rename"]'); await setVal('#f-rename', 'Kuya Jun R.'); await click('[data-sheet="confirmrename"]');
  T(/Changes 1 debt/.test(await text()), 'renaming a person asks first and says how many debts change');
  await clickText('Rename', '.scrim'); T((await ev(`__mock.db.debts.some(d=>d.person==='Kuya Jun R.')`)) === true, 'confirming renames them everywhere');
  await open(390, 844, 'route=overview&data=settled'); t = await text(); T(/Patas na\./.test(t) && !/Due next/.test(t) && !/₱0\.00/.test(t), 'all settled: "Patas na." with no "Due next" label and no ₱0.00 cards');
  await open(390, 844, 'route=overview&data=first'); t = await text(); T(!/₱0\.00/.test(t), 'first run: no ₱0.00 totals');
  await open(390, 844, 'route=log&data=first'); t = await text(); T(/Add your first debt to start logging/.test(t), 'Log on first run invites the first debt');
  await open(390, 844, 'route=overview&data=long');
  const lab = await ev(`(()=>{const h=document.querySelector('.hero');const e=h.querySelector('.clamp2');const l=h.querySelector('.t15.ell');return {label:e.innerText,labelCut:e.scrollHeight>e.clientHeight+1,lenderOnOwnLine:l.getBoundingClientRect().bottom<=e.getBoundingClientRect().top+1}})()`);
  T(lab.label.startsWith('Redmi Note 13') && !lab.labelCut && lab.lenderOnOwnLine, 'long names: the label shows in full on its own line(s); only the lender name may be ellipsised');
  await open(390, 844, 'route=overview&data=duetoday'); T(/Due today/.test(await text()), 'the "Due today" state renders');
  await open(390, 844, 'route=debt&data=overpaid&params=%7B%22id%22%3A%22d5%22%7D'); T(/Overpaid ₱500\.00/.test(await text()), 'the "Overpaid" state renders with ₱500.00');
  // --- controls and Show QR details carried over ---
  for (const scheme of ['light', 'dark']) {
    await open(390, 844, `route=settings&look=${scheme}`, scheme);
    const r = await ev(`(()=>{${lumF}const on=document.querySelector('.seg3 button.on'),tray=document.querySelector('.seg3');const cs=getComputedStyle(on),ct=getComputedStyle(tray);return {ratio:R(cs.color,cs.backgroundColor),onLum:L(cs.backgroundColor),trayLum:L(ct.backgroundColor)}})()`);
    T(r.ratio >= 4.5 && r.onLum > r.trayLum, `segmented control ${scheme}: selected text ${r.ratio.toFixed(2)}:1 and the selected segment is LIGHTER than its tray`);
  }
  await open(390, 844, 'route=showQr&params=%7B%22id%22%3A%22v1%22%2C%22from%22%3A%22d1%22%2C%22block%22%3A%22nomatch%22%7D');
  const dd = await ev(`(()=>{const b=document.querySelector('.qrscreen .btn[disabled]');if(!b)return null;const cs=getComputedStyle(b);return {bg:cs.backgroundColor,op:cs.opacity}})()`);
  T(dd && dd.bg === 'rgb(228, 229, 232)' && dd.op === '1', 'blocked Save or share is a neutral grey button (not a faded accent)');
  await open(390, 844, 'route=overview'); T(/saturate\(0?\.4/.test(await ev(`getComputedStyle(document.querySelector('.nav')).backdropFilter`)), 'glass nav desaturates what slides under it');
  await open(390, 844, 'route=showQr&params=%7B%22id%22%3A%22v1%22%2C%22from%22%3A%22d1%22%7D');
  const qw = await ev(`document.querySelector('.qrframe svg').getBoundingClientRect().width`); T(qw >= 316 && qw <= 320, 'Show QR: the code is 318px wide on a 390px phone', `${qw}px`);
  await open(390, 844, 'route=qrExport');
  const qz = await ev(`(()=>{const s=document.querySelector('#exportqr svg').getBoundingClientRect(),c=document.querySelector('#exportcap').getBoundingClientRect(),card=document.querySelector('#export').getBoundingClientRect();const mod=s.width/31;return {gap:(c.top-(s.bottom-mod))/mod,left:((s.left+mod)-card.left)/mod,top:((s.top+mod)-card.top)/mod}})()`);
  T(qz.gap >= 4 && qz.left >= 4 && qz.top >= 4, 'saved copy: caption and card edge are at least 4 QR squares from the code');
  await open(390, 844, 'route=welcome&params=%7B%22step%22%3A0%7D'); const lg = await ev(`(()=>{const l=document.querySelector('.brand .logo').getBoundingClientRect();return {x:l.x,y:l.y}})()`); T(lg.y > 60, 'welcome: the logo mark is not pinned to the top-left corner where a menu icon lives');
  await open(390, 844, 'route=vault&data=first'); const gap = await ev(`(()=>{const p=document.querySelector('.empty p').getBoundingClientRect(),b=document.querySelector('.empty .btn').getBoundingClientRect();return b.top-p.bottom})()`); T(gap >= 23, 'empty state: 24px between the sentence and the button', `${Math.round(gap)}px`);
  // --- brand previews ---
  await open(390, 844, 'route=loading'); const bars = await ev(`[...document.querySelectorAll('.loader i')].map(i=>Math.round(i.getBoundingClientRect().width))`);
  T(bars.length === 2 && bars[0] === bars[1], 'loading picture under reduced motion: the two bars are level (held still)', bars.join(' / '));
  await open(390, 844, 'route=appicons'); t = await text(); T(/A · Two level bars/.test(t) && /B · A tick/.test(t) && /C · P with a level line/.test(t), 'brand previews show three placeholder icon options with their risks');
}

// ---------------- 7. Erina's round 2 review: each fix measured ----------------
async function fixes() {
  console.log("== 7. Erina's round 2 fixes, each measured (a control wherever a check could pass by accident) ==");
  let t;
  const SND = '__mock.S.sw.sounds=true;PatasFx.setSounds(true)';
  // --- Log is one job ---
  for (const [w, h] of [[390, 844], [360, 640]]) {
    await open(w, h, 'route=log'); t = await text();
    T(!/Still to pay this month/.test(t) && !/Owed to me/.test(t) && (await ev(`!document.querySelector('.logglass')`)), `Log ${w}x${h}: the glass strip is gone (it repeated Overview's number)`);
    T((await ev(`document.querySelector('#phone .screen > .stack').firstElementChild.classList.contains('seg3')`)) === true, `Log ${w}x${h}: the first thing on the screen is the I paid / I received switch`);
    await ev(`__mock.A.logfor({dataset:{id:'d6'}})`); // a tab: the tallest state, with the two small chips
    const g = await ev(`(()=>{const nav=document.querySelector('.nav').getBoundingClientRect(),s=document.querySelector('#logsave').getBoundingClientRect();const e=document.elementFromPoint(s.x+s.width/2,s.y+s.height/2);return {gap:Math.round(nav.top-s.bottom),visible:!!(e&&e.closest('#logsave')),h:Math.round(s.height)}})()`);
    T(g.visible && g.gap >= 6 && g.gap <= 10, `Log ${w}x${h} with a tab picked: Save is on top, ${g.gap}px above the tabs, and the browser agrees it is what you would tap`, JSON.stringify(g));
    await ev(`document.querySelector('.savebar').style.position='static'`);
    const g2 = await ev(`(()=>{const nav=document.querySelector('.nav').getBoundingClientRect(),s=document.querySelector('#logsave').getBoundingClientRect();const e=document.elementFromPoint(s.x+s.width/2,s.y+s.height/2);return {gap:Math.round(nav.top-s.bottom),visible:!!(e&&e.closest('#logsave'))}})()`);
    T(!g2.visible || g2.gap > 40, `CONTROL ${w}x${h}: if Save were not pinned, the same check fails`, JSON.stringify(g2));
    await ev(`__mock.A.logfor({dataset:{id:'d6'}})`);
    const under = await ev(`(()=>{const sc=document.querySelector('.screen');sc.scrollTop=99999;const n=document.querySelector('.notefield').getBoundingClientRect(),b=document.querySelector('.savebar').getBoundingClientRect();return {noteBottom:Math.round(n.bottom),barTop:Math.round(b.top)}})()`);
    T(under.noteBottom <= under.barTop + 1, `Log ${w}x${h}: scrolled to the end, the last field (note) ends above the pinned Save, so nothing is trapped under it`, JSON.stringify(under));
  }
  await open(390, 844, 'route=log&data=first'); t = await text();
  T(/Add your first debt to start logging/.test(t) && !/₱0\.00/.test(t) && (await ev(`!document.querySelector('#f-lamount') && !document.querySelector('#logsave')`)), 'Log first run: an invitation card, no ₱0.00 strip, no dead Amount field, no dead Save button');
  // --- tiles ---
  await open(360, 640, 'route=log');
  const tl = await ev(`(()=>{const ts=[...document.querySelectorAll('.tile:not(.other)')];return ts.map(t=>{const n=t.querySelector('.nm');const r=t.getBoundingClientRect();return {n:n.innerText,cut:n.scrollHeight>n.clientHeight+1,lines:Math.round(n.getBoundingClientRect().height/18),top:Math.round(r.top),h:Math.round(r.height)}})})()`);
  T(tl.every((x) => !x.cut && x.lines <= 2), 'Log tiles at 360 wide: no lender name is cut off (at most two lines)', tl.map((x) => `${x.n}:${x.lines}`).join(' | '));
  const byRow = {}; tl.forEach((x) => { (byRow[x.top] = byRow[x.top] || []).push(x.h); });
  T(Object.values(byRow).every((hs) => new Set(hs).size === 1), 'tiles in the same row share one height', JSON.stringify(byRow));
  await click('.tile');
  const tk = await ev(`(()=>{const t=document.querySelector('.tile.on'),k=t.querySelector('.tick').getBoundingClientRect(),r=t.getBoundingClientRect(),n=t.querySelector('.nm').getBoundingClientRect();return {dx:Math.round(k.x+k.width/2-r.right),dy:Math.round(k.y+k.height/2-r.top),w:Math.round(k.width),overlap:!(k.right<=n.left||k.left>=n.right||k.bottom<=n.top||k.top>=n.bottom),sideways:document.querySelector('.screen').scrollWidth-document.querySelector('.screen').clientWidth}})()`);
  T(Math.abs(tk.dx) <= 3 && Math.abs(tk.dy) <= 3 && tk.w === 20 && !tk.overlap && tk.sideways <= 0, 'the selected tick is a 20px circle on the tile corner, touches no text, and causes no sideways scroll', JSON.stringify(tk));
  // --- note field, QR link, buttons ---
  for (const scheme of ['light', 'dark']) {
    await open(390, 844, `route=log&look=${scheme}`, scheme);
    const nf = await ev(`(()=>{const a=getComputedStyle(document.querySelector('.amount')),n=getComputedStyle(document.querySelector('.notefield'));return {ab:a.backgroundColor,nb:n.backgroundColor,aw:a.borderTopWidth,nw:n.borderTopWidth}})()`);
    T(nf.ab === nf.nb && nf.aw === nf.nw, `Log ${scheme}: the note field has the same fill and border as the Amount field (no tinted block)`, JSON.stringify(nf));
  }
  await open(390, 844, 'route=log'); await clickText('Home Credit', '[data-log]');
  const ql = await ev(`(()=>{const b=document.querySelector('#lhint button');return b?{t:b.innerText.trim(),h:Math.round(b.getBoundingClientRect().height)}:null})()`);
  T(ql && /Show QR/.test(ql.t) && ql.h >= 44 && (await ev(`[...document.querySelectorAll('#phone .btn')].every(b=>b.innerText.trim().length>0)`)), 'the QR shortcut is a labelled "Show QR" link in the hint line (44px tall); no unlabelled icon button is left on Log', JSON.stringify(ql));
  await setVal('#f-lamount', '500'); await click('#logsave');
  const cf = await ev(`(()=>{const d=document.querySelector('.dialog');return {txt:d.innerText.replace(/\\s+/g,' '),nw:[...d.querySelectorAll('.nw')].map(e=>Math.round(e.getBoundingClientRect().height))}})()`);
  T(/Home Credit Redmi Note 13 Installment 5 of 10 · Today, Fri Oct 2/.test(cf.txt) && cf.nw.length === 2 && cf.nw.every((h) => h <= 20), 'the save confirm reads "Redmi Note 13" / "Installment 5 of 10 · Today, Fri Oct 2", each phrase on one line', cf.txt.slice(0, 120) + ' ' + cf.nw);
  await ev(`__mock.go('debt',{id:'d6'})`); await clickText('Mark as settled');
  const sb = await ev(`(()=>{const b=[...document.querySelectorAll('.dialog .btn')];const a=b.find(x=>/Write off/.test(x.innerText)),c=b.find(x=>/Cancel/.test(x.innerText));const ra=a.getBoundingClientRect(),rc=c.getBoundingClientRect();return {h:Math.round(ra.height),w:Math.round(ra.width),below:rc.top>=ra.bottom}})()`);
  T(sb.h <= 52 && sb.w >= 250 && sb.below, 'the settle confirm: "Write off and settle" is one line, full width, with Cancel stacked below it', JSON.stringify(sb));
  // --- Overview ---
  await open(390, 844, 'route=overview'); t = await text();
  T(!/See all \d+ debts/.test(t) && !/Settled \(\d\)/.test(t), 'Overview: the two trailing links that repeated the List tab are gone');
  await open(390, 844, 'route=overview&data=settled'); t = await text();
  T(/Patas na\./.test(t) && /Add a debt/.test(t) && !/See all/.test(t) && !/Total I still owe/.test(t), 'Overview all settled: "Patas na." and a "+ Add a debt" text button, no "See all 0 debts"');
  // --- Debt detail top right ---
  await open(390, 844, 'route=debt&params=%7B%22id%22%3A%22d1%22%7D'); t = await ev(`document.querySelector('.card .cardhead').innerText`);
  T(!/in 2 days|Due Oct/.test(t), 'Debt detail: top right no longer repeats the date that the "Next:" line already says', t.replace(/\n/g, ' '));
  await open(390, 844, 'route=debt&data=overdue&params=%7B%22id%22%3A%22d1%22%7D'); t = await ev(`document.querySelector('.card .cardhead').innerText`);
  T(/Overdue/.test(t), 'CONTROL: an overdue debt still shows its Overdue pill top right', t.replace(/\n/g, ' '));
  // --- nav icons ---
  await open(360, 640, 'route=log');
  const icons = await ev(`[...document.querySelectorAll('.nav button svg')].map(s=>s.innerHTML)`);
  T(new Set(icons).size === 6 && !/rect/.test(icons[1]) && /circle/.test(icons[5]) && /rect/.test(icons[4]), 'tab icons: all six differ; Overview is horizontal bars (no squares, so it no longer looks like the QR tab) and Settings is a gear');
  // --- grouped action menus ---
  const menuProbe = `(()=>{const rows=[...document.querySelectorAll('.sheet .mrow')];const last=rows[rows.length-1];return {n:rows.length,minH:Math.min(...rows.map(r=>Math.round(r.getBoundingClientRect().height))),lastColor:getComputedStyle(last).color,lastBorder:getComputedStyle(last).borderTopColor,lastText:last.innerText.trim(),close:/Close/.test(document.querySelector('.sheet').innerText),pile:!!document.querySelector('.sheet .btn'),icons:rows.every(r=>{const s=r.querySelector('svg');return s&&Math.round(s.getBoundingClientRect().width)===20}),grouped:!!document.querySelector('.sheet > .list')}})()`;
  await open(390, 844, 'route=debt&params=%7B%22id%22%3A%22d1%22%7D'); await click('[data-sheet="debtmenu"]');
  let m = await ev(menuProbe);
  T(m.n === 3 && m.minH >= 52 && m.icons && m.grouped && !m.close && !m.pile && m.lastText === 'Delete' && m.lastColor === 'rgb(179, 38, 30)', 'debt menu: rows in one grouped card, 52px tall, an icon each, Delete last in red text, no "Close", no pile of buttons', JSON.stringify(m));
  await open(390, 844, 'route=showQr&params=%7B%22id%22%3A%22v1%22%2C%22from%22%3A%22d1%22%7D'); await click('[data-sheet="qrmenu"]');
  m = await ev(menuProbe);
  T(m.n === 3 && m.minH >= 52 && m.icons && m.grouped && !m.close && !m.pile && /Remove/.test(m.lastText) && m.lastColor === 'rgb(179, 38, 30)', 'QR menu: same grouped rows, Remove last in red text', JSON.stringify(m));
  // --- settings, themes ---
  await open(390, 844, 'route=settings'); t = await text();
  T(!/\bNEW\b/.test(t) && (await ev(`document.querySelector('[data-sw="sounds"]').getAttribute('aria-checked')`)) === 'false', 'Settings: no "NEW" badge on a first release, and Sounds is switched off by default');
  T((await ev(`document.querySelector('[data-seg="look"][data-v="system"] svg').innerHTML`)).includes('M12 8a2.83') && !(await ev(`document.querySelector('[data-seg="look"][data-v="system"] svg').innerHTML`)).includes('currentColor'), 'Appearance "Auto" uses the sun-moon icon, not the half-filled circle that already means "partly paid"');
  await click('[data-sheet="themepick"]'); t = await ev(`document.querySelector('.sheet').innerText`);
  T(!/Only colors that keep/.test(t), 'the theme sheet no longer explains its own design reasoning');
  const mini = await ev(`(()=>{const hex=(h)=>{h=h.trim().replace('#','');return 'rgb('+[0,2,4].map(i=>parseInt(h.substr(i,2),16)).join(', ')+')'};return [...document.querySelectorAll('.theme')].map(b=>{const i=b.querySelector('.acbar i'),bar=b.querySelector('.acbar');return {ok:getComputedStyle(i).backgroundColor===hex(getComputedStyle(b).getPropertyValue('--accent')),pct:Math.round(i.getBoundingClientRect().width/bar.getBoundingClientRect().width*100),h:Math.round(bar.getBoundingClientRect().height)}})})()`);
  T(mini.length === 5 && mini.every((x) => x.ok && x.pct === 60 && x.h === 4), 'every theme preview has a 4px bar filled 60% in that theme\'s own accent', JSON.stringify(mini));
  // pink dark: the main button must not look disabled; and it must stay clear of danger red
  const rgbHex = (h) => rgbOf('rgb(' + [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(',') + ')');
  const dis = rgbHex('#2C313C'), danger = rgbHex('#C9372F');
  const oldPink = [0, 2, 4].map((i) => Math.round(parseInt('F2A7C6'.slice(i, i + 2), 16) * 0.5));
  const fills = {};
  for (const th of ['ink', 'green', 'lavender', 'teal', 'pink']) { await open(390, 844, `route=log&theme=${th}&look=dark`, 'dark'); fills[th] = rgbOf(await ev(`getComputedStyle(document.querySelector('#phone')).getPropertyValue('--accent-fill')`).then((v) => 'rgb(' + [1, 3, 5].map((i) => parseInt(v.trim().slice(i, i + 2), 16)).join(',') + ')')); }
  const farFromDisabled = Object.entries(fills).map(([k, v]) => [k, dE(v, dis)]);
  T(farFromDisabled.every(([, d]) => d >= 35), 'dark mode: every theme\'s main button fill is clearly different from the disabled grey (colour distance 35 or more)', farFromDisabled.map(([k, d]) => `${k} ${d.toFixed(0)}`).join(' '));
  T(dE(oldPink, dis) < 35, 'CONTROL: the old pink-dark fill (a greyed mauve) fails the same bar, which is the fault Erina found', `dE ${dE(oldPink, dis).toFixed(0)}`);
  T(dE(fills.pink, danger) >= 20, 'pink (dark) button vs danger red #C9372F: colour distance is at least 20', `dE ${dE(fills.pink, danger).toFixed(1)}`);
  // --- currency labelling ---
  await open(390, 844, 'route=overview&cur=USD'); t = await text();
  const hero = await ev(`document.querySelector('.hero').innerText`);
  T(/≈\$\d/.test(hero) && /₱[\d,]+\.\d{2}/.test(hero) && /Shown in USD at today's rate/.test(t) && /≈\$/.test(await ev(`document.querySelector('[data-glance="owe"]').innerText`)), 'converted amounts wear "≈"; the hero shows the real peso amount under it; one muted line says what the screen is shown in', hero.replace(/\n/g, ' ').slice(0, 120));
  await open(390, 844, 'route=overview'); t = await text();
  T(!/≈/.test(t) && !/Shown in/.test(t), 'CONTROL: in pesos there is no "≈" and no "Shown in" line');
  await open(390, 844, 'route=log&cur=USD'); t = await ev(`document.querySelector('#phone .screen').innerText`);
  T(!/≈|\$/.test(t) && /₱[\d,]+\.\d{2}/.test(t), 'Log under USD still shows pesos (the lender is owed pesos), with no "≈"');
  await clickText('Home Credit', '[data-log]'); T((await ev(`document.querySelector('#f-lamount').value`)) === '1,247.50' && (await ev(`document.querySelector('.amount span').innerText`)) === '₱', 'under USD the Amount field is typed and pre-filled in pesos');
  await open(390, 844, 'route=showQr&cur=USD&params=%7B%22id%22%3A%22v1%22%2C%22from%22%3A%22d1%22%7D'); t = await text();
  T(/Amount to pay\s*₱[\d,]+\.\d{2}/.test(t) && !/≈/.test(t), 'Show QR "Amount to pay" under USD is in pesos');
  await open(390, 844, 'route=debt&cur=USD&params=%7B%22id%22%3A%22d1%22%7D'); t = await ev(`document.querySelector('.ledger').innerText`);
  T(/Amount ₱/.test(t) && !/\$|≈/.test(t), 'the History ledger under USD stays in pesos and says so in its column heads');
  await open(390, 844, 'route=settings&cond=offline'); await click('[data-sheet="currency"]');
  const off = await ev(`(()=>{const r=document.querySelector('#curlist .row');return {op:+getComputedStyle(r).opacity,box:!!document.querySelector('.sheet .banner'),note:!!document.querySelector('.sheet .plainnote')}})()`);
  T(off.op < 1 && !off.box && off.note, 'offline currency: rows are dimmed and the notice is a plain muted line, not a bordered box', JSON.stringify(off));
  // --- FAQ, splash ---
  await open(390, 844, 'route=settings'); await click('[data-sheet="faq"]');
  T((await ev(`getComputedStyle(document.querySelector('.faq-q.open')).backgroundColor`)) === 'rgba(0, 0, 0, 0)' && /Still stuck\? Send feedback/.test(await ev(`document.querySelector('.sheet').innerText`)), 'FAQ: the open question has no tint, and the foot offers "Still stuck? Send feedback"');
  await open(390, 844, 'route=splash'); T((await ev(`getComputedStyle(document.querySelector('.splash')).backgroundColor`)) === 'rgb(246, 246, 243)', 'splash is paper (#F6F6F3), not pure white');
}

async function shots() {
  for (const scheme of ['light', 'dark']) {
    await open(390, 844, `look=${scheme}`, scheme);
    const list = await ev('__mock.J.map((j,i)=>[j[0],!!j[1]])');
    for (let i = 0; i < list.length; i++) { if (!list[i][1]) continue; await ev(`__mock.jump(${i})`); await sleep(60); await shot(`${scheme}-${String(i).padStart(2, '0')}-${list[i][0].replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`); }
  }
  console.log('screenshots in', OUT);
}

const mode = process.argv[2] || 'all';
try {
  await connect();
  if (mode === 'screens' || mode === 'all') await screens();
  if (mode === 'fit' || mode === 'all') await fit();
  if (mode === 'tap' || mode === 'all') await tap();
  if (mode === 'contrast' || mode === 'all') await contrast();
  if (mode === 'flows' || mode === 'all') await flows();
  if (mode === 'review' || mode === 'all') await review();
  if (mode === 'fixes' || mode === 'all') await fixes();
  if (mode === 'shots') await shots();
  if (mode === 'eval') { await open(+process.argv[3], +process.argv[4], process.argv[5] || '', process.argv[7] || 'light'); console.log(JSON.stringify(await ev(process.argv[6]), null, 1)); }
  if (mode === 'text') { await open(390, 844, process.argv[5] || ''); errors = []; await ev(`__mock.go(${JSON.stringify(process.argv[3])},${process.argv[4] || '{}'})`); console.log(JSON.stringify(await text())); console.log('errors:', JSON.stringify(errors)); }
  if (mode === 'one') { await open(+process.argv[3], +process.argv[4], process.argv[5] || '', process.argv[6] || 'light'); if (process.argv[8]) { await ev(process.argv[8]); await sleep(80); } const f = await shot(process.argv[7] || 'one'); console.log(f); }
  console.log(`\n${pass} passed, ${fail} failed`);
} catch (e) { console.log('RUNNER ERROR', e.message); fail++; }
finally { try { edge.kill(); } catch {} process.exit(fail ? 1 : 0); }
