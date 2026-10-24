// Round 4 database checks, run locally (in-memory Postgres, fake data, no network):
//   1. The upgrade: the schema as it was before round 4, with fake data, plus migrations/0007_round4.sql, keeps every
//      row, carries this month's cash flow over, and ends up exactly like a fresh schema.sql (object for object).
//   2. The new rules: recurring debts, currency, per-debt reminder choices, the greeting name, cashflow_months and
//      photos (rows and files) are each person's own and refuse bad data.
//   3. Per-debt reminders: days before, an extra date, the debt's own time, recurring dates, once per debt per day.
//   node supabase/test/run-r4.mjs
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeDb } from './localdb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = readFileSync(process.env.PATAS_SCHEMA || join(here, '..', 'schema.sql'), 'utf8');
const BEFORE = readFileSync(join(here, 'fixtures', 'schema-before-0007.sql'), 'utf8');
const M0007 = readFileSync(process.env.PATAS_0007 || join(here, '..', 'migrations', '0007_round4.sql'), 'utf8');

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const T = 1760000000000;
const results = [];
const check = (name, expected, actual) => results.push({ pass: String(expected) === String(actual), name, expected: String(expected), actual: String(actual) });

function runner(db) {
  const as = async (who, sql, params = [], opts = {}) => {
    await db.exec('begin');
    try {
      if (who === 'anon') await db.exec('set local role anon');
      else if (who === 'service') await db.exec('set local role service_role');
      else {
        await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who, role: 'authenticated', ...opts.claims })]);
        if (opts.op) await db.query(`select set_config('storage.operation', $1, true)`, [opts.op]);
        await db.exec('set local role authenticated');
      }
      const r = await db.query(sql, params);
      await db.exec('commit');
      return { ok: true, rows: r.rows, n: r.rows.length || r.affectedRows || 0 };
    } catch (e) {
      await db.exec('rollback');
      return { ok: false, code: e.code, msg: e.message };
    }
  };
  const su = (sql, p = []) => db.query(sql, p).then((r) => r.rows);
  return { as, su };
}
const res = (r) => (r.ok ? `ok (${r.n} rows)` : `error ${r.code}`);

// The database's own description of itself, for "fresh == upgraded".
async function catalog(db) {
  const q = (sql) => db.query(sql).then((r) => r.rows.map((x) => JSON.stringify(x)).sort());
  return {
    columns: await q(`select table_schema, table_name, column_name, data_type, udt_name, column_default, is_nullable from information_schema.columns where table_schema in ('public', 'private')`),
    constraints: await q(`select c.conrelid::regclass::text as rel, c.conname, pg_get_constraintdef(c.oid) as def from pg_constraint c join pg_namespace n on n.oid = c.connamespace where n.nspname in ('public', 'private')`),
    indexes: await q(`select schemaname, tablename, indexname, indexdef from pg_indexes where schemaname in ('public', 'private')`),
    triggers: await q(`select tgrelid::regclass::text as rel, tgname, pg_get_triggerdef(oid) as def from pg_trigger where not tgisinternal`),
    policies: await q(`select schemaname, tablename, policyname, cmd, roles::text, qual, with_check from pg_policies where schemaname in ('public', 'storage')`),
    functions: await q(`select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args, md5(p.prosrc) as src, p.prosecdef, p.proconfig::text as cfg, p.proacl::text as acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private')`),
    tableGrants: await q(`select table_schema, table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema in ('public', 'private')`),
    rls: await q(`select relname, relrowsecurity, relforcerowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'private') and c.relkind = 'r'`),
    buckets: await q(`select * from storage.buckets`),
  };
}

