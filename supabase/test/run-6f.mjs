// Phase 6f checks, run locally: the reminder digest (who, when, what it says) and the optional MPIN.
// Same in-memory Postgres and Supabase stand-in as run-local.mjs. Fake data only. No network.
//   node supabase/test/run-6f.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeDb } from './localdb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const db = await makeDb();
const schema = readFileSync(process.env.PATAS_SCHEMA || join(here, '..', 'schema.sql'), 'utf8');
await db.exec(schema);
await db.exec(schema); // safe to re-run: the secrets must not be made twice

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';
await db.query(`insert into auth.users (id, email) values ($1,'a@patas.invalid'),($2,'b@patas.invalid'),($3,'c@patas.invalid'),($4,'d@patas.invalid')`, [A, B, C, D]);

async function as(who, sql, params = [], claims = {}) {
  await db.exec('begin');
  try {
    if (who === 'anon') await db.exec('set local role anon');
    else if (who === 'service') await db.exec('set local role service_role');
    else {
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who, role: 'authenticated', ...claims })]);
      await db.exec('set local role authenticated');
    }
    const r = await db.query(sql, params);
    await db.exec('commit');
    return { ok: true, rows: r.rows };
  } catch (e) {
    await db.exec('rollback');
    return { ok: false, code: e.code, msg: e.message };
  }
}
const su = (sql, p = []) => db.query(sql, p).then((r) => r.rows);
const val = (r) => (r.ok ? JSON.stringify(Object.values(r.rows[0])[0]) : `error ${r.code}`);
const results = [];
const check = (name, expected, actual) => results.push({ pass: String(expected) === String(actual), name, expected: String(expected), actual: String(actual) });

// ---------------- reminders: fake data ----------------
const T = 1760000000000;
await su(`insert into public.user_settings (user_id, time_zone, reminder_at) values
  ($1,'Asia/Manila','08:00'), ($2,'Asia/Manila','08:00'), ($3,'Asia/Manila','08:00'), ($4,'America/New_York','21:00')`, [A, B, C, D]);
await su(`update public.user_settings set reminders_on = false where user_id = $1`, [C]);
for (const u of [A, C, D]) {
  await su(`insert into public.push_subscriptions (user_id, id, endpoint, p256dh, auth_secret, created_at)
            values ($1, 'p1', 'https://fcm.googleapis.com/fcm/send/fake-' || $2, repeat('B', 60), repeat('c', 16), ${T})`, [u, u.slice(0, 8)]);
}
const debt = (u, id, kind, due, extra = '') => su(
  `insert into public.debts (user_id, id, kind, person_name, due_on, opened_on, created_at${extra ? ', ' + extra.split('=')[0] : ''})
   values ($1, $2, $3, 'Test Lender', $4, '2026-10-01', ${T}${extra ? ', ' + extra.split('=')[1] : ''})`, [u, id, kind, due]);
const inst = (u, debtId, id, seq, due, amt) => su(
  `insert into public.installments (user_id, id, debt_id, seq, due_on, amount_centavos, created_at) values ($1,$2,$3,$4,$5,$6,${T})`, [u, id, debtId, seq, due, amt]);
const line = (u, debtId, id, kind, amt, deleted = false) => su(
  `insert into public.debt_lines (user_id, id, debt_id, kind, amount_centavos, on_date, created_at, deleted) values ($1,$2,$3,$4,$5,'2026-10-02',${T},$6)`, [u, id, debtId, kind, amt, deleted]);

