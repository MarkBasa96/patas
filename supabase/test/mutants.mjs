// Proves the privacy test can fail: breaks schema.sql one rule at a time and expects run-local.mjs
// to catch each break. A mutant that "survives" (all tests still pass) means a rule is untested.
//   node supabase/test/mutants.mjs
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const original = readFileSync(join(here, '..', 'schema.sql'), 'utf8');

const mutants = [
  ['RLS not switched on', "execute format('alter table public.%I enable row level security', t);", '-- removed'],
  ['read policy open to everyone signed in', "using ((select auth.uid()) = user_id)', t);\n    -- Anonymous", "using (true)', t);\n    -- Anonymous"],
  ['insert check missing', `with check ((select auth.uid()) = user_id\n`, `with check (true\n`],
  ['anonymous sign-ins may add rows', `and coalesce(((select auth.jwt()) ->> ''is_anonymous'')::boolean, false) = false)', t);`, `)', t);`],
  ['anon keeps its default grants', "execute format('revoke all on public.%I from anon, public', t);", '-- removed'],
  ['authenticated keeps TRUNCATE and DELETE', "execute format('revoke all on public.%I from authenticated', t);", '-- removed'],
  ['row key may change', "raise exception 'row key cannot change'", "raise notice 'row key cannot change'"],
  ['QR picture may change in place', "raise exception 'a QR cannot be changed in place; add a new one'", "raise notice 'x'"],
  ['phone may set added_at', 'new.added_at := now();', 'null;'],
  ['phone may reset qr_linked_at', 'new.qr_linked_at := old.qr_linked_at;', 'null;'],
  ['phone may change added_at on update', 'new.added_at := old.added_at;', 'null;'],
  ['relinking a QR does not re-stamp', `elsif new.qr_id is distinct from old.qr_id then\n    new.qr_linked_at := case when new.qr_id is null then null else now() end;`, `elsif false then\n    null;`],
  ['phone sets updated_at', 'new.updated_at := now();', 'null;'],
  ['fake time zones accepted', "raise exception 'unknown time zone'", "raise notice 'x'"],
  ['cap counts upserts of existing rows', 'if already then\n    return new;\n  end if;', ''],
  ['no same-user foreign key on lines (cross-user links)', 'foreign key (user_id, debt_id) references public.debts (user_id, id),\n  constraint debt_lines_charge_kind', 'constraint debt_lines_charge_kind'],
  ['storage read checks bucket only', `for select to authenticated\n  using (\n    bucket_id = 'qr'\n    and (storage.foldername(name))[1] = (select auth.uid())::text`, `for select to authenticated\n  using (\n    bucket_id = 'qr'`],
  ['signed links may be minted', `and not storage.allow_any_operation(array['object.sign', 'object.sign_many', 'render.image_sign'])`, ''],
  ['storage upload without a QR row', 'and exists (\n      select 1 from public.qr_items q', 'and true or exists (\n      select 1 from public.qr_items q'],
  ['upload for a soft-deleted QR row', `and q.storage_path = objects.name and not q.deleted\n        and q.added_at`, `and q.storage_path = objects.name\n        and q.added_at`],
  ['old QR may get a new picture (silent swap)', `and q.added_at > now() - interval '1 day'`, ''],
  ['live QR picture may be removed', `and not exists (\n      select 1 from public.qr_items q`, `and true or not exists (\n      select 1 from public.qr_items q`],
  ['storage update policy added', '-- Deliberately NO update policy', `drop policy if exists "qr: change own" on storage.objects; create policy "qr: change own" on storage.objects for update to authenticated using (bucket_id = 'qr' and (storage.foldername(name))[1] = (select auth.uid())::text);\n--`],
  ['bucket public', "false, 262144, array['image/png'])\non conflict (id) do update\n  set public = false,", "true, 262144, array['image/png'])\non conflict (id) do update\n  set public = true,"],
  ['no bidi check', "and t !~ ('[' || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || chr(8206) || chr(8207) || ']')\n$$;\n\n-- A note", "\n$$;\n\n-- A note"],
  ['push host not pinned', "endpoint ~ '^https://(fcm", "endpoint ~ '^https://(.*|fcm"],
  ['no row cap', "if n >= cap then", 'if false then'],
  ['phone may back-date a saved copy', 'new.last_copy_saved_at := now();\n    else', 'null;\n    else'],
  ['phone may clear a saved-copy date', 'new.last_copy_saved_at := old.last_copy_saved_at;', 'null;'],
  ['new QR may arrive with a copy date', 'new.last_copy_saved_at := null;\n    new.old_copy_saved_at := case', 'new.old_copy_saved_at := case'],
  ['replacing QR does not carry the old copy date', '(select q.last_copy_saved_at from public.qr_items q where q.user_id = new.user_id and q.id = new.replaces_id)', 'new.old_copy_saved_at'],
  ['carried copy date may be erased', 'new.old_copy_saved_at := old.old_copy_saved_at;', 'null;'],
  ['money may be negative', 'amount_centavos bigint not null check (amount_centavos between 1 and 99999999999),\n  on_date', 'amount_centavos bigint not null,\n  on_date'],
  // Phase 6f: reminders and MPIN, checked by run-6f.mjs
  ['sender secret not checked', "if p_secret is null or p_secret is distinct from", "if false and p_secret is distinct from", '6f'],
  ['sender open to signed-in people', "public.reminder_vapid(), public.reminder_vapid_init(text, text) to service_role;", "public.reminder_vapid(), public.reminder_vapid_init(text, text) to service_role, authenticated;", '6f'],
  // Once a day has two guards: the "not exists" filter (sequential runs) and the claim's "if not found"
  // (two runs racing). Each covers the other for sequential runs, so this mutant removes both. The race
  // alone can't be staged in PGlite (one connection); it is checked on the real project (two parallel calls).
  ['digest twice a day (both once-a-day guards)', [["and not exists (select 1 from private.reminder_sent_debt x\n                            where x.user_id = r.user_id and x.debt_id = e.debt_id and x.local_date = r.today)", "and true"], ["on conflict do nothing\n        returning debt_id", "on conflict (user_id, debt_id, local_date) do update set sent_at = now()\n        returning debt_id"]], null, '6f'],
  ['payments ignored for installments', "select p.debt_id, p.due_on from plan p left join credits c on c.debt_id = p.debt_id\n     where coalesce(c.c, 0) < p.upto", "select p.debt_id, p.due_on from plan p left join credits c on c.debt_id = p.debt_id\n     where true", '6f'],
  ['payments ignored for one-time debts', "and coalesce(b.d, 0) > coalesce(c.c, 0)", "", '6f'],
  ['debts with reminders off included', "and d.settled_on is null and d.remind", "and d.settled_on is null", '6f'],
  ['settled debts included', "and d.settled_on is null and d.remind", "and d.remind", '6f'],
  ['deleted payments still pay', "where l.user_id = p_uid and not l.deleted\n       and (l.kind in", "where l.user_id = p_uid\n       and (l.kind in", '6f'],
  ["server clock instead of the person's time zone", "(p_now at time zone s.time_zone)::time as now_t", "(p_now at time zone 'UTC')::time as now_t", '6f'],
  ['push keys replaceable', "if exists (select 1 from vault.secrets where name = 'patas_vapid_public') then return '{\"result\":\"exists\"}'; end if;", "", '6f'],
  ['test reminder unlimited', "\n   where private.reminder_test.asked_at < now() - interval '2 minutes';", ";", '6f'],
  ["test reminder returns other people's phones", "from public.push_subscriptions p where p.user_id = uid and not p.deleted));", "from public.push_subscriptions p where not p.deleted));", '6f'],
  ['MPIN never locks', "locked_at = case when fails + 1 >= 5 then now() end", "locked_at = null", '6f'],
  ['MPIN lock not enforced', "if r.locked_at is not null then return jsonb_build_object('result', 'locked'); end if;", "", '6f'],
  ['MPIN without the pepper', "select extensions.crypt(private.pin_mac(p_uid, p_pin), extensions.gen_salt('bf', 8))", "select extensions.crypt(p_pin, extensions.gen_salt('bf', 8))", '6f'],
  ['weak MPIN allowed', "if private.pin_weak(p_pin) then return '{\"result\":\"weak\"}'; end if;", "", '6f'],
  ['MPIN set overwrites an existing one', "where private.account_pin.enabled = false\n  returning", "returning", '6f'],
  ['MPIN reset without an email code', "if not private.can_reset(case when found then r.locked_at end) then return '{\"result\":\"stale_code\"}'; end if;", "", '6f'],
  ['MPIN reset with an old code', "private.otp_at() >= now() - interval '10 minutes'", "true", '6f'],
  ['MPIN reset with any sign-in method', "\n   where a->>'method' = 'otp'", "", '6f'],
  ['MPIN change without the current PIN', "c := private.pin_check(uid, p_old);\n  if c->>'result' <> 'ok' then return c; end if;", "", '6f'],
  ['MPIN off without the current PIN', "c := private.pin_check(uid, p_pin);\n  if c->>'result' <> 'ok' then return c; end if;\n  update private.account_pin\n     set enabled = false", "update private.account_pin\n     set enabled = false", '6f'],
  ['offline wrong tries ignored', "if p_n is null or p_n < 1 then return", "if true then return", '6f'],
  ["one person's broken data stops everyone (audit L-4)", "exception when others then\n      null; -- skipped", "exception when division_by_zero then\n      null; -- skipped", '6f'],
  ['a shared phone gets both accounts (audit L-7)', "and not o.deleted and o.updated_at > p.updated_at)", "and false)", '6f'],
  ['digests for people with no phone', "     where s.reminders_on\n       and exists (select 1 from private.live_subs(s.user_id))", "     where s.reminders_on", '6f'],
  // round 4 (suite r4: run-r4.mjs; each pair is applied to schema.sql and to migrations/0007 wherever it is found)
  ['reminder days ignored', "where (u.due_on - p_day) = any (lv.remind_days)", "where (u.due_on - p_day) in (0, 1)", 'r4'],
  ["a debt's own time ignored", "where coalesce(d.remind_at, r.reminder_at) <= r.now_t", "where r.reminder_at <= r.now_t", 'r4'],
  ['extra date reminds even when paid', "where lv.remind_on = p_day and exists (select 1 from unpaid u where u.debt_id = lv.id)", "where lv.remind_on = p_day", 'r4'],
  ['recurring prepayments ignored', "select r.debt_id, r.due_on from rec r left join credits c on c.debt_id = r.debt_id\n     where coalesce(c.c, 0) < r.upto", "select r.debt_id, r.due_on from rec r left join credits c on c.debt_id = r.debt_id\n     where true", 'r4'],
  ['recurring end date ignored', "\n       and (lv.recurring_until is null or g.due_on <= lv.recurring_until)", "", 'r4'],
  ['recurring dates stepped wrong (months as 30 days)', "else (lv.recurring_first + make_interval(months => s.n))::date end as due_on", "else lv.recurring_first + 30 * s.n end as due_on", 'r4'],
  ['recurring debt without its fields', "(kind = 'recurring') = (recurring_amount_centavos is not null and recurring_every is not null and recurring_first is not null)", "true", 'r4'],
  ['other kinds may carry recurring fields', "and (kind = 'recurring' or (recurring_amount_centavos is null and recurring_every is null and recurring_first is null and recurring_until is null))", "", 'r4'],
  ['reminder days any number', "remind_days <@ array[0, 1, 3, 7]::smallint[] and ", "", 'r4'],
  ['currency any text', [["  currency     text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),\n  -- Recurring", "  currency     text not null default 'PHP',\n  -- Recurring"], ["add column if not exists currency text not null default 'PHP' check (currency ~ '^[A-Z]{3}$');", "add column if not exists currency text not null default 'PHP';"]], null, 'r4'],
  ['month id any text', "check (id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$')", "check (true)", 'r4'],
  ['negative income allowed', "income_centavos   bigint not null default 0 check (income_centavos between 0 and 99999999999)", "income_centavos   bigint not null default 0", 'r4'],
  ['photo id not tied to the name', "or (id = 'p-' || left(encode(extensions.digest(person_key, 'sha256'), 'hex'), 16) and person_key <> ''))", "or (person_key <> ''))", 'r4'],
  ['photo row may point anywhere', "constraint photos_path check (storage_path = user_id::text || '/' || id || '.jpg'),", "", 'r4'],
  ['photo upload without a photos row', "and exists (select 1 from public.photos p where p.user_id = (select auth.uid()) and p.storage_path = objects.name and not p.deleted)\n  );\ncreate policy \"photos: change own\"", ");\ncreate policy \"photos: change own\"", 'r4'],
  ['photo files readable by anyone signed in', "bucket_id = 'photos'\n    and (storage.foldername(name))[1] = (select auth.uid())::text\n    and not storage.allow_any_operation", "bucket_id = 'photos'\n    and not storage.allow_any_operation", 'r4'],
  ['photo links may be minted', "    bucket_id = 'photos'\n    and (storage.foldername(name))[1] = (select auth.uid())::text\n    and not storage.allow_any_operation(array['object.sign', 'object.sign_many', 'render.image_sign'])", "    bucket_id = 'photos'\n    and (storage.foldername(name))[1] = (select auth.uid())::text", 'r4'],
  ['photos bucket public', [["values ('photos', 'photos', false, 65536", "values ('photos', 'photos', true, 65536"], ["set public = false, file_size_limit = 65536", "set public = true, file_size_limit = 65536"]], null, 'r4'],
  ["photo files changeable in others' folders", "for update to authenticated\n  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text)", "for update to authenticated\n  using (bucket_id = 'photos')", 'r4'],
  ["photo files removable in others' folders", "for delete to authenticated\n  using (bucket_id = 'photos' and (storage.foldername(name))[1] = (select auth.uid())::text);", "for delete to authenticated\n  using (bucket_id = 'photos');", 'r4'],
  ['greeting name any text', "display_name text not null default '' check (public.patas_clean_line(display_name, 40))", "display_name text not null default ''", 'r4'],
  ["this month's cash flow not carried over", "where s.cashflow_income_centavos > 0 or s.cashflow_expenses_centavos > 0", "where false", 'r4'],
  ['old debts lose the old reminder days', [["remind_days  smallint[] not null default '{0,1}'", "remind_days  smallint[] not null default '{}'"], ["add column if not exists remind_days smallint[] not null default '{0,1}'", "add column if not exists remind_days smallint[] not null default '{}'"]], null, 'r4'],
  ['PIN table readable', "revoke all on private.account_pin from public, anon, authenticated;", "grant usage on schema private to authenticated; grant select on private.account_pin to authenticated;", '6f'],
];


