// Round 4 mockup checks, raw output for the report. Every check has a value it must hit exactly, and a control
// proves the checker can fail. Usage: node docs/mockups-v4/_check/flows.mjs
import zlib from 'node:zlib';
import { start, stop, open, cdp, ev, click, clickText, text, setVal, sleep, errors } from './lib.mjs';

let pass = 0, fail = 0;
const T = (ok, name, got) => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && got !== undefined ? '  -> got: ' + JSON.stringify(got).slice(0, 300) : ''}`); };
const has = (t, s) => t.includes(s);
const layerText = () => ev('document.querySelector("#phone .layer").innerText');
const appText = () => ev('document.querySelector("#phone .app").innerText');
const key = (k) => ev(`(()=>{const e=document.activeElement;e.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(k)},bubbles:true}));return 'ok'})()`);
const toastText = () => ev('(document.querySelector("#phone .toast")||{}).innerText||""');

await start();

// ---------- 1. Home numbers ----------
console.log('== 1. Home: the summary, top to bottom (Erina §7, owner item 19) ==');
await open('s=home');
let t = await appText();
T(has(t, '₱24,806.00') && has(t, '7 active debts'), 'Total I owe ₱24,806.00 · 7 active debts', t.slice(0, 200));
T(has(t, '₱15,555.50') && has(t, '₱8,158.00 left\n₱7,397.50 paid'), 'Due this month ₱15,555.50: ₱8,158.00 left, ₱7,397.50 paid', t.slice(0, 300));
T(has(t, '₱7,397.50') && has(t, '4 payments'), 'Paid this month ₱7,397.50 · 4 payments');
T(has(t, 'Overdue · 1 debt · ₱3,562.50'), 'Overdue strip: 1 debt · ₱3,562.50');
T(has(t, '₱19,959.65'), 'Cash remaining ₱19,959.65 (43,217.40 − 15,860.25 − 7,397.50)');
T(!has(t, 'Next payment') && !has(t, 'Hi there'), 'no "Next payment" section and no "Hi there"');
await open('s=home&od=0');
t = await appText();
T(!has(t, 'Overdue'), 'no overdue: the strip disappears entirely (never "0 overdue")');

// ---------- 2. Due this month popup ----------
console.log('== 2. Due this month popup ==');
await open('s=home');
await click('[data-a="due"]'); await sleep(300);
t = await layerText();
T(has(t, 'Due this month') && has(t, '₱15,555.50') && has(t, 'Late fee'), 'popup opens with the total and labels the late fee', t.slice(0, 300));
const firstRow = await ev('[...document.querySelectorAll("#phone .modal .li .t-row.ell")].map(e=>e.innerText).slice(0,2).join("|")');
T(firstRow === 'Office credit coop|Office credit coop', 'overdue rows come first', firstRow);
await clickText('Tita Merly', '#phone .modal'); await sleep(350);
T(await ev('document.querySelector("#phone .screen").dataset.scr') === 'debt' && has(await appText(), 'Emergency loan'), 'tapping a row closes the popup and opens that debt');

// ---------- 3. Paid this month: detail, delete ----------
console.log('== 3. Paid this month: payment detail, then delete it ==');
await open('s=home');
await click('[data-a="paid"]'); await sleep(300);
await click('#phone .modal [data-a="paydetail"]'); await sleep(300);
t = await layerText();
T(has(t, 'What it paid') && has(t, '₱1,247.50') && has(t, '#4 · Oct 28') && has(t, 'Edit payment'), 'tapping a payment pushes its detail inside the same popup', t.slice(0, 200));
T(await ev('document.querySelectorAll("#phone .modal").length') === 1, 'one popup layer only (no stacked popup)');
await click('#phone .modal [data-a="delpay"]'); await sleep(300);
await click('#phone [data-ok]'); await sleep(400);
t = await appText();
T(has(t, '₱6,150.00') && has(t, '₱26,053.50'), 'after delete: Paid this month ₱6,150.00 and Total I owe back up to ₱26,053.50', t.slice(0, 260));
T((await toastText()).includes('Payment deleted'), 'toast says "Payment deleted"');

// ---------- 4. Pay several installments ----------
console.log('== 4. Log payment: ticks run from the oldest ==');
await open('s=logpay');
const sel = async () => ev('document.querySelector("#phone .paybar").innerText.replace(/\\s+/g," ")');
T((await sel()).includes('3 selected ₱2,536.50'), 'starts with 3 ticked: ₱2,536.50', await sel());
T(await ev('document.querySelectorAll("#phone .tick").length') === 6 && has(await appText(), 'Show 1 more month'), 'shows the ticked months plus the next 3, then "Show 1 more month"');
await click('#phone [data-a="tick"][data-i="5"]');
T((await sel()).includes('6 selected ₱5,073.00'), 'ticking the 6th ticks every older one: ₱5,073.00', await sel());
await click('#phone [data-a="tick"][data-i="2"]');
T((await sel()).includes('2 selected ₱1,691.00'), 'unticking the 3rd unticks it and every newer one: 2 selected', await sel());
const onRows = await ev('[...document.querySelectorAll("#phone .tick")].map(e=>e.classList.contains("on")?1:0).join("")');
T(onRows === '11000', 'the ticked rows are one block starting at the oldest', onRows);
await click('#phone [data-a="tickall"]');
T((await sel()).includes('7 selected ₱5,918.50') && await ev('document.querySelectorAll("#phone .tick.on").length') === 7, 'Select all ticks every month, hidden ones too: ₱5,918.50 = the whole remaining balance', await sel());
await click('#phone [data-a="savepay"]'); await sleep(300);
T(has(await layerText(), 'Log ₱5,918.50 to Dental clinic?'), 'asks before saving (approved behaviour kept)');
await click('#phone [data-ok]'); await sleep(400);
t = await appText();
T(has(t, 'Settled') && has(t, '₱0.00'), 'the debt is paid in full and shows Settled', t.slice(0, 200));
T((await toastText()).includes('Patas na'), 'toast celebrates quietly: "Paid in full. Patas na…"', await toastText());
await click('#phone [data-a="back"]'); await sleep(100);
await click('#phone [data-a="tab"][data-tab="home"]'); await sleep(200);
t = await appText();
T(has(t, '₱18,887.50') && has(t, '6 active debts'), 'Home: Total I owe dropped by ₱5,918.50 to ₱18,887.50; 6 active', t.slice(0, 200));

// ---------- 5. Add debt for an existing person (any case) ----------
console.log('== 5. Add an installment debt for a person who already exists ==');
await open('s=add-one');
await click('#phone [data-a="seg"][data-name="kind"][data-v="installments"]');
await setVal('#phone [data-f="add.person"]', 'dental clinic');
T(has(await appText(), 'Goes under Dental clinic’s history'), 'typing an existing name in another case says it joins that person');
await setVal('#phone [data-f="add.title"]', 'Retainer');
await setVal('#phone [data-f="add.total"]', '5,000.00');
await setVal('#phone [data-f="add.count"]', '6');
await setVal('#phone [data-f="add.start"]', '2026-10-28');
t = await appText();
T(has(t, 'Last payment ₱833.35') && has(t, 'Ends Mar 28, 2027'), '6 × ₱833.33 with the last ₱833.35; ends Mar 28, 2027', t.slice(-500));
await click('#phone [data-a="savedebt"]'); await sleep(400);
t = await appText();
T(has(t, 'Dental clinic') && has(t, '₱5,000.00') && has(t, 'Retainer'), 'saved and opened: Dental clinic · Retainer · ₱5,000.00 remaining');
T((await toastText()).includes('Debt added'), 'toast "Debt added"');
await click('#phone [data-a="person"]'); await sleep(300);
T(has(await appText(), '2 debts'), 'the person page now lists 2 debts under one Dental clinic', (await appText()).slice(0, 120));

// ---------- 6. Recurring ----------
console.log('== 6. Add a recurring debt ==');
await open('s=add-rec');
await click('#phone [data-a="savedebt"]'); await sleep(400);
t = await appText();
T(has(t, '₱650.00') && has(t, 'every month') && !has(t, 'remaining'), 'recurring shows "₱650.00 every month", no "remaining"', t.slice(0, 200));

// ---------- 7. Search + dropdown ----------
console.log('== 7. My debts: search that is also a dropdown ==');
await open('s=debts');
await click('#phone [data-a="ddtoggle"]'); await sleep(150);
T(has(await ev('document.querySelector("#ddhost").innerText'), 'All people (6)'), 'the arrow opens the full list without typing');
await setVal('#phone [data-f="q"]', 'lend'); await sleep(150);
t = await ev('document.querySelector("#ddhost").innerText');
T(has(t, 'Online lending app') && has(t, 'Phone, 128GB') && has(t, 'Laptop'), 'typing "lend" suggests the person and both debts', t);
T(await ev('document.querySelectorAll("#ddhost b").length') >= 3, 'the matched letters are bold');
await ev('document.querySelector("#phone [data-f=q]").focus()'); await key('Enter'); await sleep(200);
T(await ev('document.querySelectorAll("#phone .list .li").length') === 2, 'Enter closes the panel and filters the list to the 2 Online lending app debts');

// ---------- 8. Reminder per debt ----------
console.log('== 8. Reminder sheet ==');
await open('s=remind');
t = await layerText();
T(has(t, '2 reminders: Nov 25 and Nov 28 at 9:00 AM'), 'summary names the real dates', t.slice(0, 300));
await click('#phone .modal [data-a="remoff"][data-v="1"]'); await sleep(100);
T(has(await layerText(), '3 reminders: Nov 25, Nov 27 and Nov 28'), 'switching on "1 day before" adds Nov 27');
await click('#phone .modal [data-a="remtime"][data-v="18:00"]');
await click('#phone .modal [data-a="saverem"]'); await sleep(400);
T(has(await appText(), 'Nov 25, Nov 27 and Nov 28 at 6:00 PM'), 'the debt shows its new reminders');

// ---------- 9. Cash flow ----------
console.log('== 9. Monthly cash flow ==');
await open('s=home');
await click('#phone [data-a="cash"]'); await sleep(350);
await setVal('#phone [data-f="cash.income"]', '50000');
await click('#phone [data-a="savecash"]'); await sleep(400);
T(has(await appText(), '₱26,742.25'), 'income ₱50,000.00 makes Cash remaining ₱26,742.25');

// ---------- 10. Settings: theme, name ----------
console.log('== 10. Settings sheet: appearance and name ==');
await open('s=settings');
await click('#phone [data-a="seg"][data-name="appearance"][data-v="dark"]'); await sleep(700);
T(await ev('document.querySelector("#phone").dataset.mode') === 'dark' && await ev('getComputedStyle(document.querySelector("#phone .app")).backgroundColor') === 'rgb(18, 17, 26)', 'Dark switches the whole app to #12111A');
T(!(await toastText()), 'no toast after a theme change (the reveal is the confirmation)');
await click('#phone [data-a="setview"][data-v="profile"]'); await sleep(300);
await setVal('#phone [data-f="prof.name"]', 'Sam Reyes');
await click('#phone [data-a="saveprof"]'); await sleep(300);
T(/Good (morning|afternoon|evening), Sam\b/.test(await appText()), 'Home greets by first name');
await click('#phone [data-a="setview"][data-v="profile"]'); await sleep(300);
await setVal('#phone [data-f="prof.name"]', '');
await click('#phone [data-a="saveprof"]'); await sleep(300);
t = await appText();
T(/Good (morning|afternoon|evening)\n/.test(t) && !has(t, 'Hi there'), 'no name: just "Good evening", never "Hi there"', t.slice(0, 80));

// ---------- 11. count-up with motion on ----------
console.log('== 11. Count-up (motion on) ==');
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
await cdp('Page.navigate', { url: (await ev('location.href')).replace(/s=[^&]*/, 's=home').replace(/bare=1&/, 'bare=1&') });
for (let i = 0; i < 60; i++) { await sleep(50); if (await ev('!!window.__m')) break; }
const heroNow = () => ev('document.querySelector("#phone .hero .t-hero").textContent');
const early = await heroNow(); await sleep(900); const late = await heroNow();
T(early !== '₱24,806.00' && late === '₱24,806.00', 'Total I owe counts up on open, and lands on ₱24,806.00', [early, late]);
await click('#phone [data-a="tab"][data-tab="debts"]'); await sleep(100);
await click('#phone [data-a="tab"][data-tab="home"]'); await sleep(30);
T(await heroNow() === '₱24,806.00', 'coming back to Home does not count again');
const w1 = await ev('document.querySelector("#phone .hero .t-hero").style.minWidth');
T(!!w1, 'the number sits in a box sized to its final value (no jitter)', w1);
await cdp('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

// ---------- 10b. profile photo ----------
console.log('== 10b. Profile photo: add, shows everywhere, remove ==');
await open('s=settings');
await click('#phone [data-a="setview"][data-v="profile"]'); await sleep(300);
{
  const doc = await cdp('DOM.getDocument', {});
  const q = await cdp('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#photoin' });
  const pic = new URL('../../../app/assets/brand/patas-logo.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  await cdp('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [decodeURIComponent(pic)] });
  await sleep(600);
}
const ph = await ev('(()=>{const a=document.querySelector("#phone .app .avatarbtn img");const p=document.querySelector("#phone .modal label.av img");return {header:!!a&&a.src.startsWith("data:image/jpeg"),profile:!!p,w:p?p.naturalWidth:0}})()');
T(ph.header && ph.profile && ph.w === 256, 'a chosen photo is cropped square (256px) and shows in the profile and the header avatar', ph);
T((await toastText()).includes('Photo saved'), 'toast "Photo saved"');
await click('#phone .modal [data-a="photodel"]'); await sleep(300);
T(await ev('!document.querySelector("#phone .app .avatarbtn img")'), 'Remove puts the initials back');

// ---------- 10c. a photo for each person owed ----------
console.log('== 10c. Photo for a person you owe ==');
await open('s=person');
{
  const doc = await cdp('DOM.getDocument', {});
  const q = await cdp('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#pphoto' });
  const pic = new URL('../../../app/assets/brand/patas-logo.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  await cdp('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [decodeURIComponent(pic)] });
  await sleep(600);
}
T(await ev('!!document.querySelector("#phone label.avedit img")') && (await toastText()).includes('Photo saved'), 'tapping a person’s avatar adds their photo (toast "Photo saved")');
await click('#phone [data-a="back"]').catch(() => {});
await open('s=person'); // a fresh open keeps nothing: photos live in the page for the mockup
await click('#phone [data-a="tab"]').catch(() => {});
{
  await open('s=debts');
  await click('#phone .li[data-id="d1"]'); await sleep(200);
  const doc = await cdp('DOM.getDocument', {});
  const q = await cdp('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#dphoto' });
  const pic = new URL('../../../app/assets/brand/patas-logo.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  await cdp('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [decodeURIComponent(pic)] });
  await sleep(600);
  await click('#phone [data-a="back"]'); await sleep(200);
}
const photoRows = await ev('[...document.querySelectorAll("#phone .list .li")].filter(r=>r.querySelector(".av img")).map(r=>r.querySelector(".t-row").textContent)');
T(photoRows.length === 2 && photoRows.every((n) => n === 'Tita Merly'), 'set from one debt, the photo shows on every debt with that person (2 rows), nobody else', photoRows);
await clickText('Due this month', '#phone .app').catch(() => {});
await click('#phone [data-a="tab"][data-tab="home"]'); await sleep(150);
await click('#phone [data-a="due"]'); await sleep(300);
T(await ev('[...document.querySelectorAll("#phone .modal .li")].some(r=>r.querySelector(".av img") && r.innerText.includes("Tita Merly"))'), 'and in the Due this month popup');
await ev('document.querySelector("#phone .modal [data-close]").click()'); await sleep(250);
await click('#phone [data-a="tab"][data-tab="debts"]'); await sleep(150);
await click('#phone .li[data-id="d1"]'); await sleep(150);
await click('#phone [data-a="person"]'); await sleep(200);
await click('#phone [data-a="pphotodel"]'); await sleep(200);
T(await ev('!document.querySelector("#phone label.avedit img")') && (await toastText()).includes('Photo removed'), 'Remove photo puts the initials back');

// ---------- 11b. Joe's v2 feedback: Home fills the screen, chips wrap, currencies, calendar ----------
console.log('== 11b. Home fills any screen; chips wrap; currencies; calendar ==');
for (const [w, h, od] of [[390, 844, 1], [360, 640, 1], [430, 932, 0]]) {
  await open(`s=home&w=${w}${od ? '' : '&od=0'}`, w, h);
  const f = await ev(`(()=>{const s=document.querySelector('#phone .screen');const cash=s.querySelector('.cashcard').getBoundingClientRect();const tab=document.querySelector('#phone .tabbar').getBoundingClientRect();return {scroll:s.scrollHeight-s.clientHeight,gap:Math.round(tab.top-cash.bottom),k:s.querySelector('.homefit').style.getPropertyValue('--hk')}})()`);
  T(f.scroll <= 1 && f.gap >= 0 && f.gap <= 36, `Home ${w}x${h}${od ? '' : ' (no overdue)'}: fits with no scrolling and no empty band above the tabs`, f);
}
await open('s=debts&w=360', 360, 640);
const chipRows = await ev('(()=>{const r=document.querySelector("#phone .wrapchips");const ys=new Set([...r.children].map(c=>Math.round(c.getBoundingClientRect().top)));const out=[...r.children].some(c=>c.getBoundingClientRect().right>r.getBoundingClientRect().right+1);return {rows:ys.size,out}})()');
T(chipRows.rows === 2 && !chipRows.out, 'Debts at 360: filter chips wrap onto 2 rows, none runs past the edge', chipRows);
await open('s=settings');
await click('#phone [data-a="setview"][data-v="currency"]'); await sleep(300);
T(await ev('document.querySelectorAll("#phone .modal [data-a=setcur]").length') === 21, 'Currency lists 21 currencies');
await setVal('#phone .modal [data-f="curq"]', 'dol'); await sleep(100);
T(await ev('document.querySelectorAll("#phone .modal [data-a=setcur]").length') === 7, 'searching "dol" leaves the 7 dollars');
await click('#phone .modal [data-a="setcur"][data-v="USD"]'); await sleep(300);
await ev('document.querySelector("#phone .modal [data-close]").click()'); await sleep(300);
T(has(await appText(), '≈ $426.81'), 'Show amounts in US dollar: Total I owe ≈ $426.81 (₱24,806.00 ÷ 58.12)', (await appText()).slice(0, 160));
await open('s=add-one');
await click('#phone [data-a="pickcur"]'); await sleep(300);
await click('#phone .modal [data-a="setdebtcur"][data-v="USD"]'); await sleep(300);
await setVal('#phone [data-f="add.person"]', 'Cousin abroad');
await setVal('#phone [data-f="add.amount"]', '120');
await click('#phone [data-a="savedebt"]'); await sleep(400);
t = await appText();
T(has(t, '$120.00') && has(t, '≈ ₱6,974.40'), 'a debt typed in dollars stays $120.00, with ≈ ₱6,974.40 beside it', t.slice(0, 220));
await click('#phone [data-a="back"]'); await sleep(100); await click('#phone [data-a="tab"][data-tab="home"]'); await sleep(200);
T(has(await appText(), '₱31,780.40'), 'Total I owe adds it in pesos: ₱24,806.00 + ₱6,974.40 = ₱31,780.40');
await open('s=schedule');
t = await appText();
T(has(t, 'October 2026') && has(t, '₱8,158.00 left'), 'calendar month header: October 2026 · ₱8,158.00 left');
T(await ev('!!document.querySelector("#phone .cday[data-v=\\"2026-10-10\\"] .dot.over") && !!document.querySelector("#phone .cday[data-v=\\"2026-10-15\\"] .dot.paid") && !!document.querySelector("#phone .cday[data-v=\\"2026-10-30\\"] .dot.up") && !document.querySelector("#phone .cday[data-v=\\"2026-10-11\\"] .dot")'), 'dots: Oct 10 overdue, Oct 15 paid, Oct 30 coming up, Oct 11 nothing');
await click('#phone .cday[data-v="2026-10-30"]'); await sleep(150);
T(await ev('document.querySelectorAll("#phone .list .li").length') === 1 && has(await appText(), 'Dental clinic'), 'tapping Oct 30 lists just that day: Dental clinic');
await click('#phone [data-a="calnav"][data-v="1"]'); await sleep(150);
T(has(await appText(), 'November 2026') && has(await appText(), '₱5,973.00 left'), 'next month: November 2026 · ₱5,973.00 left');
await open('s=reports');
await click('#phone [data-a="periodopen"]'); await sleep(100);
await click('#phone [data-a="period"][data-v="6m"]'); await sleep(200);
T(has(await appText(), '6 months') && !(await ev('!!document.querySelector("#phone .dd")')), 'Reports period is a dropdown: picking 6 months closes it and applies');

// ---------- 11c. payment QR per person, and the opening (loading -> MPIN) ----------
console.log('== 11c. Payment QR codes; opening screens ==');
await open('s=debt');
t = await appText();
T(has(t, 'Pay with QR'), 'Debt details for a person with a QR: "Pay with QR" beside Log payment');
await click('#phone .pinned [data-a="qrshow"]'); await sleep(250);
t = await appText();
T(has(t, 'Online lending app') && has(t, 'Next due Nov 28 · ₱1,247.50') && has(t, 'Save or share'), 'Show QR: who to pay, the next amount due, Save or share', t.slice(0, 260));
T(await ev('getComputedStyle(document.querySelector("#phone .qrcard")).backgroundColor') === 'rgb(255, 255, 255)', 'the QR card is always white (approved rule)');
await open('s=settings');
T(has(await layerText(), 'Payment QR codes'), 'Settings lists every saved QR under Paying');
await open('s=debts');
await click('#phone [data-a="qrgallery"]'); await sleep(250);
t = await appText();
T(has(t, 'Tita Merly') && has(t, 'Dental clinic') && has(t, 'No QR yet') && has(t, 'Office credit coop'), 'My debts has a QR button; the gallery lists 3 QRs and who still has none', t.slice(0, 300));
await clickText('Office credit coop', '#phone .app'); await sleep(250);
{
  const doc = await cdp('DOM.getDocument', {});
  const q = await cdp('DOM.querySelector', { nodeId: doc.result.root.nodeId, selector: '#qrin' });
  const pic = new URL('../../../app/assets/brand/patas-mono.png', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
  await cdp('DOM.setFileInputFiles', { nodeId: q.result.nodeId, files: [decodeURIComponent(pic)] });
  await sleep(500);
}
await click('#phone [data-a="qrsavedone"]'); await sleep(250);
await click('#phone [data-ok]'); await sleep(400);
t = await appText();
T(has(t, 'Office credit coop') && await ev('!!document.querySelector("#phone .qrbig img")') && (await toastText()).includes('QR saved'), 'adding a QR for a person shows their chosen picture, toast "QR saved"');
await open('s=person');
await click('#phone [data-a="add"]'); await sleep(250);
await setVal('#phone [data-f="add.amount"]', '500');
await click('#phone [data-a="savedebt"]'); await sleep(400);
T((await toastText()).includes('uses Tita Merly’s QR') && has(await appText(), 'Pay with QR'), 'a new debt for a person with a QR uses it at once ("Debt added · uses Tita Merly’s QR")', await toastText());
await open('s=open');
T(await ev('!!document.querySelector("#phone .gate.loading")'), 'opening: the white loading screen comes first');
await sleep(700);
T(await ev('!!document.querySelector("#phone .gate.brand .mpincard")'), 'then the violet MPIN login with the MPIN card');
await click('#phone [data-a="gpad"]'); await sleep(100);
for (const k of '1111') await click(`#phone [data-a="gkey"][data-v="${k}"]`);
await sleep(300);
T(has(await ev('document.querySelector("#phone .gatehost").innerText'), 'Wrong MPIN. 4 tries left.'), 'a wrong MPIN shakes and says "4 tries left" (same rule as today)');
for (const k of '2580') await click(`#phone [data-a="gkey"][data-v="${k}"]`);
await sleep(500);
T(await ev('!document.querySelector("#phone .gatehost")') && has(await appText(), 'Total I owe'), 'the right MPIN opens Home');

