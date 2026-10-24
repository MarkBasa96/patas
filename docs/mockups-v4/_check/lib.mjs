// Tiny headless-Edge driver for the v4 mockups. Fake data only.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PAGE = process.env.PAGE_URL || 'file:///' + path.resolve(HERE, '..', 'index.html').split(path.sep).join('/');
export const OUT = process.env.OUT || path.join(process.env.TEMP, 'patas-v4-shots');
fs.mkdirSync(OUT, { recursive: true });
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9353;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws, id = 0, edge;
export const errors = [];
const pending = new Map();

export async function start() {
  const profile = fs.mkdtempSync(path.join(process.env.TEMP, 'edgeprof-v4-'));
  edge = spawn(EDGE, ['--headless', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', '--disable-gpu', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((r) => (ws.onopen = r));
        ws.onmessage = (m) => {
          const d = JSON.parse(m.data);
          if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
          if (d.method === 'Runtime.exceptionThrown') errors.push('EXCEPTION ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 300));
          if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push('console.error ' + d.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
        };
        await cdp('Runtime.enable'); await cdp('Page.enable');
        return;
      }
    } catch {}
    await sleep(250);
  }
  throw new Error('Edge did not start');
}
export const stop = () => { try { ws.close(); } catch {} try { edge.kill(); } catch {} };
export const cdp = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
export const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('eval: ' + (r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text)); return r.result?.result?.value; };
export async function open(qs = '', w = 390, h = 844, scheme = 'light') {
  await cdp('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: scheme }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
  await cdp('Page.navigate', { url: `${PAGE}?${qs.includes('nobare') ? '' : 'bare=1&'}fresh=1&${qs}` });
  for (let i = 0; i < 80; i++) { await sleep(100); if (await ev('!!window.__m && document.readyState==="complete"')) break; }
  await ev('document.fonts.ready.then(()=>true)'); await sleep(150);
}
export async function shot(name) { const r = await cdp('Page.captureScreenshot', { format: 'png' }); const f = path.join(OUT, name + '.png'); fs.writeFileSync(f, Buffer.from(r.result.data, 'base64')); return f; }
export const click = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NOEL ${sel.replace(/'/g, '')}';e.click();return 'ok'})()`);
export const clickText = (txt, scope = '#phone') => ev(`(()=>{const els=[...document.querySelectorAll(${JSON.stringify(scope)}+' button, '+${JSON.stringify(scope)}+' [data-a]')].filter(e=>e.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(txt)})).sort((a,b)=>a.textContent.length-b.textContent.length);if(!els.length)return 'NOEL ${txt.replace(/'/g, '')}';els[0].click();return 'ok'})()`);
export const text = () => ev('document.querySelector("#phone").innerText');
export const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'NOEL';e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'ok'})()`);