const dir = mkdtempSync(join(tmpdir(), 'patas-mutants-'));
const migration = readFileSync(join(here, '..', 'migrations', '0007_round4.sql'), 'utf8');
let survived = 0;
// MUTANT_ONLY="name one|name two" runs just those (to re-check a fix quickly); a full run is the real proof.
const only = process.env.MUTANT_ONLY ? process.env.MUTANT_ONLY.split('|') : null;
for (const [name, from, to, suite] of only ? mutants.filter((m) => only.some((o) => m[0].includes(o))) : mutants) {
  const pairs = Array.isArray(from) ? from : [[from, to]];
  const inMig = suite === 'r4';
  if (pairs.some(([f]) => !original.includes(f) && !(inMig && migration.includes(f)))) { console.log(`SKIP  ${name} (pattern not found: fix mutants.mjs)`); survived++; continue; }
  let s = original, m = migration;
  for (const [f, t] of pairs) { s = s.replace(f, () => t); if (inMig) m = m.replace(f, () => t); }
  const file = join(dir, 'schema.sql'), mfile = join(dir, '0007.sql');
  writeFileSync(file, s); writeFileSync(mfile, m);
  const script = suite === '6f' ? 'run-6f.mjs' : suite === 'r4' ? 'run-r4.mjs' : 'run-local.mjs';
  const r = spawnSync(process.execPath, [join(here, script)], { env: { ...process.env, PATAS_SCHEMA: file, PATAS_0007: mfile }, encoding: 'utf8' });
  const fails = (r.stdout.match(/^FAIL .*$/gm) || []).filter((l) => !(inMig && /Upgraded == fresh/.test(l)));
  const crashed = r.status !== 0 && fails.length === 0 && !(r.stdout.match(/^FAIL .*$/gm) || []).length;
  if (r.status === 0 || (inMig && !fails.length && !crashed)) { survived++; console.log(`SURVIVED  ${name}`); }
  else console.log(`caught    ${name}: ${crashed ? 'schema/test crashed: ' + (r.stderr.split('\n').find((l) => /error/i.test(l)) || '').slice(0, 90) : fails.length + ' check(s) failed, e.g. ' + fails[0].slice(6, 90)}`);
}
rmSync(dir, { recursive: true, force: true });
console.log(`\n${mutants.length - survived}/${mutants.length} mutants caught`);
process.exit(survived ? 1 : 0);
