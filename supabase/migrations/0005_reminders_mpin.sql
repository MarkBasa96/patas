-- ---------------------------------------------------------------------------------------------
-- 5. Reminders (Phase 6f). One short digest per person per day, at their own time, in their own
-- time zone, for what is due today or tomorrow. Built to SECURITY_DESIGN "Who does what" and
-- Kenshin's 6f conditions. The sender is the Edge Function send-reminders; the 15-minute schedule
-- is migration 0006 (local test Postgres has no pg_cron). Nothing here is reachable by anon.
-- ---------------------------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- "Sent" log the API can't see: at most one digest per person per local day.
create table if not exists private.reminder_sent (
  user_id    uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, local_date)
);
alter table private.reminder_sent enable row level security;
revoke all on private.reminder_sent from public, anon, authenticated;

-- "Send test reminder": at most one per person every 2 minutes.
create table if not exists private.reminder_test (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  asked_at timestamptz not null
);
alter table private.reminder_test enable row level security;
revoke all on private.reminder_test from public, anon, authenticated;

-- Secrets made inside the database, never typed by a person or seen by the app: the cron secret
-- (only the schedule and the sender know it). The push keys are made by the sender on first run.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'patas_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'patas_cron_secret');
  end if;
end $$;

-- What a person has due on one day, counted, never named: installments still not covered by what
-- was paid (same oldest-first rule as the app's balance(): an installment is covered once total
-- credits reach everything due up to and including it), and one-time debts with a pay-by date and
-- something left. Settled, deleted and reminder-off debts are skipped.
create or replace function private.reminder_counts(p_uid uuid, p_day date)
returns table (i_owe int, owed_to_me int)
language sql stable set search_path = '' as $$
  with live as (
    select d.id, d.direction, d.kind, d.due_on from public.debts d
     where d.user_id = p_uid and not d.deleted and d.settled_on is null and d.remind
  ), credits as (
    select l.debt_id, sum(l.amount_centavos) as c from public.debt_lines l
     where l.user_id = p_uid and not l.deleted
       and (l.kind in ('payment', 'writeoff') or (l.kind = 'adjustment' and l.adjust_sign = -1))
     group by l.debt_id
  ), debits as (
    select l.debt_id, sum(l.amount_centavos) as d from public.debt_lines l
     where l.user_id = p_uid and not l.deleted
       and not (l.kind in ('payment', 'writeoff') or (l.kind = 'adjustment' and l.adjust_sign = -1))
     group by l.debt_id
  ), plan as (
    select i.debt_id, i.due_on,
           sum(i.amount_centavos) over (partition by i.debt_id order by i.due_on, i.seq) as upto
      from public.installments i
     where i.user_id = p_uid and not i.deleted
  ), due as (
    select lv.direction from plan p join live lv on lv.id = p.debt_id
      left join credits c on c.debt_id = p.debt_id
     where p.due_on = p_day and coalesce(c.c, 0) < p.upto
    union all
    select lv.direction from live lv
      left join credits c on c.debt_id = lv.id left join debits b on b.debt_id = lv.id
     where lv.kind <> 'installments' and lv.due_on = p_day
       and coalesce(b.d, 0) > coalesce(c.c, 0)
  )
  select count(*) filter (where direction = 'i_owe')::int, count(*) filter (where direction <> 'i_owe')::int from due
$$;

-- The words on the phone. Counts only: no names, no amounts (Kenshin: minimal payload).
create or replace function private.reminder_text(t_owe int, t_get int, m_owe int, m_get int)
returns text language sql immutable set search_path = '' as $$
  select array_to_string(array_remove(array[
    case when t_owe > 0 then 'Due today: ' || t_owe || case when t_owe = 1 then ' payment.' else ' payments.' end end,
    case when m_owe > 0 then 'Due tomorrow: ' || m_owe || case when m_owe = 1 then ' payment.' else ' payments.' end end,
    case when t_get > 0 then 'To collect today: ' || t_get || '.' end,
    case when m_get > 0 then 'To collect tomorrow: ' || m_get || '.' end
  ], null), ' ')