// ---------- 11d. "Other…" lets you name it, and keeps the name ----------
console.log('== 11d. Other with your own name ==');
await open('s=logpay');
const addOther = async (name) => {
  await click('#phone [data-a="nameother"][data-kind="method"]'); await sleep(80);
  await setVal('#phone [data-f="other.text"]', name);
  await ev('document.querySelector("#phone [data-f=\\"other.text\\"]").focus()'); await key('Enter'); await sleep(120);
};
await addOther('Palawan');
const pressedNow = () => ev('[...document.querySelectorAll("#phone [data-a=pickname][data-kind=method]")].filter(b=>b.getAttribute("aria-pressed")==="true").map(b=>b.textContent).join("|")');
T(await pressedNow() === 'Palawan', 'Other… → type "Palawan" → it is picked as the method', await pressedNow());
await click('#phone [data-a="back"]'); await sleep(100);
await click('#phone [data-a="logpay"]'); await sleep(200);
T(await ev('[...document.querySelectorAll("#phone [data-a=pickname]")].some(b=>b.textContent==="Palawan")'), 'next time "Palawan" is a chip of its own');
await addOther('palawan');
T(await ev('[...document.querySelectorAll("#phone [data-a=pickname]")].filter(b=>b.textContent.toLowerCase()==="palawan").length') === 1, 'typing it again in another case picks the same one, no duplicate');
await addOther('UnionBank'); await addOther('BPI');
T(await ev('!!document.querySelector("#phone [data-a=namemore]")') && await ev('document.querySelectorAll("#phone [data-a=pickname][data-kind=method]").length') <= 6, 'past 6 names the rest move into "More…"');

