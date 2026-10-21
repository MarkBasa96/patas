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
  ['digest twice a day', [["private.reminder_sent x\n                        where x.user_id", "private.reminder_sent x\n                        where false and x.user_id"],
    ["on conflict do nothing;\n      if not found then continue; end if;", "on conflict do nothing;"]], null, '6f'],
  ['payments ignored for installments', "where p.due_on = p_day and coalesce(c.c, 0) < p.upto", "where p.due_on = p_day", '6f'],
  ['payments ignored for one-time debts', "and coalesce(b.d, 0) > coalesce(c.c, 0)", "", '6f'],
  ['debts with reminders off included', "and d.settled_on is null and d.remind", "and d.settled_on is null", '6f'],
  ['settled debts included', "and d.settled_on is null and d.remind", "and d.remind", '6f'],
  ['deleted payments still pay', "where l.user_id = p_uid and not l.deleted\n       and (l.kind in", "where l.user_id = p_uid\n       and (l.kind in", '6f'],
  ["server clock instead of the person's time zone", "(p_now at time zone s.time_zone)::time >= s.reminder_at", "(p_now at time zone 'UTC')::time >= s.reminder_at", '6f'],
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
  ['PIN table readable', "revoke all on private.account_pin from public, anon, authenticated;", "grant usage on schema private to authenticated; grant select on private.account_pin to authenticated;", '6f'],
];


const dir = mkdtempSync(join(tmpdir(), 'patas-mutants-'));
let survived = 0;
for (const [name, from, to, suite] of mutants) {
  const pairs = Array.isArray(from) ? from : [[from, to]];
  if (pairs.some(([f]) => !original.includes(f))) { console.log(`SKIP  ${name} (pattern not found: fix mutants.mjs)`); survived++; continue; }
  let s = original;
  for (const [f, t] of pairs) s = s.replace(f, () => t);
  const file = join(dir, 'schema.sql');
  writeFileSync(file, s);
  const r = spawnSync(process.execPath, [join(here, suite === '6f' ? 'run-6f.mjs' : 'run-local.mjs')], { env: { ...process.env, PATAS_SCHEMA: file }, encoding: 'utf8' });
  const fails = (r.stdout.match(/^FAIL .*$/gm) || []);
  const crashed = r.status !== 0 && fails.length === 0;
  if (r.status === 0) { survived++; console.log(`SURVIVED  ${name}`); }
  else console.log(`caught    ${name}: ${crashed ? 'schema/test crashed: ' + (r.stderr.split('\n').find((l) => /error/i.test(l)) || '').slice(0, 90) : fails.length + ' check(s) failed, e.g. ' + fails[0].slice(6, 90)}`);
}
rmSync(dir, { recursive: true, force: true });
console.log(`\n${mutants.length - survived}/${mutants.length} mutants caught`);
process.exit(survived ? 1 : 0);
