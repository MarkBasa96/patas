// The erase key on the MPIN pad: no circle, but the same tap area as a digit key; digits keep their circles.
import { start, stop, open, ev, sleep } from './lib.mjs';
await start();
await open('s=pad');
await sleep(200);
const r = await ev(`(()=>{const d=document.querySelector('#phone .key.del'),k=document.querySelector('#phone .key[data-v="1"]');const cd=getComputedStyle(d),ck=getComputedStyle(k);const bd=d.getBoundingClientRect(),bk=k.getBoundingClientRect();return {delBg:cd.backgroundColor,delBorder:cd.borderTopColor,keyBg:ck.backgroundColor,delSize:[Math.round(bd.width),Math.round(bd.height)],keySize:[Math.round(bk.width),Math.round(bk.height)]}})()`);
stop();
const ok = r.delBg === 'rgba(0, 0, 0, 0)' && /rgba\(0, 0, 0, 0\)|transparent/.test(r.delBorder) && r.keyBg !== 'rgba(0, 0, 0, 0)' && r.delSize.join() === r.keySize.join();
console.log(`${ok ? 'PASS' : 'FAIL'} erase key has no circle, digits keep theirs, same tap size ${JSON.stringify(r)}`);
process.exitCode = ok ? 0 : 1;