// A (Manila, 08:00). Today = 2026-10-21.
await debt(A, 'dI', 'installments', null);                 // partly paid: today and tomorrow both count
await inst(A, 'dI', 'i1', 1, '2026-10-21', 120000); await inst(A, 'dI', 'i2', 2, '2026-10-22', 120000); await inst(A, 'dI', 'i3', 3, '2026-11-21', 120000);
await line(A, 'dI', 'l1', 'payment', 50000);
await debt(A, 'dP', 'installments', null);                 // today's installment fully covered: no
await inst(A, 'dP', 'p1', 1, '2026-10-21', 100000); await line(A, 'dP', 'l2', 'payment', 100000);
await debt(A, 'dO', 'one_time', '2026-10-22'); await line(A, 'dO', 'l3', 'principal', 30000);          // tomorrow: yes
await debt(A, 'dO2', 'one_time', '2026-10-22'); await line(A, 'dO2', 'l4', 'principal', 30000); await line(A, 'dO2', 'l5', 'payment', 30000); // paid: no
await debt(A, 'dS', 'installments', null, "settled_on='2026-10-05'"); await inst(A, 'dS', 's1', 1, '2026-10-21', 5000); // settled: no
await debt(A, 'dR', 'one_time', '2026-10-21', 'remind=false'); await line(A, 'dR', 'l6', 'principal', 30000);          // reminders off for this debt: no
await debt(A, 'dX', 'one_time', '2026-10-21', 'deleted=true'); await line(A, 'dX', 'l7', 'principal', 30000);          // deleted: no
await debt(A, 'dL', 'one_time', '2026-10-21'); await line(A, 'dL', 'l8', 'principal', 30000); await line(A, 'dL', 'l9', 'payment', 30000, true); // its payment was deleted: yes
// B has something due but no phone subscribed; C turned reminders off; D is in New York at 21:00.
for (const u of [B, C]) { await debt(u, 'd1', 'one_time', '2026-10-21'); await line(u, 'd1', 'l1', 'principal', 1000); }
await debt(D, 'd1', 'one_time', '2026-10-21'); await line(D, 'd1', 'l1', 'principal', 1000);

const secret = (await su(`select decrypted_secret as s from vault.decrypted_secrets where name = 'patas_cron_secret'`))[0].s;
check('One cron secret, 64 hex characters, made once', '1 true', `${(await su(`select count(*)::int n from vault.secrets where name = 'patas_cron_secret'`))[0].n} ${/^[0-9a-f]{64}$/.test(secret)}`);
const batch = (now, s = secret) => as('service', `select public.reminder_batch($1, $2::timestamptz) as r`, [s, now]);
const digests = (r) => (r.ok ? r.rows[0].r.digests ?? r.rows[0].r : `error ${r.code}`);
const who = (r) => { const d = digests(r); return Array.isArray(d) ? d.map((x) => ({ [A]: 'A', [B]: 'B', [C]: 'C', [D]: 'D' })[x.user_id]).sort().join(',') || 'none' : JSON.stringify(d); };

check('A signed-in person cannot run the sender', 'error 42501', val(await as(A, `select public.reminder_batch($1)`, [secret])));
check('A signed-out visitor cannot run the sender', 'error 42501', val(await as('anon', `select public.reminder_batch($1)`, [secret])));
check('Sender with a wrong secret is refused', '{"result":"refused"}', val(await batch('2026-10-21T00:00:00Z', 'f'.repeat(64))));
check('Sender with no secret is refused', '{"result":"refused"}', val(await as('service', `select public.reminder_batch(null) as r`)));
check('07:59 in Manila: nobody yet', 'none', who(await batch('2026-10-20T23:59:00Z')));
const first = await batch('2026-10-21T00:00:00Z');
check('08:00 in Manila: only A (B has no phone, C turned it off, D is at 20:00)', 'A', who(first));
const a = digests(first).find((x) => x.user_id === A);
check("A's words: counts only, oldest-first rule (partly paid counts, covered doesn't, deleted payment doesn't pay)",
  'Due today: 2 payments. Due tomorrow: 2 payments.', a?.body);