// ================= 1. the upgrade =================
{
  const db = await makeDb();
  const { su } = runner(db);
  await db.exec(BEFORE);
  await su(`insert into auth.users (id, email) values ($1, 'a@patas.invalid'), ($2, 'b@patas.invalid')`, [A, B]);
  await su(`insert into public.user_settings (user_id, cashflow_income_centavos, cashflow_expenses_centavos, time_zone) values ($1, 4321740, 1586025, 'Asia/Manila'), ($2, 0, 0, 'Asia/Manila')`, [A, B]);
  await su(`insert into public.debts (user_id, id, kind, person_name, due_on, opened_on, created_at, remind) values
    ($1, 'd1', 'one_time', 'Test Lender', '2026-10-25', '2026-10-01', ${T}, true), ($1, 'd2', 'installments', 'Test Shop', null, '2026-09-01', ${T}, false)`, [A]);
  await su(`insert into public.installments (user_id, id, debt_id, seq, due_on, amount_centavos, created_at) values ($1, 'i1', 'd2', 1, '2026-10-28', 124750, ${T}), ($1, 'i2', 'd2', 2, '2026-11-28', 124750, ${T})`, [A]);
  await su(`insert into public.debt_lines (user_id, id, debt_id, kind, amount_centavos, on_date, created_at, method) values ($1, 'l1', 'd1', 'principal', 845000, '2026-10-01', ${T}, ''), ($1, 'l2', 'd1', 'payment', 320000, '2026-10-05', ${T}, 'GCash')`, [A]);
  const before = await su(`select (select count(*) from public.debts)::int d, (select count(*) from public.installments)::int i, (select count(*) from public.debt_lines)::int l, (select string_agg(id || ':' || amount_centavos, ',' order by id) from public.debt_lines) money`);
  await db.exec(M0007);
  const after = await su(`select (select count(*) from public.debts)::int d, (select count(*) from public.installments)::int i, (select count(*) from public.debt_lines)::int l, (select string_agg(id || ':' || amount_centavos, ',' order by id) from public.debt_lines) money`);
  check('Upgrade keeps every debt, installment and line, with the same amounts', JSON.stringify(before[0]), JSON.stringify(after[0]));
  const d = await su(`select id, remind, remind_days::text, currency, remind_on, remind_at from public.debts order by id`);
  check('Old debts get the old reminder behaviour ({0,1}) and pesos; their on/off switch is kept', 'd1 true {0,1} PHP null null|d2 false {0,1} PHP null null', d.map((x) => `${x.id} ${x.remind} ${x.remind_days} ${x.currency} ${x.remind_on} ${x.remind_at}`).join('|'));
  const cf = await su(`select user_id, id, income_centavos, expenses_centavos from public.cashflow_months`);
  const month = (await su(`select to_char(now() at time zone 'Asia/Manila', 'YYYY-MM') m`))[0].m;
  check("This month's typed cash flow is carried over (A only: B typed nothing)", `${A} ${month} 4321740 1586025`, cf.map((x) => `${x.user_id} ${x.id} ${x.income_centavos} ${x.expenses_centavos}`).join('|'));
  check('The old cash-flow numbers stay where they were (older app versions still read them)', '4321740 1586025', (await su(`select cashflow_income_centavos a, cashflow_expenses_centavos b from public.user_settings where user_id = $1`, [A])).map((x) => `${x.a} ${x.b}`)[0]);
  await db.exec(M0007);
  check('Running 0007 twice changes nothing', JSON.stringify(after[0]) + ' 1', JSON.stringify((await su(`select (select count(*) from public.debts)::int d, (select count(*) from public.installments)::int i, (select count(*) from public.debt_lines)::int l, (select string_agg(id || ':' || amount_centavos, ',' order by id) from public.debt_lines) money`))[0]) + ' ' + (await su(`select count(*)::int n from public.cashflow_months`))[0].n);

  const fresh = await makeDb();
  await fresh.exec(SCHEMA);
  const [cu, cf2] = [await catalog(db), await catalog(fresh)];
  for (const k of Object.keys(cu)) {
    const extraUp = cu[k].filter((x) => !cf2[k].includes(x)), extraFresh = cf2[k].filter((x) => !cu[k].includes(x));
    check(`Upgraded == fresh schema.sql: ${k} (${cf2[k].length})`, 'same', extraUp.length || extraFresh.length ? `upgrade-only ${extraUp.slice(0, 2).join(' ')} | fresh-only ${extraFresh.slice(0, 2).join(' ')}` : 'same');
  }
}

// ================= 2. the new rules, on a fresh schema.sql =================
const db = await makeDb();
const { as, su } = runner(db);
await db.exec(SCHEMA);
await db.exec(SCHEMA); // safe to re-run
await su(`insert into auth.users (id, email) values ($1, 'a@patas.invalid'), ($2, 'b@patas.invalid')`, [A, B]);

