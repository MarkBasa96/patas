// Which font actually draws the peso sign? Asks Edge's DevTools for the platform fonts used by a node.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = 'file:///' + path.resolve(HERE, '..', 'index.html').split(path.sep).join('/');
const prof = fs.mkdtempSync(path.join(process.env.TEMP, 'edgeprof-font-'));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless', '--remote-debugging-port=9352', `--user-data-dir=${prof}`, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0;
const pend = new Map();
for (let i = 0; i < 60; i++) {
  try { const l = await (await fetch('http://127.0.0.1:9352/json')).json(); const p = l.find((t) => t.type === 'page'); if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r)); break; } } catch {}
  await sleep(250);
}
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); } };
const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await cdp('Page.enable'); await cdp('DOM.enable'); await cdp('CSS.enable');
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
await cdp('Page.navigate', { url: PAGE + '?bare=1' });
await sleep(4000);
const doc = (await cdp('DOM.getDocument', { depth: -1 })).result.root.nodeId;
for (const [label, sel] of [['big amount (30px 600)', '.hero .t30'], ['small muted line (12px)', '[data-glance=owe] .t12'], ['list amount (15px)', '.row .sb.num']]) {
  const n = (await cdp('DOM.querySelector', { nodeId: doc, selector: sel })).result.nodeId;
  if (!n) { console.log(label, 'no node'); continue; }
  const f = (await cdp('CSS.getPlatformFontsForNode', { nodeId: n })).result.fonts;
  console.log(label.padEnd(26), JSON.stringify(f.map((x) => `${x.familyName} x${x.glyphCount}${x.isCustomFont ? ' (webfont)' : ' (SYSTEM)'}`)));
}
const fonts = (await cdp('Runtime.evaluate', { expression: `[...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family+' '+f.weight+' '+(f.unicodeRange||'').slice(0,70))`, returnByValue: true })).result.result.value;
console.log('loaded faces:', fonts.length);
fonts.slice(0, 14).forEach((f) => console.log('  ', f));
edge.kill();
process.exit(0);