check('No names or amounts in the words', 'false', /Test|Lender|1,200|1200|300/.test(a?.body ?? ''));
check("A's digest goes to A's own phone only", 'https://fcm.googleapis.com/fcm/send/fake-11111111', (a?.subs ?? []).map((s) => s.endpoint).join(' '));
check('Run again 15 minutes later: nothing (once a day)', 'none', who(await batch('2026-10-21T00:15:00Z')));
check('Late run the same day still sends nothing twice', 'none', who(await batch('2026-10-21T11:00:00Z')));
const ny = await batch('2026-10-21T01:00:00Z');
check('New York 21:00 (01:00Z): D, with "due tomorrow" in its own calendar', 'D|Due tomorrow: 1 payment.', `${who(ny)}|${digests(ny)[0]?.body}`);
check('Next day in Manila: A again (its i2 is now due today)', 'A', who(await batch('2026-10-22T00:05:00Z')));
check("A can't read the sent log", 'error 42501', val(await as(A, `select count(*) from private.reminder_sent_debt`)));
check('Nothing due: no digest at all (no empty nudge)', 'none', who(await batch('2026-10-25T00:05:00Z')));

// ---------------- test reminder, push keys, gone subscriptions ----------------
check('Test reminder: A gets only its own phones', 'ok 1', await as(A, `select public.reminder_test_claim() as r`).then((r) => `${r.rows[0].r.result} ${r.rows[0].r.subs.length}`));
check('Test reminder twice within 2 minutes: wait', '{"result":"wait"}', val(await as(A, `select public.reminder_test_claim()`)));
check('Test reminder: signed-out refused', 'error 42501', val(await as('anon', `select public.reminder_test_claim()`)));
check('B (no phones) gets an empty list, never A\'s', 'ok 0', await as(B, `select public.reminder_test_claim() as r`).then((r) => `${r.rows[0].r.result} ${r.rows[0].r.subs.length}`));
check('Public key before the sender made one: none', 'null', val(await as(A, `select public.reminder_public_key()`)));
const pub = 'B' + 'a'.repeat(86); // 87 chars, the length of a raw P-256 key in base64url
check('A signed-in person cannot store push keys', 'error 42501', val(await as(A, `select public.reminder_vapid_init($1, $2)`, [pub, 'x'.repeat(60)])));
check('Malformed public key refused', '{"result":"bad"}', val(await as('service', `select public.reminder_vapid_init('short', $1)`, ['x'.repeat(60)])));
check('Sender stores the first pair', '{"result":"set"}', val(await as('service', `select public.reminder_vapid_init($1, $2)`, [pub, 'x'.repeat(60)])));
check('A second pair can never replace it', '{"result":"exists"}', val(await as('service', `select public.reminder_vapid_init($1, $2)`, ['C' + 'b'.repeat(86), 'y'.repeat(60)])));
check('Signed-in person gets the public key', JSON.stringify(pub), val(await as(A, `select public.reminder_public_key()`)));
check('Signed-out visitor gets no key', 'error 42501', val(await as('anon', `select public.reminder_public_key()`)));
check('A signed-in person cannot read the private key', 'error 42501', val(await as(A, `select public.reminder_vapid()`)));
check('Sender reads the same pair back', `${pub} ${'x'.repeat(60)}`, await as('service', `select public.reminder_vapid() as r`).then((r) => `${r.rows[0].r.public} ${r.rows[0].r.private}`));
check('A signed-in person cannot read Vault', 'error 42501', val(await as(A, `select count(*) from vault.decrypted_secrets`)));
check('A signed-in person cannot mark a phone gone', 'error 42501', val(await as(A, `select public.reminder_gone($1, 'p1')`, [D])));
await as('service', `select public.reminder_gone($1, 'p1')`, [A]);
check('Gone phone is soft-deleted and no longer gets digests', 'true none', `${(await su(`select deleted from public.push_subscriptions where user_id = $1`, [A]))[0].deleted} ${who(await batch('2026-10-23T00:05:00Z'))}`);

// Audit L-7: one browser signed up under two accounts (a sign-out that never reached the server).
await su(`update public.push_subscriptions set deleted = false where user_id = $1 and id = 'p1'`, [A]);
await new Promise((r) => setTimeout(r, 25)); // B saves it clearly later (the server clock stamps updated_at)
await su(`insert into public.push_subscriptions (user_id, id, endpoint, p256dh, auth_secret, created_at)
          values ($1, 'p9', 'https://fcm.googleapis.com/fcm/send/fake-11111111', repeat('B', 60), repeat('c', 16), ${T})`, [B]);