$$;

revoke all on function private.reminder_counts(uuid, date), private.reminder_text(int, int, int, int)
  from public, anon, authenticated;

-- A person's phones that still belong to them: when one browser was signed up under two accounts (a
-- sign-out that never reached the server), only the account that saved it last gets digests there
-- (Kenshin audit L-7). Counts only either way, but a phone should hear about its current account.
create or replace function private.live_subs(p_uid uuid)
returns setof public.push_subscriptions language sql stable set search_path = '' as $$
  select p.* from public.push_subscriptions p
   where p.user_id = p_uid and not p.deleted
     and not exists (select 1 from public.push_subscriptions o
                      where o.endpoint = p.endpoint and o.user_id <> p.user_id and not o.deleted and o.updated_at > p.updated_at)
$$;
revoke all on function private.live_subs(uuid) from public, anon, authenticated;

-- The sender's one call per run (service role only). Claims today's digest for everyone whose
-- reminder time has passed in their own time zone, so a second run (or a racing one) sends nothing.
-- At most once by design: a failed send is not retried that day; better a missed nudge than a spam loop.
create or replace function public.reminder_batch(p_secret text, p_now timestamptz default now())
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare out jsonb := '[]'::jsonb; r record; t record; m record; body text;
begin
  if p_secret is null or p_secret is distinct from
     (select decrypted_secret from vault.decrypted_secrets where name = 'patas_cron_secret') then
    return '{"result":"refused"}';
  end if;
  for r in
    select s.user_id, (p_now at time zone s.time_zone)::date as today
      from public.user_settings s
     where s.reminders_on
       and (p_now at time zone s.time_zone)::time >= s.reminder_at
       and exists (select 1 from private.live_subs(s.user_id))
       and not exists (select 1 from private.reminder_sent x
                        where x.user_id = s.user_id and x.local_date = (p_now at time zone s.time_zone)::date)
  loop
    begin -- one person's broken data never stops everyone else's digest (Kenshin audit L-4)
      select * into t from private.reminder_counts(r.user_id, r.today);
      select * into m from private.reminder_counts(r.user_id, r.today + 1);
      body := private.reminder_text(t.i_owe, t.owed_to_me, m.i_owe, m.owed_to_me);
      if body = '' then continue; end if;
      insert into private.reminder_sent (user_id, local_date) values (r.user_id, r.today) on conflict do nothing;
      if not found then continue; end if;
      out := out || jsonb_build_object('user_id', r.user_id, 'body', body, 'subs',
        (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth_secret)), '[]')
           from private.live_subs(r.user_id) p));
    exception when others then
      null; -- skipped this run; its claim rolled back with it, so the next run tries again
    end;
  end loop;
  return jsonb_build_object('result', 'ok', 'digests', out);
end $$;

-- A push service said this address is gone (404/410): stop using it. Sender (service role) only.
create or replace function public.reminder_gone(p_user uuid, p_id text)
returns jsonb language sql volatile security definer set search_path = '' as $$
  update public.push_subscriptions set deleted = true where user_id = p_user and id = p_id;
  select '{"result":"ok"}'::jsonb
$$;

-- "Send test reminder" (signed-in person, own phones only, once per 2 minutes). Returns only the
-- caller's own live subscriptions, which they can already read; the sender does the sending.
create or replace function public.reminder_test_claim() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return '{"result":"error"}'; end if;
  insert into private.reminder_test (user_id, asked_at) values (uid, now())
  on conflict (user_id) do update set asked_at = now()
   where private.reminder_test.asked_at < now() - interval '2 minutes';
  if not found then return '{"result":"wait"}'; end if;
  return jsonb_build_object('result', 'ok', 'subs',
    (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'endpoint', p.endpoint, 'p256dh', p.p256dh, 'auth', p.auth_secret)), '[]')
       from public.push_subscriptions p where p.user_id = uid and not p.deleted));