// -- debts: recurring, currency, reminder choices
const ins = (who, cols, vals) => as(who, `insert into public.debts (id, person_name, opened_on, created_at, ${cols}) values (${vals})`);
check('A recurring debt with amount, rhythm and first date is accepted', 'ok (1 rows)', res(await ins(A, 'kind, recurring_amount_centavos, recurring_every, recurring_first', `'r1', 'Test Lender', '2026-08-15', ${T}, 'recurring', 145000, 'monthly', '2026-08-15'`)));
check('Recurring without an amount is refused', 'error 23514', res(await ins(A, 'kind, recurring_every, recurring_first', `'r2', 'Test Lender', '2026-08-15', ${T}, 'recurring', 'monthly', '2026-08-15'`)));
check('A one-time debt may not carry recurring fields', 'error 23514', res(await ins(A, 'kind, recurring_every', `'r3', 'Test Lender', '2026-08-15', ${T}, 'one_time', 'monthly'`)));
check('An end date before the first date is refused', 'error 23514', res(await ins(A, 'kind, recurring_amount_centavos, recurring_every, recurring_first, recurring_until', `'r4', 'Test Lender', '2026-08-15', ${T}, 'recurring', 1000, 'weekly', '2026-08-15', '2026-08-01'`)));
check('An unknown rhythm is refused', 'error 23514', res(await ins(A, 'kind, recurring_amount_centavos, recurring_every, recurring_first', `'r5', 'Test Lender', '2026-08-15', ${T}, 'recurring', 1000, 'daily', '2026-08-15'`)));
check('A recurring debt has no single due date', 'error 23514', res(await ins(A, 'kind, recurring_amount_centavos, recurring_every, recurring_first, due_on', `'r6', 'Test Lender', '2026-08-15', ${T}, 'recurring', 1000, 'weekly', '2026-08-15', '2026-09-01'`)));
check('A new debt without reminder choices gets the old behaviour {0,1} and pesos', '{0,1} PHP', (await ins(A, 'kind', `'n0', 'Test Lender', '2026-10-20', ${T}, 'one_time'`), (await su(`select remind_days::text r, currency c from public.debts where id = 'n0'`)).map((x) => `${x.r} ${x.c}`)[0]));
check('A debt in dollars is kept in dollars', 'USD', (await ins(A, 'kind, currency', `'c1', 'Test Lender', '2026-10-20', ${T}, 'one_time', 'USD'`), (await su(`select currency from public.debts where id = 'c1'`))[0].currency));
check('A currency must be 3 capital letters', 'error 23514', res(await ins(A, 'kind, currency', `'c2', 'Test Lender', '2026-10-20', ${T}, 'one_time', 'usd'`)));
check('Reminder days are only 0, 1, 3 or 7', 'error 23514', res(await ins(A, 'kind, remind_days', `'m1', 'Test Lender', '2026-10-20', ${T}, 'one_time', '{2}'`)));
check('Reminder days {0,1,3,7} accepted', 'ok (1 rows)', res(await ins(A, 'kind, remind_days', `'m2', 'Test Lender', '2026-10-20', ${T}, 'one_time', '{0,1,3,7}'`)));
check('No more than 4 reminder days', 'error 23514', res(await ins(A, 'kind, remind_days', `'m3', 'Test Lender', '2026-10-20', ${T}, 'one_time', '{0,1,3,7,7}'`)));
check("B cannot see A's recurring debt", 'ok (0 rows)', res(await as(B, `select * from public.debts where id = 'r1'`)));

// -- the greeting name
await su(`insert into public.user_settings (user_id) values ($1), ($2)`, [A, B]);
check('A can set the name Home greets with', 'ok (1 rows)', res(await as(A, `update public.user_settings set display_name = 'Rina' where user_id = $1 returning display_name`, [A])));
check('The name is plain text only (no invisible direction marks)', 'error 23514', res(await as(A, `update public.user_settings set display_name = 'Ri' || chr(8238) || 'na' where user_id = $1`, [A])));
check('The name is at most 40 characters', 'error 23514', res(await as(A, `update public.user_settings set display_name = repeat('a', 41) where user_id = $1`, [A])));
check("B cannot read A's name", 'ok (0 rows)', res(await as(B, `select display_name from public.user_settings where user_id = $1`, [A])));

