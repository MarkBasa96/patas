// Takes the six board screens (android + iphone) and prints page errors. Usage: node shots.mjs
import { start, stop, open, shot, ev, click, clickText, errors, text, sleep } from './lib.mjs';
await start();
try {
  for (const dev of ['android', 'iphone']) {
    await open(`device=${dev}`);
    await shot(`${dev}-01-home`);
    await click('[data-a=tab][data-t=debts]'); await sleep(80); await shot(`${dev}-02-debts`);
    await ev(`__m.go('adddebt',{})`); await sleep(80); await shot(`${dev}-03a-add-onetime`);
    await ev(`__m.A.adtype({dataset:{v:'inst'}})`); await sleep(80); await shot(`${dev}-03b-add-inst`);
    await open(`device=${dev}&route=debt&id=d1`); await shot(`${dev}-04a-details`);
    await open(`device=${dev}&route=logpay&id=d1`); await shot(`${dev}-04b-logpay`);
    await open(`device=${dev}&route=schedule`); await shot(`${dev}-05a-schedule`);
    await open(`device=${dev}&route=reports`); await shot(`${dev}-05b-reports`);
    await open(`device=${dev}&route=qr`); await shot(`${dev}-06a-qr-gallery`);
    await open(`device=${dev}&route=qrdetail&id=q1`); await shot(`${dev}-06b-qr-detail`);
    await open(`device=${dev}&route=qradd`); await shot(`${dev}-06c-qr-add`);
    await open(`device=${dev}&route=settings`); await shot(`${dev}-07-settings`);
  }
} finally { console.log('ERRORS:', errors.length ? errors : 'none'); stop(); }