end $$;

-- Push keys (VAPID). Made once by the sender with WebCrypto and kept in Vault, so no person ever
-- handles them. The public half is not a secret (every browser that subscribes gets it); the
-- private half never leaves the server. Sender (service role) only.
create or replace function public.reminder_vapid() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'public', (select decrypted_secret from vault.decrypted_secrets where name = 'patas_vapid_public'),
    'private', (select decrypted_secret from vault.decrypted_secrets where name = 'patas_vapid_private'))
$$;

-- Insert only: the first pair wins, so a second or racing call can never replace the keys
-- (replacing them would silently break every phone's subscription).
create or replace function public.reminder_vapid_init(p_public text, p_private text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
begin
  if p_public is null or p_public !~ '^[A-Za-z0-9_-]{86,88}$'
     or p_private is null or char_length(p_private) not between 40 and 400 then
    return '{"result":"bad"}';
  end if;
  perform pg_advisory_xact_lock(hashtext('patas_vapid'));
  if exists (select 1 from vault.secrets where name = 'patas_vapid_public') then return '{"result":"exists"}'; end if;
  perform vault.create_secret(p_private, 'patas_vapid_private');
  perform vault.create_secret(p_public, 'patas_vapid_public');
  return '{"result":"set"}';
end $$;

-- The app asks for the public key when someone turns reminders on. Signed-in people only.
create or replace function public.reminder_public_key() returns text
language sql stable security definer set search_path = '' as $$
  select case when auth.uid() is null then null else
    (select decrypted_secret from vault.decrypted_secrets where name = 'patas_vapid_public') end
$$;

revoke all on function public.reminder_batch(text, timestamptz), public.reminder_gone(uuid, text),
  public.reminder_test_claim(), public.reminder_vapid(), public.reminder_vapid_init(text, text),
  public.reminder_public_key() from public, anon, authenticated;
grant execute on function public.reminder_batch(text, timestamptz), public.reminder_gone(uuid, text),
  public.reminder_vapid(), public.reminder_vapid_init(text, text) to service_role;
grant execute on function public.reminder_test_claim(), public.reminder_public_key() to authenticated;

-- ---------------------------------------------------------------------------------------------
-- 6. Optional app MPIN (SPEC 8, F24). Gastos v3 design reused as is (Kenshin's v3 review and
-- audit): private table, HMAC with a Vault pepper then bcrypt, 5 tries across all phones,
-- server-checked, reset only with a fresh email code. Off by default: no row = no MPIN.
-- ---------------------------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'patas_pin_pepper') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'patas_pin_pepper');
  end if;
end $$;

create table if not exists private.account_pin (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  enabled    boolean not null default true,
  pin_hash   text,
  epoch      uuid not null default gen_random_uuid(),   -- new on every set/change/disable/reset
  fails      int  not null default 0 check (fails between 0 and 5),
  locked_at  timestamptz,
  updated_at timestamptz not null default now(),
  check (enabled = (pin_hash is not null))
);
alter table private.account_pin enable row level security;
revoke all on private.account_pin from public, anon, authenticated;

create or replace function private.pin_mac(p_uid uuid, p_pin text) returns text
language sql stable set search_path = '' as $$
  select encode(extensions.hmac(p_uid::text || ':' || p_pin,
           (select decrypted_secret from vault.decrypted_secrets where name = 'patas_pin_pepper'),
           'sha256'), 'hex')
$$;

-- Same rule as the app's weakPin: 4 digits, not all the same, not a run, not a most-guessed PIN.
create or replace function private.pin_weak(p text) returns boolean
language plpgsql immutable set search_path = '' as $$
declare d int[]; up boolean := true; down boolean := true; i int;
begin
  if p is null or p !~ '^[0-9]{4}$' then return true; end if;
  if p ~ '^(\d)\1{3}$' then return true; end if;
  d := array[substr(p,1,1)::int, substr(p,2,1)::int, substr(p,3,1)::int, substr(p,4,1)::int];
  for i in 2..4 loop
    if d[i] <> (d[i-1] + 1) % 10 then up := false; end if;
    if d[i] <> (d[i-1] + 9) % 10 then down := false; end if;
  end loop;
  return up or down or p = any (array['1212','6969','2580','1004','2000','1122','5683','0852','1010','2020','4545']);