// -- cash flow per month
check('A saves October', 'ok (1 rows)', res(await as(A, `insert into public.cashflow_months (id, income_centavos, expenses_centavos, created_at) values ('2026-10', 4321740, 1586025, ${T})`)));
check('A month id must be a real month', 'error 23514', res(await as(A, `insert into public.cashflow_months (id, created_at) values ('2026-13', ${T})`)));
check('Income can not be negative', 'error 23514', res(await as(A, `insert into public.cashflow_months (id, income_centavos, created_at) values ('2026-09', -1, ${T})`)));
check("B cannot read A's months", 'ok (0 rows)', res(await as(B, `select * from public.cashflow_months`)));
check("B cannot write a month into A's account", 'error 42501', res(await as(B, `insert into public.cashflow_months (user_id, id, created_at) values ('${A}', '2026-08', ${T})`)));
check("B's update of A's month changes nothing", 'ok (0 rows)', res(await as(B, `update public.cashflow_months set income_centavos = 1 where user_id = '${A}'`)));
check('Signed-out visitors cannot read months', 'error 42501', res(await as('anon', `select * from public.cashflow_months`)));
check('Nobody can hard-delete a month (soft delete only)', 'error 42501', res(await as(A, `delete from public.cashflow_months`)));
check('The server sets updated_at', 'true', (await su(`select updated_at > now() - interval '1 minute' f from public.cashflow_months where user_id = $1`, [A]))[0].f);

// -- photos: rows
const pkey = (name) => 'p-' + createHash('sha256').update(name).digest('hex').slice(0, 16);
const photoRow = (who, id, key, path) => as(who, `insert into public.photos (id, person_key, storage_path, created_at) values ($1, $2, $3, ${T})`, [id, key, path]);
check('A adds a profile photo row at A/me.jpg', 'ok (1 rows)', res(await photoRow(A, 'me', '', `${A}/me.jpg`)));
check("A adds Tita Merly's photo row (id from the name)", 'ok (1 rows)', res(await photoRow(A, pkey('tita merly'), 'tita merly', `${A}/${pkey('tita merly')}.jpg`)));
check("A photo id that doesn't match the name is refused", 'error 23514', res(await photoRow(A, pkey('someone else'), 'tita merly', `${A}/${pkey('someone else')}.jpg`)));
check('A photo row pointing at another folder is refused', 'error 23514', res(await photoRow(A, pkey('kuya ramil'), 'kuya ramil', `${B}/${pkey('kuya ramil')}.jpg`)));
check('A profile photo row may not name a person', 'error 23514', res(await photoRow(A, 'me', 'x', `${A}/me.jpg`)));
check("B cannot see A's photo rows", 'ok (0 rows)', res(await as(B, `select * from public.photos`)));
check("B cannot add a photo row in A's account", 'error 42501', res(await as(B, `insert into public.photos (user_id, id, person_key, storage_path, created_at) values ('${A}', 'me', '', '${A}/me.jpg', ${T})`)));

// -- photos: files
const up = (who, name, bucket = 'photos') => as(who, `insert into storage.objects (bucket_id, name, owner) values ('${bucket}', '${name}', '${who}')`);
check('A uploads its profile photo', 'ok (1 rows)', res(await up(A, `${A}/me.jpg`)));
check('A cannot upload a photo with no photos row', 'error 42501', res(await up(A, `${A}/${pkey('kuya ramil')}.jpg`)));
check("A cannot upload into B's folder", 'error 42501', res(await up(A, `${B}/me.jpg`)));
check("B cannot see A's photo file", 'ok (0 rows)', res(await as(B, `select * from storage.objects where bucket_id = 'photos'`)));
check('A sees its own photo file', 'ok (1 rows)', res(await as(A, `select * from storage.objects where bucket_id = 'photos'`)));
check('No shareable link to a photo, even your own', 'ok (0 rows)', res(await as(A, `select * from storage.objects where bucket_id = 'photos'`, [], { op: 'storage.object.sign' })));
check('A may replace its own photo file in place', 'ok (1 rows)', res(await as(A, `update storage.objects set created_at = now() where name = '${A}/me.jpg' returning name`)));
check("B's update of A's photo file changes nothing", 'ok (0 rows)', res(await as(B, `update storage.objects set created_at = now() where name = '${A}/me.jpg' returning name`)));
check("B's delete of A's photo file deletes nothing", 'ok (0 rows)', res(await as(B, `delete from storage.objects where name = '${A}/me.jpg' returning name`)));
await as(B, `delete from storage.objects`); // a bare delete (no WHERE) skips the read rule: only the delete rule protects
await as(B, `update storage.objects set owner = '${B}'`); // the same for a bare update
await photoRow(B, 'me', '', `${B}/me.jpg`); // B makes its own photo slot, then tries to move A's file into it
await as(B, `update storage.objects set name = '${B}/me.jpg'`);
check("B's bare delete / update of every file leaves A's photo untouched", `1 ${A}`, (await su(`select count(*)::int n, max(owner::text) o from storage.objects where name = '${A}/me.jpg'`)).map((x) => `${x.n} ${x.o}`)[0]);
check('Signed-out visitors see no photo files', 'ok (0 rows)', res(await as('anon', `select * from storage.objects where bucket_id = 'photos'`)));
await su(`insert into public.qr_items (user_id, id, label, wallet, storage_path, payload_sha256, created_at) values ($1, 'q1', 'GCash', 'gcash', $2, repeat('a', 64), ${T})`, [A, `${A}/q1.png`]);
await up(A, `${A}/q1.png`, 'qr');
check('QR files still cannot be overwritten (the photo rule does not reach them)', 'ok (0 rows)', res(await as(A, `update storage.objects set created_at = now() where name = '${A}/q1.png' returning name`)));
check('Photos bucket is private, 64 KB, JPEG only', 'false 65536 {image/jpeg}', (await su(`select public, file_size_limit, allowed_mime_types::text m from storage.buckets where id = 'photos'`)).map((x) => `${x.public} ${x.file_size_limit} ${x.m}`)[0]);
check('A deleted account takes its photo rows', '0', (await su(`delete from auth.users where id = $1`, [A]), (await su(`select count(*)::int n from public.photos where user_id = $1`, [A]))[0].n));