await debt(A, 'dA7', 'one_time', '2026-10-28'); await line(A, 'dA7', 'l71', 'principal', 1000);
await debt(B, 'dB7', 'one_time', '2026-10-28'); await line(B, 'dB7', 'l72', 'principal', 1000);
const shared = await batch('2026-10-27T00:05:00Z');
check('A phone shared by two accounts goes to the one that saved it last only (audit L-7)', 'B|fake-11111111',
  `${who(shared)}|${(digests(shared)[0]?.subs ?? []).map((s) => s.endpoint.split('/').pop()).join(',')}`);

// Audit L-4: one person's broken data must not stop everyone else's digest, and their claim rolls back.
await su(`insert into public.push_subscriptions (user_id, id, endpoint, p256dh, auth_secret, created_at)
          values ($1, 'p2', 'https://web.push.apple.com/fake-a-two', repeat('B', 60), repeat('c', 16), ${T})`, [A]);
await debt(A, 'dA9', 'one_time', '2026-10-30'); await line(A, 'dA9', 'l91', 'principal', 1000);
await debt(B, 'dB9', 'one_time', '2026-10-30'); await line(B, 'dB9', 'l92', 'principal', 1000);
await db.exec(`alter function private.reminder_events(uuid, date) rename to reminder_events_real;
  create function private.reminder_events(p_uid uuid, p_day date) returns table (debt_id text, days int)
  language plpgsql stable set search_path = '' as $f$ begin
    if p_uid = '${A}' then raise exception 'planted breakage'; end if;
    return query select * from private.reminder_events_real(p_uid, p_day); end $f$;`);
const broken = await batch('2026-10-29T00:05:00Z');
check("A's broken data: B still gets its digest, none of A's debts is claimed", 'B 0',
  `${who(broken)} ${(await su(`select count(*)::int n from private.reminder_sent_debt where user_id = $1 and local_date = '2026-10-29'`, [A]))[0].n}`);
await db.exec(`drop function private.reminder_events(uuid, date); alter function private.reminder_events_real(uuid, date) rename to reminder_events;`);
check('Once fixed, the next run sends A the digest it missed', 'A', who(await batch('2026-10-29T00:20:00Z')));