end $$;

create or replace function private.pin_hash(p_uid uuid, p_pin text) returns text
language sql volatile set search_path = '' as $$
  select extensions.crypt(private.pin_mac(p_uid, p_pin), extensions.gen_salt('bf', 8))
$$;

-- The ONE place a PIN is checked and counted. Never raises for a wrong PIN (that would roll back the count).
create or replace function private.pin_check(p_uid uuid, p_pin text) returns jsonb
language plpgsql volatile set search_path = '' as $$
declare r private.account_pin; ok boolean;
begin
  select * into r from private.account_pin where user_id = p_uid for update;
  if not found or not r.enabled then
    return jsonb_build_object('result', 'none', 'epoch', r.epoch);
  end if;
  if r.locked_at is not null then return jsonb_build_object('result', 'locked'); end if;
  ok := coalesce(p_pin, '') ~ '^[0-9]{4}$'
        and extensions.crypt(private.pin_mac(p_uid, p_pin), r.pin_hash) = r.pin_hash;
  if ok then
    update private.account_pin set fails = 0 where user_id = p_uid;
    return jsonb_build_object('result', 'ok', 'epoch', r.epoch);
  end if;
  update private.account_pin
     set fails = least(fails + 1, 5),
         locked_at = case when fails + 1 >= 5 then now() end
   where user_id = p_uid
   returning * into r;
  return jsonb_build_object('result', case when r.locked_at is null then 'wrong' else 'locked' end,
                            'tries_left', 5 - r.fails);
end $$;

-- When this session signed in with an email code (whole seconds), from the token.
create or replace function private.otp_at() returns timestamptz
language sql stable set search_path = '' as $$
  select to_timestamp(max((a->>'timestamp')::bigint))
    from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) a
   where a->>'method' = 'otp'
$$;

-- A fresh code (last 10 minutes, and not older than the lockout) may set a new MPIN.
create or replace function private.can_reset(p_locked_at timestamptz) returns boolean
language sql stable set search_path = '' as $$
  select coalesce(private.otp_at() >= now() - interval '10 minutes'
                  and (p_locked_at is null or private.otp_at() >= date_trunc('second', p_locked_at)), false)
$$;

revoke all on function private.pin_mac(uuid, text), private.pin_weak(text), private.pin_hash(uuid, text),
  private.pin_check(uuid, text), private.otp_at(), private.can_reset(timestamptz) from public, anon, authenticated;

create or replace function public.pin_status() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r private.account_pin;
begin
  if uid is null then return '{"result":"error"}'; end if;
  select * into r from private.account_pin where user_id = uid;
  if not found then
    return jsonb_build_object('enabled', false, 'epoch', null, 'locked', false, 'tries_left', 5, 'can_reset', private.can_reset(null));
  end if;
  return jsonb_build_object('enabled', r.enabled, 'epoch', r.epoch, 'locked', r.locked_at is not null,
                            'tries_left', 5 - r.fails, 'can_reset', private.can_reset(r.locked_at));
end $$;