// ---------- 12. tap targets, overflow, script errors ----------
console.log('== 12. Every tap target ≥ 44px; nothing wider than the phone ==');
const SCREENS = ['home', 'due', 'paid', 'paiddetail', 'debts', 'search', 'debt', 'more', 'remind', 'person', 'logpay', 'add-one', 'add-inst', 'add-rec', 'schedule', 'reports', 'settings', 'cash', 'qr', 'qrshow', 'qrform', 'lock', 'pad'];
const small = [], wide = [];
for (const w of [390, 360]) for (const s of SCREENS) {
  await open(`s=${s}&w=${w}`, w, w === 390 ? 844 : 640);
  const r = await ev(`(()=>{const P=document.querySelector('#phone').getBoundingClientRect();const out=[];for(const e of document.querySelectorAll('#phone button, #phone input, #phone summary, #phone [data-a]')){const b=e.getBoundingClientRect();if(!b.width||!b.height)continue;if(b.bottom<P.top||b.top>P.bottom)continue;const cs=getComputedStyle(e);if(cs.visibility==='hidden')continue;if(e.closest('details:not([open])')&&e.tagName!=='SUMMARY')continue;const tag=e.tagName==='INPUT'?e.closest('.inp')||e:e;const bb=tag.getBoundingClientRect();if(bb.width<44||bb.height<44)out.push((e.dataset.a||e.tagName)+' '+Math.round(bb.width)+'x'+Math.round(bb.height)+' '+(e.innerText||e.getAttribute('aria-label')||'').slice(0,18))}const sc=document.querySelector('#phone .screen');return {small:out,over:sc.scrollWidth>sc.clientWidth+1}})()`);
  r.small.forEach((x) => small.push(`${s}@${w}: ${x}`));
  if (r.over) wide.push(`${s}@${w}`);
}
T(small.length === 0, `tap targets under 44px: ${small.length}`, small.slice(0, 12));
T(wide.length === 0, `screens wider than the phone: ${wide.length}`, wide);

