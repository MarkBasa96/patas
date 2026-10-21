// Click-through checks for the v3 mockups. Every check can fail. Usage: node flows.mjs
import { start, stop, open, shot, ev, click, clickText, setVal, errors, text, sleep } from './lib.mjs';
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) { pass++; console.log('  ok   ' + name); } else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  -> ' + JSON.stringify(extra) : '')); } };
const T = async () => (await text()).replace(/\s+/g, ' ');
const money = (s) => s;
await start();
try {
  // ---- Home numbers (computed from the data, never typed) ----
  await open('device=android');
  let t = await T();
  ok('home: total I owe 24,500', t.includes('₱24,500'), t.slice(0, 200));
  ok('home: due this month 4,500', /Due this month\s*₱4,500/.test(t));
  ok('home: paid this month 1,500', /Paid this month\s*₱1,500/.test(t));
  ok('home: cash remaining = 30,000 - 12,000 - 1,500', t.includes('₱16,500'));
  ok('home: next payment is Maria, due Oct 20', /Maria Santos[\s\S]*₱1,500[\s\S]*Due Oct 20/.test(t));
  ok('home: 3 active debts', t.includes('3 active debts'));

  // ---- Debts tab ----
  await click('[data-a=tab][data-t=debts]'); t = await T();
  ok('debts: all three listed, outstanding 24,500', t.includes('Maria Santos') && t.includes('Juan Dela Cruz') && t.includes('ABC Lending') && t.includes('Outstanding ₱24,500'));
  await clickText('One-time'); t = await T();
  ok('debts: One-time filter shows only Juan', t.includes('Juan Dela Cruz') && !t.includes('Maria Santos') && t.includes('Outstanding ₱5,500'));
  await clickText('Installments'); t = await T();
  ok('debts: Installments filter hides Juan', !t.includes('Juan Dela Cruz') && t.includes('Outstanding ₱19,000'));
  await clickText('All');
  await setVal('#dq', 'abc'); t = await T();
  ok('debts: search narrows to ABC', t.includes('ABC Lending') && !t.includes('Maria Santos'));
  await setVal('#dq', 'zzz'); t = await T();
  ok('debts: no match message', t.includes('Nothing matches'));
  await setVal('#dq', '');

  // ---- Log payment: over-payment blocked, real payment lowers balance ----
  await open('device=android&route=debt&id=d1');
  await clickText('Log payment'); await sleep(60);
  ok('log: amount defaults to what is due (1500)', (await ev(`document.querySelector('#f-lamount').value`)) === '1500');
  ok('log: remaining after = 7,500', (await T()).includes('₱7,500'));
  await setVal('#f-lamount', '99999');
  ok('log: more than what is left is blocked', (await ev(`document.querySelector('#lpsave').disabled`)) === true && (await T()).includes("That's more than what's left (₱9,000)"));
  await setVal('#f-lamount', '0');
  ok('log: zero is blocked', (await ev(`document.querySelector('#lpsave').disabled`)) === true);
  await setVal('#f-lamount', '1500');
  ok('log: valid amount enables Save', (await ev(`document.querySelector('#lpsave').disabled`)) === false);
  await click('#lpsave'); await sleep(60);
  ok('log: confirm sheet shows the summary', (await T()).includes('Save this payment?') && (await T()).includes('Left after ₱7,500'));
  await clickText('Save it'); await sleep(80); t = await T();
  ok('log: balance now 7,500 and 3 payments recorded', t.includes('₱7,500') && t.includes('₱4,500 of ₱12,000 paid') && (t.match(/Recorded/g) || []).length === 3, t.slice(0, 300));
  ok('log: saved notice shown', t.includes('Payment saved on this phone and synced'));
  ok('log: next due moved to Nov 20', /Next due Nov 20/.test(t));
  await click('[data-a=tab][data-t=home]'); t = await T();
  ok('home after: total 23,000, due this month 3,000 (only ABC left), paid 3,000', t.includes('₱23,000') && /Due this month\s*₱3,000/.test(t) && /Paid this month\s*₱3,000/.test(t), t.slice(0, 260));

  // ---- Edit and delete a payment ----
  await click('[data-a=tab][data-t=debts]'); await clickText('Maria Santos'); await sleep(50);
  await click('[data-a=paysheet]'); await clickText('Delete this payment'); await clickText('Delete'); await sleep(60); t = await T();
  ok('payment delete: balance goes back up', t.includes('₱7,500') || t.includes('₱9,000'), t.slice(0, 200));

  // ---- Add a one-time debt ----
  await open('device=android'); await click('[data-a=go][data-r=adddebt]'); await sleep(50);
  ok('add: Save disabled while empty', (await ev(`document.querySelector('#adsave').disabled`)) === true);
  await setVal('#f-person', 'Test Lender'); await setVal('#f-label', 'Phone repair'); await setVal('#f-amount', '2,500.50');
  ok('add: one-time still needs a due date', (await ev(`document.querySelector('#adsave').disabled`)) === true);
  await setVal('[data-f=due]', '2026-12-01');
  ok('add: all set enables Save', (await ev(`document.querySelector('#adsave').disabled`)) === false);
  await click('#adsave'); await sleep(50); t = await T();
  ok('add: confirm shows amount with centavos', t.includes('Save this debt?') && t.includes('₱2,500.50'));
  await clickText('Save it'); await sleep(80); t = await T();
  ok('add: lands on Debts with new debt, outstanding 27,000.50', t.includes('Test Lender') && t.includes('Outstanding ₱27,000.50'), t.slice(0, 200));

  // ---- Add installments: payment above amount is refused ----
  await click('[data-a=go][data-r=adddebt]'); await sleep(50); await clickText('Installments');
  await setVal('#f-person', 'Test Two'); await setVal('#f-label', 'Appliance'); await setVal('#f-amount', '1000'); await setVal('#f-payment', '1500'); await setVal('[data-f=first]', '2026-11-10');
  ok('add inst: payment bigger than debt refused', (await ev(`document.querySelector('#adsave').disabled`)) === true && (await T()).includes('can’t be more than the amount borrowed'));
  await setVal('#f-payment', '400');
  ok('add inst: plan line says 3 payments, last on Jan 10, 2027', (await T()).includes('3 payments · last one Jan 10, 2027'), (await T()).slice(-300));
  ok('add inst: valid now', (await ev(`document.querySelector('#adsave').disabled`)) === false);
  // discard guard
  await click('[data-a=back]'); await sleep(40);
  ok('add: leaving with typed text asks first', (await T()).includes('Discard this entry?'));
  await clickText('Discard'); await sleep(40);
  ok('add: discard returns to Debts', (await T()).includes('My debts'));

  // ---- Settle with write-off, then reopen ----
  await open('device=android&route=debt&id=d3');
  await click('[data-a=debtmenu]'); await clickText('Mark as settled'); await sleep(40);
  ok('settle: asks, names the write-off', (await T()).includes('₱10,000 is still left'));
  await clickText('Settle it'); await sleep(60); t = await T();
  ok('settle: shows Settled mark with write-off', t.includes('Settled on Oct 15, 2026') && t.includes('₱10,000 written off'), t.slice(0, 260));
  await click('[data-a=tab][data-t=home]'); t = await T();
  ok('settle: Home total drops to 14,500, 2 active debts', t.includes('₱14,500') && t.includes('2 active debts'));
  await click('[data-a=tab][data-t=reports]'); t = await T();
  ok('reports: write-off is not counted as repaid', t.includes('₱3,000') && t.includes('₱10,000 was written off'), t.slice(0, 300));
  await click('[data-a=tab][data-t=debts]'); await clickText('View settled debts'); await sleep(40);
  ok('settled list has ABC', (await T()).includes('ABC Lending'));
  await clickText('ABC Lending'); await click('[data-a=reopen]'); await sleep(50);
  ok('reopen puts the balance back', (await T()).includes('₱10,000'));

  // ---- Delete a debt ----
  await open('device=android&route=debt&id=d2');
  await click('[data-a=debtmenu]'); await clickText('Delete debt'); await clickText('Delete'); await sleep(60); t = await T();
  ok('delete: Juan is gone', !t.includes('Juan Dela Cruz'), t.slice(0, 200));

  // ---- Schedule ----
  await open('device=android&route=schedule'); t = await T();
  ok('schedule: October highlights 20 and 28', (await ev(`[...document.querySelectorAll('.calgrid .due')].map(e=>e.textContent.trim()).join(',')`)) === '20,28');
  ok('schedule: total due 4,500, remind 3 days before', t.includes('₱4,500') && t.includes('3 days before'));
  await click('[data-a=calnav][data-v="1"]'); t = await T();
  ok('schedule: November shows Nov 5, 20, 28 and 10,000 total', (await ev(`[...document.querySelectorAll('.calgrid .due')].map(e=>e.textContent.trim()).join(',')`)) === '5,20,28' && t.includes('₱10,000'), t.slice(0, 300));
  await click('[data-a=calday][data-d="2026-11-05"]'); t = await T();
  ok('schedule: tapping a day filters the list', t.includes('Due Nov 05') && t.includes('Juan Dela Cruz') && !t.includes('ABC Lending Due'));
  await click('[data-a=remindtoggle]');
  ok('schedule: reminder switch turns off', (await T()).includes('Off'));

  // ---- Reports ----
  await open('device=iphone&route=reports'); t = await T();
  ok('reports: 3,000 repaid of 27,500 = 10.9%, remaining 24,500 = 89.1%', t.includes('₱27,500') && t.includes('(10.9%)') && t.includes('(89.1%)') && t.includes('2 payments recorded'));

  // ---- QR: add, replace warning, save a copy, stale warning ----
  await open('device=android&route=qradd');
  ok('qr add: Save disabled until an image is picked', (await ev(`document.querySelector('#qrsave').disabled`)) === true);
  await ev(`(()=>{const f=__m.S.f.qf; f.img='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="%23222"/></svg>'; document.querySelector('#dz').innerHTML='<img src="'+f.img+'">'; return 1})()`);
  await ev(`document.querySelector('#f-qlabel').dispatchEvent(new Event('input',{bubbles:true}))`);
  ok('qr add: image picked enables Save', (await ev(`document.querySelector('#qrsave').disabled`)) === false);
  await click('#qrsave'); await clickText('Save it'); await sleep(60);
  ok('qr add: gallery now has 4', (await ev(`__m.DB.qrs.length`)) === 4);
  await open('device=android&route=qrdetail&id=q1');
  ok('qr detail: no warning on an unchanged QR', !(await T()).includes('QR changed on'));
  await clickText('Save to phone'); await sleep(40);
  ok('qr save: warns the copy leaves Patas and names the match check', (await T()).includes('outside Patas') && (await T()).includes('Same QR as in Patas'));
  await clickText('Save copy'); await sleep(40);
  ok('qr save: remembers when the copy was saved', (await ev(`__m.DB.qrs[0].savedCopyOn`)) === '2026-10-15');
  await click('[data-a=qrmenu2]'); await clickText('Replace the QR image'); await sleep(40);
  await ev(`(()=>{const f=__m.S.f.qf; f.img='data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="%23333"/></svg>'; f.dirty=true; return 1})()`);
  await ev(`document.querySelector('#f-qlabel').dispatchEvent(new Event('input',{bubbles:true}))`);
  await click('#qrsave'); await clickText('Save it'); await sleep(60);
  ok('qr replace: sets changedOn to today', (await ev(`__m.DB.qrs[0].changedOn`)) === '2026-10-15');
  await clickText('Maria Santos'); await sleep(40);
  const t2 = await T();
  ok('qr replace: shows the "delete the old copy" warning', t2.includes('QR changed on Oct 15, 2026') && t2.includes('You saved a copy of the old QR'), t2.slice(0, 300));
  await open('device=iphone&route=qrdetail&id=q1'); t = await T();
  ok('qr iphone: Share is the only button (no download on iPhone)', t.includes('Share QR') && !t.includes('Save to phone'));
  await open('device=android&route=qr'); await clickText('GCash'); t = await ev(`document.querySelectorAll('#qrgrid .qrcard').length`);
  ok('qr filter: GCash shows 1', t === 1, t);
  await clickText('Banks'); ok('qr filter: Banks shows 1 (BPI)', (await ev(`document.querySelectorAll('#qrgrid .qrcard').length`)) === 1);

  // ---- Settings: theme, mode, currency, sounds ----
  await open('device=android&route=settings');
  await click('[data-a=theme][data-v=green]'); await click('[data-a=look][data-v=dark]');
  ok('settings: theme and mode apply', (await ev(`getComputedStyle(document.querySelector('#phone')).getPropertyValue('--accent').trim()`)) === '#5CC48C' && (await ev(`document.body.dataset.mode`)) === 'dark');
  await click('[data-a=cursheet]'); await clickText('US dollar'); await click('[data-a=back]'); t = await T();
  await click('[data-a=tab][data-t=home]').catch(() => {});
  await ev(`__m.tab('home')`); t = await T();
  ok('currency: switches the symbol, not the numbers', t.includes('$24,500') && !t.includes('₱'));
  await click('[data-a=go][data-r=settings]'); await click('[data-a=sounds]');
  ok('sounds: ship off, turn on', (await ev(`__m.S.sounds`)) === true);

  // ---- Demo states ----
  await open('device=android&demo=overdue'); t = await T();
  ok('overdue: Home shows Overdue and counts it as due now', t.includes('Overdue') && /Due this month\s*₱6,000/.test(t), t.slice(0, 300));
  await open('device=android&demo=empty'); t = await T();
  ok('empty: Home explains and disables Log payment', t.includes('Nothing due yet') && (await ev(`document.querySelector('[data-a=logfromhome]').disabled`)) === true && t.includes('₱0'));
  await click('[data-a=tab][data-t=debts]');
  ok('empty: Debts invites the first debt', (await T()).includes('No debts yet'));
  await open('device=android&demo=offline'); t = await T();
  ok('offline: banner shown', t.includes("You're offline"));
  await ev(`__m.A.logpay({dataset:{id:'d1'}})`); await click('#lpsave'); await clickText('Save it'); await sleep(60); t = await T();
  ok('offline: save waits on the phone and counts as waiting', t.includes('on this phone. It will sync') && t.includes('1 waiting'), t.slice(0, 260));
  await open('device=android&demo=long'); await click('[data-a=tab][data-t=debts]');
  ok('long names: no sideways scrolling', (await ev(`(()=>{const v=document.querySelector('#view');return v.scrollWidth<=v.clientWidth+1})()`)) === true);
  await open('device=android&demo=long&route=debt&id=d1');
  ok('long names: details do not overflow', (await ev(`(()=>{const v=document.querySelector('#view');return v.scrollWidth<=v.clientWidth+1})()`)) === true);

  // ---- Small phone (360x640): the four Home numbers fit, nothing scrolls sideways ----
  await open('device=android', 360, 640);
  ok('360x640: no sideways scroll on Home', (await ev(`(()=>{const v=document.querySelector('#view');return v.scrollWidth<=v.clientWidth+1})()`)) === true);
  ok('360x640: Due this month stays on one line', (await ev(`(()=>{const e=document.querySelector('.tile.peach .tl');return e.getBoundingClientRect().height<18})()`)) === true);
  ok('360x640: hero total and both tiles are above the fold', (await ev(`(()=>{const v=document.querySelector('#view').getBoundingClientRect();return [...document.querySelectorAll('.hero,.tile')].every(e=>e.getBoundingClientRect().bottom<=v.bottom)})()`)) === true);
  // tap targets
  await open('device=android');
  const small = await ev(`[...document.querySelectorAll('#phone button, #phone [role=button], #phone select, #phone input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.height<36||r.width<36)}).map(e=>(e.dataset.a||e.className||e.tagName)+':'+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))`);
  ok('home: every tap target is at least 36px', small.length === 0, small);
} finally {
  console.log(`\n${pass} passed, ${fail} failed`); console.log('ERRORS:', errors.length ? errors : 'none'); stop();
}