// ================= 3. per-debt reminders =================
const R = await makeDb();
const rr = runner(R);
await R.exec(SCHEMA);
await rr.su(`insert into auth.users (id, email) values ($1, 'a@patas.invalid'), ($2, 'b@patas.invalid')`, [A, B]);
await rr.su(`insert into public.user_settings (user_id, time_zone, reminder_at) values ($1, 'Asia/Manila', '08:00'), ($2, 'Asia/Manila', '08:00')`, [A, B]);
for (const u of [A, B]) await rr.su(`insert into public.push_subscriptions (user_id, id, endpoint, p256dh, auth_secret, created_at) values ($1, 'p1', 'https://fcm.googleapis.com/fcm/send/fake-' || $2, repeat('B', 60), repeat('c', 16), ${T})`, [u, u.slice(0, 8)]);
const secret = (await rr.su(`select decrypted_secret as s from vault.decrypted_secrets where name = 'patas_cron_secret'`))[0].s;
const runAt = async (iso) => { const r = await rr.as('service', `select public.reminder_batch($1, $2::timestamptz) as r`, [secret, iso]); return r.ok ? r.rows[0].r.digests : `error ${r.code}`; };
const bodyOf = (d, who = A) => (Array.isArray(d) ? d.find((x) => x.user_id === who)?.body ?? 'none' : String(d));
const debtR = (id, cols, vals) => rr.su(`insert into public.debts (user_id, id, person_name, opened_on, created_at, ${cols}) values ($1, $2, 'Test Lender', '2026-10-01', ${T}, ${vals})`, [A, id]);
const lineR = (debt, id, kind, amt, on = '2026-10-02') => rr.su(`insert into public.debt_lines (user_id, id, debt_id, kind, amount_centavos, on_date, created_at) values ($1, $2, $3, $4, $5, $6, ${T})`, [A, id, debt, kind, amt, on]);
// Today = 2026-10-21 (Manila). 08:00 Manila = 00:00Z.
await debtR('d3', 'kind, due_on, remind_days', `'one_time', '2026-10-24', '{3}'`); await lineR('d3', 'a1', 'principal', 10000);         // 3 days before: today
await debtR('d7', 'kind, due_on, remind_days', `'one_time', '2026-10-28', '{7}'`); await lineR('d7', 'a2', 'principal', 10000);         // 7 days before: today
await debtR('dN', 'kind, due_on, remind_days', `'one_time', '2026-10-23', '{3}'`); await lineR('dN', 'a3', 'principal', 10000);         // 2 days away, asked for 3: no
await debtR('dE', 'kind, due_on, remind_days, remind_at', `'one_time', '2026-10-21', '{0}', '18:00'`); await lineR('dE', 'a4', 'principal', 10000); // today, but at 18:00
await debtR('dC', 'kind, due_on, remind_days, remind_on', `'one_time', '2026-11-30', '{}', '2026-10-21'`); await lineR('dC', 'a5', 'principal', 10000); // its own extra date: today
await debtR('dCp', 'kind, due_on, remind_days, remind_on', `'one_time', '2026-11-30', '{}', '2026-10-21'`); await lineR('dCp', 'a6', 'principal', 10000); await lineR('dCp', 'a7', 'payment', 10000); // extra date, but paid: no
await debtR('dW', 'kind, recurring_amount_centavos, recurring_every, recurring_first, remind_days', `'recurring', 100000, 'weekly', '2026-10-07', '{0}'`); await lineR('dW', 'a8', 'payment', 100000); // Oct 7 paid, Oct 14 open (past), Oct 21 today: yes
await debtR('dWp', 'kind, recurring_amount_centavos, recurring_every, recurring_first, remind_days', `'recurring', 100000, 'weekly', '2026-10-07', '{0}'`); await lineR('dWp', 'a9', 'payment', 300000); // paid ahead through Oct 21: no
await debtR('dM', 'kind, recurring_amount_centavos, recurring_every, recurring_first, remind_days', `'recurring', 145000, 'monthly', '2026-08-22', '{1}'`); await lineR('dM', 'b1', 'payment', 290000); // Aug, Sep paid; Oct 22 is tomorrow: yes
await debtR('dU', 'kind, recurring_amount_centavos, recurring_every, recurring_first, recurring_until, remind_days', `'recurring', 1000, 'weekly', '2026-09-02', '2026-10-01', '{0,1,3,7}'`); // ended Oct 1: no (without the end, Oct 21 = Sep 2 + 7 weeks would remind today)
await debtR('dOff', 'kind, due_on, remind_days, remind', `'one_time', '2026-10-24', '{3}', false`); await lineR('dOff', 'b2', 'principal', 10000); // switched off: no