// ---------------- MPIN ----------------
const pin = (who_, fn, args = [], claims = {}) => as(who_, `select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args, claims).then((r) => (r.ok ? r.rows[0].r : `error ${r.code}`));
const res = (x) => (typeof x === 'string' ? x : x.result ?? (x.enabled === false ? 'off' : x.enabled ? 'on' : JSON.stringify(x)));
check('MPIN is off by default', 'off', res(await pin(A, 'pin_status')));
check('Signed-out visitor cannot check a PIN', 'error 42501', await pin('anon', 'pin_verify', ['4831']));
for (const w of ['1234', '1111', '9876', '2580', '12a4', '483']) check(`Weak or malformed PIN ${w} refused`, 'weak', res(await pin(A, 'pin_claim', [w])));
check('A sets 4831', 'set', res(await pin(A, 'pin_claim', ['4831'])));
check('Setting again cannot overwrite it', 'exists', res(await pin(A, 'pin_claim', ['7302'])));
check('Stored as bcrypt over a peppered HMAC, never the digits', 'true', await su(`select pin_hash like '$2a$08$%' and pin_hash not like '%4831%' as ok from private.account_pin where user_id = $1`, [A]).then((r) => r[0].ok));
check('Hash is not plain bcrypt of the digits (the pepper is in)', 'false', await su(`select extensions.crypt('4831', pin_hash) = pin_hash as same from private.account_pin where user_id = $1`, [A]).then((r) => r[0].same));
check("A can't read the PIN table", 'error 42501', val(await as(A, `select count(*) from private.account_pin`)));
check("B's status says nothing about A's PIN", 'off', res(await pin(B, 'pin_status')));
check('Right PIN: ok', 'ok', res(await pin(A, 'pin_verify', ['4831'])));
const wrongs = [];
for (let i = 0; i < 4; i++) { const r = await pin(A, 'pin_verify', ['0000']); wrongs.push(`${r.result}:${r.tries_left}`); }
check('Four wrong tries count down', 'wrong:4 wrong:3 wrong:2 wrong:1', wrongs.join(' '));
check('Fifth wrong try locks', 'locked', res(await pin(A, 'pin_verify', ['0000'])));
check('After the lock even the right PIN is refused', 'locked', res(await pin(A, 'pin_verify', ['4831'])));
check('Reset without a fresh email code: refused', 'stale_code', res(await pin(A, 'pin_reset_with_code', ['5917'])));
const now = Math.floor(Date.now() / 1000);
check('Reset with a code older than 10 minutes: refused', 'stale_code', res(await pin(A, 'pin_reset_with_code', ['5917'], { amr: [{ method: 'otp', timestamp: now - 700 }] })));
check('Not locked, code older than 10 minutes: still refused (the 10-minute rule on its own)', 'stale_code', res(await pin(B, 'pin_reset_with_code', ['5917'], { amr: [{ method: 'otp', timestamp: now - 700 }] })));
check('Not locked, code from 9 minutes ago: allowed', 'ok', res(await pin(D, 'pin_reset_with_code', ['5917'], { amr: [{ method: 'otp', timestamp: now - 540 }] })));
check('Reset with a password-style sign-in claim: refused', 'stale_code', res(await pin(A, 'pin_reset_with_code', ['5917'], { amr: [{ method: 'password', timestamp: now }] })));
check('Reset with a fresh email code sets a new PIN', 'ok', res(await pin(A, 'pin_reset_with_code', ['5917'], { amr: [{ method: 'otp', timestamp: now + 5 }] })));
check('New PIN works, old one does not', 'ok wrong', `${res(await pin(A, 'pin_verify', ['5917']))} ${res(await pin(A, 'pin_verify', ['4831']))}`);
const e1 = (await pin(A, 'pin_verify', ['5917'])).epoch;
check('Change with the wrong current PIN: refused and counted (a right PIN had reset the count)', 'wrong:4', await pin(A, 'pin_change', ['0000', '6408']).then((r) => `${r.result}:${r.tries_left}`));
const ch = await pin(A, 'pin_change', ['5917', '6408']);
check('Change with the right current PIN: ok, every phone re-checks (new epoch)', 'ok true', `${ch.result} ${ch.epoch !== e1}`);
check('Offline wrong tries reported later still count (3 + 2 = locked)', 'ok:2 locked:0',
  `${await pin(A, 'pin_report_offline_fails', [3]).then((r) => `${r.result}:${r.tries_left}`)} ${await pin(A, 'pin_report_offline_fails', [2]).then((r) => `${r.result}:${r.tries_left}`)}`);
await pin(A, 'pin_reset_with_code', ['6408'], { amr: [{ method: 'otp', timestamp: now + 10 }] });
check('Turn off needs the current PIN', 'wrong', res(await pin(A, 'pin_disable', ['0000'])));
check('Turn off with the right PIN: off everywhere', 'ok off', `${res(await pin(A, 'pin_disable', ['6408']))} ${res(await pin(A, 'pin_status'))}`);
check('After turning off, it can be set again', 'set', res(await pin(A, 'pin_claim', ['4831'])));

// ---------------- account deletion takes it all ----------------
await su(`delete from auth.users where id = $1`, [A]);
check('Deleting the account removes its PIN, sent log and test log', '0 0 0', await su(
  `select (select count(*) from private.account_pin where user_id = $1)::int a, (select count(*) from private.reminder_sent where user_id = $1)::int b,
          (select count(*) from private.reminder_test where user_id = $1)::int c`, [A]).then((r) => `${r[0].a} ${r[0].b} ${r[0].c}`));

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `  (expected ${r.expected}, got ${r.actual})`}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
