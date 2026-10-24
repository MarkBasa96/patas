// The phone fit: opened without ?bare on a phone-sized screen, the app must fill the viewport exactly.
import { start, stop, open, ev, shot, errors, sleep } from './lib.mjs';
let fail = 0;
const T = (ok, name, got) => { if (!ok) fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok ? '  -> ' + JSON.stringify(got) : ''}`); };
await start();
for (const [w, h, label] of [[390, 844, 'iPhone 390x844'], [360, 780, 'Android 360x780'], [430, 932, 'iPhone Pro Max 430x932']]) {
  for (const s of ['home', 'reports', 'debt', 'logpay']) {
    await open(`nobare&s=${s}`, w, h);
    await sleep(200);
    const r = await ev(`(()=>{const p=document.querySelector('#phone').getBoundingClientRect();return {fit:document.documentElement.classList.contains('fit'),x:p.x,y:p.y,w:p.width,h:p.height,vw:innerWidth,vh:innerHeight,doc:document.documentElement.scrollHeight,docW:document.documentElement.scrollWidth,status:getComputedStyle(document.querySelector('#phone .status')).display,fab:!!document.querySelector('#mockfab'),bar:getComputedStyle(document.querySelector('#bar')).display}})()`);
    T(r.fit && r.x === 0 && r.y === 0 && r.w === r.vw && r.h === r.vh && r.doc <= r.vh && r.docW <= r.vw && r.status === 'none' && r.fab && r.bar === 'none', `${label} ${s}: app fills the screen edge to edge, no page scroll, controls hidden`, r);
    if (s === 'home') await shot(`fit-${w}x${h}`);
  }
}
// control: on a laptop-sized window the framed phone stays (so the check above can fail)
await open('nobare&s=home', 1280, 900);
const d = await ev('document.documentElement.classList.contains("fit")');
T(d === false, 'CONTROL: a 1280px window keeps the framed phone (fit off)', d);
T(errors.length === 0, `script errors: ${errors.length}`, errors);
stop();
console.log(fail ? `${fail} failed` : 'all fit checks passed');
process.exitCode = fail ? 1 : 0;