// ---------- 13. contrast over the rendered glass ----------
console.log('== 13. Text contrast over the hero mesh and glass cards, measured from rendered pixels (text hidden) ==');
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
  return { w, h, px: (x, y) => { const i = y * stride + x * bpp; return [out[i], out[i + 1], out[i + 2]]; } };
}
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
let worstAll = 99, worstAllT = '';
for (const th of ['indigo', 'ink', 'green', 'lavender', 'teal', 'pink']) for (const m of ['light', 'dark']) {
  for (const [s, scope] of [['home', '.hero, .tiles .gcard, .app .gcard'], ['reports', '.app .gcard'], ['toast', '.toast'], ['lock', '.gate .gin'], ['pad', '.gate .gin']]) {
    await open(`s=${s}&t=${th}&m=${m}`, 390, 844, m);
    if (s === 'toast') await sleep(300);
    const spans = await ev(`(()=>{const out=[];for(const root of document.querySelectorAll(${JSON.stringify(scope)})){const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(!n.textContent.trim())continue;const el=n.parentElement;if(el.closest('.remain'))continue;const cs=getComputedStyle(el);const rg=document.createRange();rg.selectNodeContents(n);for(const r of rg.getClientRects()){if(r.width<2||r.height<2)continue;out.push({x:r.x,y:r.y,w:r.width,h:r.height,color:cs.color,size:parseFloat(cs.fontSize),weight:+cs.fontWeight,t:n.textContent.trim().slice(0,20)})}}}return out})()`);
    await ev(`(()=>{const s=document.createElement('style');s.textContent=${JSON.stringify(scope.split(',').map((x) => x.trim() + ' *').join(',') + '{color:transparent!important} ' + scope.split(',').map((x) => x.trim() + ' svg').join(',') + '{opacity:0!important} .tbar{opacity:0!important}')};document.head.appendChild(s)})()`);
    await sleep(80);
    const png = decodePng(Buffer.from((await cdp('Page.captureScreenshot', { format: 'png' })).result.data, 'base64'));
    let worst = 99, worstT = '';
    for (const sp of spans) {
      const fg = sp.color.match(/[\d.]+/g).map(Number).slice(0, 3);
      const need = sp.size >= 24 || (sp.size >= 18.66 && sp.weight >= 700) ? 3 : 4.5;
      let min = 99;
      for (let y = Math.max(0, Math.floor(sp.y)); y < Math.min(png.h, Math.ceil(sp.y + sp.h)); y += 2) for (let x = Math.max(0, Math.floor(sp.x)); x < Math.min(png.w, Math.ceil(sp.x + sp.w)); x += 2) min = Math.min(min, ratio(fg, png.px(x, y)));
      if (min - need < worst) { worst = min - need; worstT = `"${sp.t}" ${sp.size}px ${min.toFixed(2)}:1 (needs ${need})`; }
    }
    if (worst < worstAll) { worstAll = worst; worstAllT = `${th} ${m} ${s}: ${worstT}`; }
    if (worst < 0) T(false, `${th} ${m} ${s}: ${worstT}`);
  }
}
T(worstAll >= 0, `every text over glass passes; worst: ${worstAllT}`);
T(ratio([200, 200, 200], [205, 205, 205]) < 4.5, 'CONTROL: near-identical colours score under 4.5:1 (the contrast maths can fail)');

// ---------- controls ----------
console.log('== controls ==');
await open('s=home');
T(String(await clickText('A made-up button')).startsWith('NOEL'), 'CONTROL: a made-up button is reported missing');
T(errors.length === 0, `script errors: ${errors.length}`, errors.slice(0, 5));
stop();
console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