const at8 = await runAt('2026-10-21T00:00:00Z');
check('08:00: 3 days before, 7 days before, its own date, a recurring week due today, a recurring month due tomorrow',
  'Due today: 1 payment. Due tomorrow: 1 payment. Due in 3 days: 1 payment. Due in 7 days: 1 payment. Reminder: 1 debt to check.', bodyOf(at8));
check('Still counts only: no names, no amounts', 'false', /Test|Lender|1,000|1000|1,450/.test(bodyOf(at8)));
const claimed = (await rr.su(`select string_agg(debt_id, ',' order by debt_id) s from private.reminder_sent_debt where user_id = $1`, [A]))[0].s;
check('Exactly those 5 debts are claimed for today (not the 18:00 one, not the paid, ended, switched-off or too-early ones)', 'd3,d7,dC,dM,dW', claimed);
check('Run again at 08:15: nothing twice', 'none', bodyOf(await runAt('2026-10-21T00:15:00Z')));
check('17:45: the 18:00 debt is not yet due to remind', 'none', bodyOf(await runAt('2026-10-21T09:45:00Z')));
check('18:00: the debt with its own time reminds on its own', 'Due today: 1 payment.', bodyOf(await runAt('2026-10-21T10:00:00Z')));
check('B, with nothing due, gets nothing', 'none', bodyOf(await runAt('2026-10-21T10:15:00Z'), B));
check('Next day 08:00: nothing (the monthly one asked for 1 day before only, and got it yesterday)', 'none', bodyOf(await runAt('2026-10-22T00:00:00Z')));
check('Oct 28 08:00: both weekly ones are due (one still owes Oct 14, the other was paid ahead only through Oct 21)', 'Due today: 2 payments.', bodyOf(await runAt('2026-10-28T00:00:00Z')));
check("A signed-in person can't read the per-debt sent log", 'error 42501', res(await rr.as(A, `select * from private.reminder_sent_debt`)));
check("A signed-in person can't call the events function", 'error 42501', res(await rr.as(A, `select * from private.reminder_events($1, '2026-10-21')`, [A])));
check('A wrong cron secret is still refused', '{"result":"refused"}', JSON.stringify((await rr.as('service', `select public.reminder_batch($1, now()) as r`, ['f'.repeat(64)])).rows?.[0]?.r));

// ---------------- report ----------------
let pass = 0;
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `  (expected ${r.expected}, got ${r.actual})`}`);
  if (r.pass) pass++;
}
console.log(`\n${pass}/${results.length} passed`);
process.exitCode = pass === results.length ? 0 : 1;