create or replace function public.pin_verify(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then return '{"result":"error"}'; end if;
  return private.pin_check(uid, p_pin);
end $$;

-- Insert only: succeeds only when the account has no enabled PIN. Never overwrites.
create or replace function public.pin_claim(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r private.account_pin;
begin
  if uid is null then return '{"result":"error"}'; end if;
  if private.pin_weak(p_pin) then return '{"result":"weak"}'; end if;
  insert into private.account_pin (user_id, enabled, pin_hash)
       values (uid, true, private.pin_hash(uid, p_pin))
  on conflict (user_id) do update
       set enabled = true, pin_hash = excluded.pin_hash, epoch = gen_random_uuid(),
           fails = 0, locked_at = null, updated_at = now()
     where private.account_pin.enabled = false
  returning * into r;
  if not found then return '{"result":"exists"}'; end if;
  return jsonb_build_object('result', 'set', 'epoch', r.epoch);
end $$;

-- Current MPIN in the SAME call, and it counts toward the 5.
create or replace function public.pin_change(p_old text, p_new text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c jsonb; r private.account_pin;
begin
  if uid is null then return '{"result":"error"}'; end if;
  if private.pin_weak(p_new) then return '{"result":"weak"}'; end if;
  c := private.pin_check(uid, p_old);
  if c->>'result' <> 'ok' then return c; end if;
  update private.account_pin
     set pin_hash = private.pin_hash(uid, p_new), epoch = gen_random_uuid(), fails = 0, updated_at = now()
   where user_id = uid returning * into r;
  return jsonb_build_object('result', 'ok', 'epoch', r.epoch);
end $$;

-- Current MPIN in the same call; turns it off on every phone (new epoch). The row stays.
create or replace function public.pin_disable(p_pin text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); c jsonb; r private.account_pin;
begin
  if uid is null then return '{"result":"error"}'; end if;
  c := private.pin_check(uid, p_pin);
  if c->>'result' <> 'ok' then return c; end if;
  update private.account_pin
     set enabled = false, pin_hash = null, epoch = gen_random_uuid(), fails = 0, updated_at = now()
   where user_id = uid returning * into r;
  return jsonb_build_object('result', 'ok', 'epoch', r.epoch);
end $$;

-- Forgot MPIN: only with a session from an email code in the last 10 minutes, and after the
-- lockout if there is one. Sets a NEW PIN; never turns it off.
create or replace function public.pin_reset_with_code(p_new text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r private.account_pin;
begin
  if uid is null then return '{"result":"error"}'; end if;
  if private.pin_weak(p_new) then return '{"result":"weak"}'; end if;
  select * into r from private.account_pin where user_id = uid for update;
  if not private.can_reset(case when found then r.locked_at end) then return '{"result":"stale_code"}'; end if;
  insert into private.account_pin (user_id, enabled, pin_hash)
       values (uid, true, private.pin_hash(uid, p_new))
  on conflict (user_id) do update
       set enabled = true, pin_hash = excluded.pin_hash, epoch = gen_random_uuid(),
           fails = 0, locked_at = null, updated_at = now()
  returning * into r;
  return jsonb_build_object('result', 'ok', 'epoch', r.epoch);
end $$;

-- Offline wrong tries, reported on the next sync. Can only go up.
create or replace function public.pin_report_offline_fails(p_n int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare uid uuid := auth.uid(); r private.account_pin;
begin
  if uid is null then return '{"result":"error"}'; end if;
  if p_n is null or p_n < 1 then return '{"result":"ok"}'; end if;
  update private.account_pin
     set fails = least(fails + least(p_n, 5), 5),
         locked_at = coalesce(locked_at, case when fails + least(p_n, 5) >= 5 then now() end)
   where user_id = uid and enabled
  returning * into r;
  if not found then return '{"result":"ok"}'; end if;
  return jsonb_build_object('result', case when r.locked_at is null then 'ok' else 'locked' end, 'tries_left', 5 - r.fails);
end $$;

revoke all on function public.pin_status(), public.pin_verify(text), public.pin_claim(text),
  public.pin_change(text, text), public.pin_disable(text), public.pin_reset_with_code(text),
  public.pin_report_offline_fails(int) from public, anon;
grant execute on function public.pin_status(), public.pin_verify(text), public.pin_claim(text),
  public.pin_change(text, text), public.pin_disable(text), public.pin_reset_with_code(text),
  public.pin_report_offline_fails(int) to authenticated;
