// Patas privacy test, run locally: builds supabase/schema.sql inside an in-memory Postgres (PGlite)
// with a stand-in for Supabase's auth and storage, then tries to break every rule as user B and as a
// signed-out visitor. Fake data only. No network, no cloud project.
//   node supabase/test/run-local.mjs
import { makeDb } from './localdb.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const db = await makeDb();
const schema = readFileSync(process.env.PATAS_SCHEMA || join(here, '..', 'schema.sql'), 'utf8');
await db.exec(schema);
await db.exec(schema); // "safe to re-run" is a claim too

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
await db.query(`insert into auth.users (id, email) values ($1, 'test-a@patas.invalid'), ($2, 'test-b@patas.invalid')`, [A, B]);

// Run one statement as a user (uuid) or as 'anon', inside its own transaction.
// opts.claims adds token fields (e.g. is_anonymous); opts.op is the Storage operation name the
// Storage server would set for this request (e.g. 'storage.object.sign' for createSignedUrl).
async function as(who, sql, params = [], opts = {}) {
  await db.exec('begin');
  try {
    if (who === 'anon') {
      await db.exec('set local role anon');
    } else {
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
}
const su = (sql, p = []) => db.query(sql, p).then((r) => r.rows);

const results = [];
function check(name, expected, actual) {
  const pass = String(expected) === String(actual);
  results.push({ pass, name, expected: String(expected), actual: String(actual) });
}
const err = (r) => (r.ok ? `ok (${r.n} rows)` : `error ${r.code}`);
const rows = (r) => (r.ok ? `${r.n} rows` : `error ${r.code}`);

const T = Date.now();
// ---------- A sets up fake data ----------
check('A adds settings', 'ok (1 rows)', err(await as(A, `insert into public.user_settings (currency) values ('PHP')`)));
check('A adds a QR', 'ok (1 rows)', err(await as(A,
  `insert into public.qr_items (id, label, wallet, account_name, storage_path, payload_sha256, created_at)
   values ('qr1', 'Test Lender GCash', 'gcash', 'T. Lender', '${A}/qr1.png', repeat('a', 64), ${T})`)));
check('A adds a one-time debt linked to the QR', 'ok (1 rows)', err(await as(A,
  `insert into public.debts (id, kind, person_name, due_on, opened_on, qr_id, created_at)
   values ('d1', 'one_time', 'Test Friend', current_date + 10, current_date, 'qr1', ${T})`)));
check('A adds an installments debt', 'ok (1 rows)', err(await as(A,
  `insert into public.debts (id, kind, person_name, opened_on, created_at)
   values ('d2', 'installments', 'Test Lender', current_date, ${T})`)));
check('A adds 3 installments', 'ok (3 rows)', err(await as(A,
  `insert into public.installments (id, debt_id, seq, due_on, amount_centavos, created_at) values
   ('i1','d2',1,current_date,120000,${T}), ('i2','d2',2,current_date+30,120000,${T}), ('i3','d2',3,current_date+60,120000,${T})`)));
check('A adds a principal, a payment and a charge', 'ok (3 rows)', err(await as(A,
  `insert into public.debt_lines (id, debt_id, kind, charge_kind, amount_centavos, on_date, created_at) values
   ('l1','d1','principal',null,30000,current_date,${T}), ('l2','d2','payment',null,50000,current_date,${T}),
   ('l3','d2','charge','late_fee',10000,current_date,${T})`)));
check('A adds a push subscription', 'ok (1 rows)', err(await as(A,
  `insert into public.push_subscriptions (id, endpoint, p256dh, auth_secret, created_at)
   values ('p1', 'https://fcm.googleapis.com/fcm/send/fake-endpoint-123', repeat('B', 60), repeat('c', 16), ${T})`)));
check('A uploads the QR file for its own QR row', 'ok (1 rows)', err(await as(A,
  `insert into storage.objects (bucket_id, name, owner) values ('qr', '${A}/qr1.png', '${A}')`)));

const tables = ['user_settings', 'qr_items', 'debts', 'installments', 'debt_lines', 'push_subscriptions'];
for (const t of tables) {
  const r = await as(A, `select count(*)::int as n from public.${t}`);
  check(`A sees own ${t}`, 'true', r.ok && r.rows[0].n > 0);
}

// ---------- B tries to read, change and link to A's data ----------
for (const t of tables) {
  check(`B sees none of A's ${t}`, '0 rows', rows(await as(B, `select * from public.${t}`)));
}
check("B cannot see A's QR file", '0 rows', rows(await as(B, `select * from storage.objects`)));
check("B cannot change A's debt", 'ok (0 rows)', err(await as(B, `update public.debts set person_name = 'Hacked' where id = 'd1'`)));
check("B cannot change A's QR row", 'ok (0 rows)', err(await as(B, `update public.qr_items set label = 'Mine now' where id = 'qr1'`)));
check('B cannot write a row as A', 'error 42501', err(await as(B,
  `insert into public.debts (user_id, id, kind, person_name, due_on, opened_on, created_at)
   values ('${A}', 'forged', 'one_time', 'X', current_date, current_date, ${T})`)));
check("B reusing A's id makes B's own row, A's is untouched", 'ok (1 rows)', err(await as(B,
  `insert into public.debts (id, kind, person_name, due_on, opened_on, created_at)
   values ('d1', 'one_time', 'B own', current_date, current_date, ${T})
   on conflict (user_id, id) do update set person_name = excluded.person_name`)));
check("A's d1 still says Test Friend", 'Test Friend', (await su(`select person_name from public.debts where user_id = $1 and id = 'd1'`, [A]))[0].person_name);
check("B cannot hang a payment on A's debt", 'error 23503', err(await as(B,
  `insert into public.debt_lines (id, debt_id, kind, amount_centavos, on_date, created_at)
   values ('x1', 'd2', 'payment', 100, current_date, ${T})`)));
check("B cannot link its debt to A's QR", 'error 23503', err(await as(B,
  `insert into public.debts (id, kind, person_name, due_on, opened_on, qr_id, created_at)
   values ('d9', 'one_time', 'X', current_date, current_date, 'qr1', ${T})`)));
check("B cannot upload into A's folder", 'error 42501', err(await as(B,
  `insert into storage.objects (bucket_id, name, owner) values ('qr', '${A}/qr1-b.png', '${B}')`)));
check("B cannot delete A's QR file", 'ok (0 rows)', err(await as(B, `delete from storage.objects where name = '${A}/qr1.png'`)));
check("B cannot rename A's QR file", 'ok (0 rows)', err(await as(B, `update storage.objects set name = '${B}/stolen.png' where name = '${A}/qr1.png'`)));

// ---------- Signed-out visitor ----------
for (const t of tables) {
  check(`anon cannot read ${t}`, 'error 42501', err(await as('anon', `select * from public.${t}`)));
}
check('anon sees no QR files', '0 rows', rows(await as('anon', `select * from storage.objects`)));
check('anon cannot add a debt', 'error 42501', err(await as('anon',
  `insert into public.debts (user_id, id, kind, person_name, due_on, opened_on, created_at)
   values ('${A}', 'anon1', 'one_time', 'X', current_date, current_date, ${T})`)));

// ---------- A's own limits ----------
check('A cannot hard-delete (deletes are soft)', 'error 42501', err(await as(A, `delete from public.debts where id = 'd1'`)));
check('A cannot TRUNCATE (it ignores RLS)', 'error 42501', err(await as(A, `truncate public.debt_lines`)));
check("A cannot move a row to B", 'error 42501', err(await as(A, `update public.debts set user_id = '${B}' where id = 'd2'`)));
check("A cannot change a row's id", 'error 42501', err(await as(A, `update public.debts set id = 'd2x' where id = 'd2'`)));
check('A can soft-delete', 'ok (1 rows)', err(await as(A, `update public.debt_lines set deleted = true where id = 'l3'`)));
await as(A, `update public.debt_lines set updated_at = '2000-01-01', note = 'y' where id = 'l3'`);
check('updated_at comes from the server, not the phone', 'false', (await su(`select updated_at < now() - interval '1 day' as old from public.debt_lines where id = 'l3'`))[0]?.old);
check("A cannot change a leaf row's id", 'error 42501', err(await as(A, `update public.push_subscriptions set id = 'p1x' where id = 'p1'`)));
check('Anonymous sign-ins cannot add rows', 'error 42501', err(await as(A,
  `insert into public.debts (id, kind, person_name, due_on, opened_on, created_at) values ('anon2', 'one_time', 'X', current_date, current_date, ${T})`,
  [], { claims: { is_anonymous: true } })));
check('A fake time zone is refused', 'error 23514', err(await as(A, `update public.user_settings set time_zone = 'Mars/Base'`)));
check('A real time zone is fine', 'ok (1 rows)', err(await as(A, `update public.user_settings set time_zone = 'Asia/Tokyo'`)));

// ---------- Swap protection ----------
check("A cannot swap a QR's picture in place", 'error 42501', err(await as(A, `update public.qr_items set payload_sha256 = repeat('b', 64) where id = 'qr1'`)));
const added0 = (await su(`select added_at from public.qr_items where user_id = $1 and id = 'qr1'`, [A]))[0].added_at;
check("A back-dating a QR's added_at is quietly ignored", 'ok (1 rows)', err(await as(A, `update public.qr_items set added_at = '2020-01-01' where id = 'qr1'`)));
check("...and added_at is unchanged", 'true', +(await su(`select added_at from public.qr_items where user_id = $1 and id = 'qr1'`, [A]))[0].added_at === +added0);
check('A can still rename a QR label', 'ok (1 rows)', err(await as(A, `update public.qr_items set label = 'Lender main' where id = 'qr1'`)));
await as(A, `insert into public.qr_items (id, label, wallet, storage_path, payload_sha256, added_at, created_at)
             values ('qr2', 'Old one', 'maya', '${A}/qr2.png', repeat('d', 64), '2020-01-01', ${T})`);
check('A QR insert ignores a phone-sent added_at', 'true', (await su(`select added_at > now() - interval '1 minute' as fresh from public.qr_items where id = 'qr2'`))[0]?.fresh);
check('QR path must be <user_id>/<id>.png', 'error 23514', err(await as(A,
  `insert into public.qr_items (id, label, wallet, storage_path, payload_sha256, created_at)
   values ('qr3', 'X', 'gcash', '${A}/other.png', repeat('e', 64), ${T})`)));
check('A cannot upload a file with no QR row', 'error 42501', err(await as(A,
  `insert into storage.objects (bucket_id, name, owner) values ('qr', '${A}/random.png', '${A}')`)));
check('A cannot rename a QR file (no update rule)', 'ok (0 rows)', err(await as(A, `update storage.objects set name = '${A}/qr2.png' where name = '${A}/qr1.png'`)));
check('A cannot remove the picture of a live QR', 'ok (0 rows)', err(await as(A, `delete from storage.objects where name = '${A}/qr1.png'`)));
check('A can sign in and download its own QR (download is allowed)', '1 rows', rows(await as(A, `select name from storage.objects where name = '${A}/qr1.png'`, [], { op: 'storage.object.get' })));
check('A cannot mint a signed link to its own QR', '0 rows', rows(await as(A, `select name from storage.objects where name = '${A}/qr1.png'`, [], { op: 'storage.object.sign' })));
check('A cannot mint signed links in bulk either', '0 rows', rows(await as(A, `select name from storage.objects where name = '${A}/qr1.png'`, [], { op: 'storage.object.sign_many' })));

// ---------- Saved copies (migration 0004): only WHEN, from the server clock ----------
const fresh = async (col, id) => (await su(`select ${col} > now() - interval '1 minute' as f from public.qr_items where user_id = $1 and id = $2`, [A, id]))[0]?.f;
check('A marking "copy saved" with an old date is accepted', 'ok (1 rows)', err(await as(A, `update public.qr_items set last_copy_saved_at = '2020-01-01' where id = 'qr1'`)));
check('...but the server stamps its own time, not 2020', 'true', await fresh('last_copy_saved_at', 'qr1'));
await as(A, `update public.qr_items set last_copy_saved_at = null where id = 'qr1'`);
check('A cannot clear the copy date', 'true', await fresh('last_copy_saved_at', 'qr1'));
await as(A, `insert into public.qr_items (id, label, wallet, storage_path, payload_sha256, created_at, last_copy_saved_at, old_copy_saved_at)
             values ('qr4', 'New', 'gcash', '${A}/qr4.png', repeat('f', 64), ${T}, '2020-01-01', '2020-01-01')`);
check('A new QR cannot arrive with copy dates of its own', 'null null', (await su(`select last_copy_saved_at, old_copy_saved_at from public.qr_items where user_id = $1 and id = 'qr4'`, [A])).map((r) => `${r.last_copy_saved_at} ${r.old_copy_saved_at}`)[0]);
await as(A, `insert into public.qr_items (id, label, wallet, storage_path, payload_sha256, created_at, replaces_id)
             values ('qr5', 'Replacement', 'gcash', '${A}/qr5.png', repeat('a', 64), ${T}, 'qr1')`);
const carried = async () => (await su(`select n.old_copy_saved_at = o.last_copy_saved_at as same from public.qr_items n, public.qr_items o
  where n.user_id = $1 and o.user_id = $1 and n.id = 'qr5' and o.id = 'qr1'`, [A]))[0]?.same;
check("A replacing QR carries the old QR's copy date", 'true', await carried());
await as(A, `update public.qr_items set replaces_id = null, old_copy_saved_at = null where id = 'qr5'`);
check('...and A cannot erase it later', 'true', await carried());

// Back-date with triggers off (superuser, replica mode), as if the stamps were set long ago.
const backdate = async (sql) => { await db.exec(`set session_replication_role = replica`); await su(sql, [A]); await db.exec(`set session_replication_role = origin`); };
await backdate(`update public.debts set qr_linked_at = '2020-01-01' where user_id = $1 and id = 'd1'`);
const stamp0 = (await su(`select qr_linked_at from public.debts where user_id = $1 and id = 'd1'`, [A]))[0].qr_linked_at;
check('Phone cannot reset qr_linked_at', 'ok (1 rows)', err(await as(A, `update public.debts set qr_linked_at = null, note = 'x' where id = 'd1'`)));
const stamp1 = (await su(`select qr_linked_at from public.debts where user_id = $1 and id = 'd1'`, [A]))[0].qr_linked_at;
check('qr_linked_at survived the reset attempt (still the old date)', 'true', stamp1 !== null && +stamp1 === +stamp0 && +stamp0 < Date.now() - 365 * 864e5);
await as(A, `update public.debts set qr_id = 'qr2' where id = 'd1'`);
const stamp2 = (await su(`select qr_linked_at from public.debts where user_id = $1 and id = 'd1'`, [A]))[0].qr_linked_at;
check('Linking a different QR re-stamps qr_linked_at', 'true', stamp2 > new Date(Date.now() - 60000));

// Kenshin F1: the silent swap. An old QR: soft-delete it, remove its file, un-delete it, upload a new picture.
await backdate(`update public.qr_items set added_at = now() - interval '2 days' where user_id = $1 and id = 'qr1'`);
check('Swap step 1: soft-delete the old QR', 'ok (1 rows)', err(await as(A, `update public.qr_items set deleted = true where id = 'qr1'`)));
check('Swap step 2: its file may now be removed', 'ok (1 rows)', err(await as(A, `delete from storage.objects where name = '${A}/qr1.png'`)));
check('Swap step 3: un-delete the row (allowed)', 'ok (1 rows)', err(await as(A, `update public.qr_items set deleted = false where id = 'qr1'`)));
check('Swap step 4: a new picture for an old QR is refused', 'error 42501', err(await as(A,
  `insert into storage.objects (bucket_id, name, owner) values ('qr', '${A}/qr1.png', '${A}')`)));
check("A fresh QR's own picture uploads fine", 'ok (1 rows)', err(await as(A,
  `insert into storage.objects (bucket_id, name, owner) values ('qr', '${A}/qr2.png', '${A}')`)));
await as(A, `insert into public.qr_items (id, label, wallet, storage_path, payload_sha256, created_at) values ('qr4', 'X', 'gcash', '${A}/qr4.png', repeat('e', 64), ${T})`);
await as(A, `update public.qr_items set deleted = true where id = 'qr4'`);
check('No upload for a soft-deleted QR', 'error 42501', err(await as(A,
  `insert into storage.objects (bucket_id, name, owner) values ('qr', '${A}/qr4.png', '${A}')`)));

// ---------- Input rules ----------
check('Bidi-override in a name is refused', 'error 23514', err(await as(A,
  `insert into public.debts (id, kind, person_name, due_on, opened_on, created_at)
   values ('d5', 'one_time', E'Test \u202ELender', current_date, current_date, ${T})`)));
check('Owed-to-me is not in v1', 'error 23514', err(await as(A,
  `insert into public.debts (id, direction, kind, person_name, due_on, opened_on, created_at)
   values ('d6', 'owed_to_me', 'one_time', 'X', current_date, current_date, ${T})`)));
check('Installments debt cannot carry its own due date', 'error 23514', err(await as(A,
  `insert into public.debts (id, kind, person_name, due_on, opened_on, created_at)
   values ('d7', 'installments', 'X', current_date, current_date, ${T})`)));
check('A one-time debt may have no due date ("pay when I can")', 'ok (1 rows)', err(await as(A,
  `insert into public.debts (id, kind, person_name, opened_on, created_at) values ('d8', 'one_time', 'Test Tab', current_date, ${T})`)));
check('A "+ added" line is accepted', 'ok (1 rows)', err(await as(A,
  `insert into public.debt_lines (id, debt_id, kind, amount_centavos, on_date, created_at) values ('l8', 'd8', 'addition', 2500, current_date, ${T})`)));
check('Zero or negative money is refused', 'error 23514', err(await as(A,
  `insert into public.debt_lines (id, debt_id, kind, amount_centavos, on_date, created_at) values ('l9', 'd2', 'payment', -500, current_date, ${T})`)));
check('Push endpoint must be a known push service', 'error 23514', err(await as(A,
  `insert into public.push_subscriptions (id, endpoint, p256dh, auth_secret, created_at)
   values ('p2', 'https://evil.example/collect', repeat('B', 60), repeat('c', 16), ${T})`)));
check('Lookalike push host is refused', 'error 23514', err(await as(A,
  `insert into public.push_subscriptions (id, endpoint, p256dh, auth_secret, created_at)
   values ('p3', 'https://fcm.googleapis.com.evil.example/x', repeat('B', 60), repeat('c', 16), ${T})`)));

check('Any Apple push host is accepted', 'ok (1 rows)', err(await as(A,
  `insert into public.push_subscriptions (id, endpoint, p256dh, auth_secret, created_at)
   values ('p4', 'https://web.push.apple.com/QFake-token', repeat('B', 60), repeat('c', 16), ${T})`)));

// ---------- Row cap (open sign-up) ----------
const values = Array.from({ length: 28 }, (_, i) => `('c${i}', 'Cap ${i}', 'other', '${B}/c${i}.png', repeat('f', 64), ${T})`).join(',');
check('B can make 28 QRs', 'ok (28 rows)', err(await as(B, `insert into public.qr_items (id, label, wallet, storage_path, payload_sha256, created_at) values ${values}`)));
check('B can make QR 29 and 30', 'ok (2 rows)', err(await as(B, `insert into public.qr_items (id, label, wallet, storage_path, payload_sha256, created_at) values
  ('c28','x','other','${B}/c28.png',repeat('f',64),${T}), ('c29','x','other','${B}/c29.png',repeat('f',64),${T})`)));
check('B cannot make QR 31', 'error 54000', err(await as(B, `insert into public.qr_items (id, label, wallet, storage_path, payload_sha256, created_at) values ('c30','x','other','${B}/c30.png',repeat('f',64),${T})`)));
check('At the cap, a sync upsert of an existing QR still works', 'ok (1 rows)', err(await as(B,
  `insert into public.qr_items (id, label, wallet, storage_path, payload_sha256, added_at, created_at)
   values ('c5', 'Renamed by sync', 'other', '${B}/c5.png', repeat('f', 64), '2020-01-01', ${T})
   on conflict (user_id, id) do update set label = excluded.label, added_at = excluded.added_at`)));
check('...and the upsert could not back-date it', 'true',
  (await su(`select added_at > now() - interval '1 minute' as fresh from public.qr_items where user_id = $1 and id = 'c5'`, [B]))[0]?.fresh);

// ---------- Exactly the intended rules exist (catches a rule added by hand in the dashboard) ----------
const pol = async (b) => (await su(`select cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like $1 order by cmd`, [b + ':%'])).map((r) => r.cmd).join(',');
check('QR storage rules are exactly read, add, remove (no update: a QR is never overwritten)', 'DELETE,INSERT,SELECT', await pol('qr'));
check('Photo storage rules are read, add, change, remove (a new photo may replace the old)', 'DELETE,INSERT,SELECT,UPDATE', await pol('photos'));
check('No storage rule other than those two buckets', '7', (await su(`select count(*)::int n from pg_policies where schemaname = 'storage' and tablename = 'objects'`))[0].n);
const pub = (await su(`select count(*)::int as n, (count(*) filter (where cmd in ('DELETE', 'ALL')))::int as bad,
  (count(*) filter (where 'anon' = any(roles) or 'public' = any(roles)))::int as open from pg_policies where schemaname = 'public'`))[0];
check('Table rules: 3 per table (8 tables), no delete, none for anon', '24 0 0', `${pub.n} ${pub.bad} ${pub.open}`);
const noRls = (await su(`select string_agg(relname, ',') as t from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not (c.relrowsecurity and c.relforcerowsecurity)`))[0].t;
check('Every public table has RLS on and forced', 'null', String(noRls));

// ---------- Bucket and account deletion ----------
const bucket = (await su(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'qr'`))[0];
check('QR bucket is private, 256 KB, png only', 'false 262144 image/png', `${bucket.public} ${bucket.file_size_limit} ${bucket.allowed_mime_types.join(',')}`);
await su(`delete from auth.users where id = $1`, [A]);
const left = (await su(`select (select count(*) from public.debts where user_id = $1) + (select count(*) from public.debt_lines where user_id = $1)
  + (select count(*) from public.qr_items where user_id = $1) + (select count(*) from public.installments where user_id = $1)
  + (select count(*) from public.user_settings where user_id = $1) + (select count(*) from public.push_subscriptions where user_id = $1) as n`, [A]))[0].n;
check("Deleting A's account removes all A's rows", '0', left);
check("...but NOT A's QR file: account deletion must remove files through the Storage API first", '1',
  (await su(`select count(*)::int as n from storage.objects where name like $1`, [`${A}/%`]))[0].n);
check("B's data is unaffected", '30', (await su(`select count(*)::int as n from public.qr_items where user_id = $1`, [B]))[0].n);

// ---------- Report ----------
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `  (expected ${r.expected}, got ${r.actual})`}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
