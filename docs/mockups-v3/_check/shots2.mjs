// Dark mode, other themes, sheets and a desktop view. Usage: node shots2.mjs
import { start, stop, open, shot, ev, click, clickText, setVal, errors, sleep } from './lib.mjs';
await start();
try {
  await open('device=android&look=dark', 390, 844, 'dark'); await shot('dark-01-home');
  await click('[data-a=tab][data-t=debts]'); await shot('dark-02-debts');
  await open('device=iphone&look=dark&route=debt&id=d1', 390, 844, 'dark'); await shot('dark-04-details');
  await open('device=android&look=dark&route=schedule', 390, 844, 'dark'); await shot('dark-05-schedule');
  await open('device=android&look=dark&route=qrdetail&id=q2', 390, 844, 'dark'); await shot('dark-06-qr');
  for (const th of ['ink', 'green', 'lavender', 'teal', 'pink']) { await open(`device=android&theme=${th}`); await shot(`theme-${th}-home`); }
  await open('device=android&theme=teal&look=dark', 390, 844, 'dark'); await shot('theme-teal-dark-home');
  await open('device=android'); await click('[data-a=go][data-r=adddebt]'); await setVal('#f-person', 'Test Lender'); await setVal('#f-label', 'Phone repair'); await setVal('#f-amount', '2500'); await setVal('[data-f=due]', '2026-12-01'); await click('#adsave'); await sleep(80); await shot('sheet-confirm-debt');
  await open('device=android&route=debt&id=d1'); await click('[data-a=debtmenu]'); await sleep(60); await shot('sheet-debt-menu');
  await open('device=iphone&route=qrdetail&id=q1'); await clickText('Share QR'); await sleep(60); await shot('sheet-qr-share');
  await open('device=android&demo=overdue'); await shot('state-overdue-home');
  await open('device=android&demo=empty'); await shot('state-empty-home');
  await open('device=android&demo=long'); await click('[data-a=tab][data-t=debts]'); await shot('state-long-debts');
  await open('device=android&route=settings&look=dark', 390, 844, 'dark'); await shot('dark-07-settings');
  await open('', 1280, 900); await shot('desktop-frame');
} finally { console.log('ERRORS:', errors.length ? errors : 'none'); stop(); }
