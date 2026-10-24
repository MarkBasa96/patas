// Opens every v4 screen in light and dark (390x844, plus 360x640 light), saves a screenshot of each and lists any
// script error. Usage: node docs/mockups-v4/_check/shots.mjs [screen ...]
import { start, stop, open, shot, errors, ev, OUT, sleep } from './lib.mjs';
const ALL = ['open', 'lock', 'pad', 'qr', 'qrshow', 'qrform', 'home', 'due', 'paid', 'paiddetail', 'debts', 'search', 'debt', 'more', 'remind', 'person', 'logpay', 'add-one', 'add-inst', 'add-rec', 'schedule', 'reports', 'reports6', 'settings', 'cash', 'toast'];
const BOTTOM = new Set(['reports', 'reports6', 'person', 'settings']); // also capture these scrolled to the end (Erina asked)
const list = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
await start();
let n = 0;
for (const s of list) for (const [m, w, h] of [['light', 390, 844], ['dark', 390, 844], ['light', 360, 640]]) {
  await open(`s=${s}&m=${m}&w=${w}`, w, h, m);
  await sleep(350);
  const missing = await ev('!document.querySelector("#phone .app .screen") && !document.querySelector("#phone .gatehost")');
  if (missing) errors.push(`${s} ${m} ${w}: no screen rendered`);
  await shot(`${s}-${m}-${w}`); n++;
  if (BOTTOM.has(s)) { await ev('(()=>{for(const e of document.querySelectorAll("#phone .screen, #phone .modal .dbody")){e.scrollTop=e.scrollHeight;e.dispatchEvent(new Event("scroll"))}return 1})()'); await sleep(150); await shot(`${s}-${m}-${w}-end`); n++; }
}
stop();
console.log(`${n} screenshots in ${OUT}`);
console.log(errors.length ? errors.join('\n') : 'script errors: 0');
process.exitCode = errors.length ? 1 : 0;
