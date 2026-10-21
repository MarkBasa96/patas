-- Patas database. Phase 3 design, 2026-10-17. APPLIED 2026-10-19 to the Supabase project "patas" as
-- migrations 0001_init + 0002_bidi_guard_by_code (this file is the current whole picture). From now on,
-- change the database ONLY through new numbered files in supabase/migrations/ and keep this file in step.
-- Never type invisible characters or \u escapes into SQL sent through a tool: they get turned into real
-- characters (seen twice). The bidi guard is built from chr() codes for that reason.
-- Each person can only ever see and change their own rows and their own QR files.
-- Run once per project, as one script, on an empty project. Safe to re-run.
--
-- House rules (each one has a reason in docs/DATA_MODEL.md and docs/SECURITY_DESIGN.md):
--   * Every table's key is (user_id, id). Two users can never collide on an id, and a row can only
--     point at rows of the same user (composite foreign keys), so cross-user links are impossible.
--   * Money is bigint centavos. Remaining and status are never stored; the app calculates them.
--   * Deletes are soft (deleted = true) so other devices learn about them. No delete grants.
--   * updated_at, added_at and qr_linked_at come from the server clock, never the phone.
--   * Signed-out visitors (anon) get nothing.

-- ---------------------------------------------------------------------------------------------
-- 0. Small helpers
-- ---------------------------------------------------------------------------------------------

-- One line of plain text: no control characters, no bidi-override characters (they can make a
-- name display as something else), at most maxlen characters.
create or replace function public.patas_clean_line(t text, maxlen int) returns boolean
language sql immutable set search_path = '' as $$
  select t is not null
     and char_length(t) <= maxlen
     and t !~ '[[:cntrl:]]'
     and t !~ ('[' || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || chr(8206) || chr(8207) || ']')
$$;

-- A note: same, but line breaks are allowed.
create or replace function public.patas_clean_note(t text, maxlen int) returns boolean
language sql immutable set search_path = '' as $$
  select t is not null
     and char_length(t) <= maxlen
     and regexp_replace(t, '[' || chr(10) || chr(13) || chr(9) || ']', '', 'g') !~ '[[:cntrl:]]'
     and t !~ ('[' || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || chr(8206) || chr(8207) || ']')
$$;

-- updated_at always comes from the server.
create or replace function public.patas_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- The key of a row never changes after it is made.
create or replace function public.patas_keep_key() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.user_id is distinct from old.user_id or new.id is distinct from old.id then
    raise exception 'row key cannot change' using errcode = '42501';
  end if;
  return new;
end $$;

-- Open sign-up means strangers: cap how many rows one account can make (counts deleted rows too,
-- so delete-and-re-add cannot get around it; a later purge job frees space).
-- Kenshin 2026-10-17 F2/F5: one writer per (table, account) at a time so parallel requests can't each
-- pass the check, and a sync upsert of a row that already exists is an edit, not a new row.
create or replace function public.patas_row_cap() returns trigger
language plpgsql set search_path = '' as $$
declare
  cap int := tg_argv[0]::int;
  n int;
  already boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(tg_table_name), pg_catalog.hashtext(new.user_id::text));
  execute format('select exists (select 1 from %I.%I where user_id = $1 and id = $2)', tg_table_schema, tg_table_name)
    into already using new.user_id, new.id;
  if already then
    return new;
  end if;
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into n using new.user_id;
  if n >= cap then
    raise exception 'limit reached for %', tg_table_name using errcode = '54000';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------------------------

create table if not exists public.user_settings (
  user_id      uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  currency     text not null default 'PHP' check (currency ~ '^[A-Z]{3}$'),
  theme        text not null default 'system' check (theme ~ '^[a-z0-9-]{1,24}$'),
  sounds       boolean not null default true,
  reminders_on boolean not null default true,
  reminder_at  time not null default '08:00',
  time_zone    text not null default 'Asia/Manila'
               check (time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$' and char_length(time_zone) <= 64),
  -- Home's "Monthly cash flow": two numbers the user types (Joe, 2026-10-17). Not pulled from Gastos.
  cashflow_income_centavos   bigint not null default 0 check (cashflow_income_centavos between 0 and 99999999999),
  cashflow_expenses_centavos bigint not null default 0 check (cashflow_expenses_centavos between 0 and 99999999999),
  updated_at   timestamptz not null default now()
);

-- QR codes come before debts because a debt can point at one.
create table if not exists public.qr_items (
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id             text not null check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  label          text not null check (public.patas_clean_line(label, 40) and char_length(btrim(label)) >= 1),
  wallet         text not null check (wallet in ('gcash', 'maya', 'gotyme', 'bank', 'other')),
  account_name   text not null default '' check (public.patas_clean_line(account_name, 60)),
  -- The file's place in the private bucket is fixed by the row: <user_id>/<id>.png. Nothing else.
  storage_path   text not null,
  -- sha256(user_id || ':' || id || ':' || decoded QR text), lowercase hex (Kenshin F7). Lets the phone check
  -- "is this still the same QR?". Never in CSV exports, nor in backups without QR pictures.
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  added_at       timestamptz not null default now(),   -- server clock; drives the 14-day "QR changed" banner
  -- Saved copies (migration 0004): only WHEN, server clock. A replacing QR carries the old one's copy date.
  last_copy_saved_at timestamptz,
  replaces_id    text check (replaces_id is null or replaces_id ~ '^[A-Za-z0-9_-]{1,40}$'),
  old_copy_saved_at timestamptz,
  source_key     text check (source_key is null or public.patas_clean_line(source_key, 80)),
  created_at     bigint not null,                      -- phone clock, ms; ordering only
  deleted        boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, source_key),
  constraint qr_items_path check (storage_path = user_id::text || '/' || id || '.png')
);

create table if not exists public.debts (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           text not null check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  -- v1 is "I owe" only (SPEC trimmed 2026-10-17). The column stays so "Owed to me" is a check change later.
  direction    text not null default 'i_owe' check (direction in ('i_owe')),
  kind         text not null check (kind in ('one_time', 'installments')),
  person_name  text not null check (public.patas_clean_line(person_name, 60) and char_length(btrim(person_name)) >= 1),
  title        text not null default '' check (public.patas_clean_line(title, 60)),
  due_on       date,                                   -- one-time only, and optional ("pay when I can"); installments carry their own dates
  opened_on    date not null,
  settled_on   date,                                   -- null = active
  remind       boolean not null default true,
  qr_id        text,
  qr_linked_at timestamptz,                            -- server clock; set whenever qr_id changes
  note         text not null default '' check (public.patas_clean_note(note, 500)),
  source_key   text check (source_key is null or public.patas_clean_line(source_key, 80)),
  created_at   bigint not null,
  deleted      boolean not null default false,
  updated_at   timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, source_key),
  foreign key (user_id, qr_id) references public.qr_items (user_id, id),
  constraint debts_due_on check (kind = 'one_time' or due_on is null)
);

-- The agreed plan only: when and how much. Whether it is paid is calculated, never stored.
create table if not exists public.installments (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id              text not null check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  debt_id         text not null,
  seq             int not null check (seq between 1 and 600),
  due_on          date not null,
  amount_centavos bigint not null check (amount_centavos between 1 and 99999999999),
  source_key      text check (source_key is null or public.patas_clean_line(source_key, 80)),
  created_at      bigint not null,
  deleted         boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, source_key),
  foreign key (user_id, debt_id) references public.debts (user_id, id)
);
create unique index if not exists installments_seq on public.installments (user_id, debt_id, seq) where not deleted;

-- The ledger: everything that changes what is owed. Amounts are always positive; the kind gives the sign.
--   principal  + (one-time debts only; for installment debts the installments ARE the principal)
--   addition   + (one-time debts: borrowed more, or they paid for something for you; Joe 2026-10-17)
--   charge     + (late fee, penalty, interest: typed by the user, never calculated)
--   adjustment +/- (import "Opening adjustment" lines; direction in adjust_sign)
--   payment    -
--   writeoff   - (forgiven or discounted when settling for less)
create table if not exists public.debt_lines (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id              text not null check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  debt_id         text not null,
  kind            text not null check (kind in ('principal', 'addition', 'charge', 'adjustment', 'payment', 'writeoff')),
  charge_kind     text check (charge_kind in ('late_fee', 'penalty', 'interest', 'other')),
  adjust_sign     smallint check (adjust_sign in (-1, 1)),
  amount_centavos bigint not null check (amount_centavos between 1 and 99999999999),
  on_date         date not null,
  note            text not null default '' check (public.patas_clean_note(note, 300)),
  method          text not null default '' check (public.patas_clean_line(method, 20)),  -- migration 0003: how a payment was made
  source_key      text check (source_key is null or public.patas_clean_line(source_key, 80)),
  created_at      bigint not null,
  deleted         boolean not null default false,
  updated_at      timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, source_key),
  foreign key (user_id, debt_id) references public.debts (user_id, id),
  constraint debt_lines_charge_kind check ((kind = 'charge') = (charge_kind is not null)),
  constraint debt_lines_adjust_sign check ((kind = 'adjustment') = (adjust_sign is not null))
);
create index if not exists debt_lines_debt on public.debt_lines (user_id, debt_id);

-- Where to send phone reminders. The sender (an Edge Function, Phase 6f) only ever posts to known
-- push services, so this table cannot be used to make the server call an arbitrary address.
create table if not exists public.push_subscriptions (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null check (id ~ '^[A-Za-z0-9_-]{1,40}$'),
  endpoint    text not null check (
                char_length(endpoint) <= 1000
                and endpoint ~ '^https://(fcm\.googleapis\.com|[a-z0-9-]+\.push\.apple\.com|updates\.push\.services\.mozilla\.com|[a-z0-9-]+\.notify\.windows\.com)/[^[:space:][:cntrl:]]+$'),
  p256dh      text not null check (p256dh ~ '^[A-Za-z0-9_-]{40,200}$'),
  auth_secret text not null check (auth_secret ~ '^[A-Za-z0-9_-]{10,100}$'),
  device_hint text not null default '' check (public.patas_clean_line(device_hint, 40)),
  created_at  bigint not null,
  deleted     boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (user_id, id),
  unique (user_id, endpoint)
);

-- Sync cursor indexes: (user_id, updated_at, id), same recipe as Gastos.
create index if not exists qr_items_sync      on public.qr_items (user_id, updated_at, id);
create index if not exists debts_sync         on public.debts (user_id, updated_at, id);
create index if not exists installments_sync  on public.installments (user_id, updated_at, id);
create index if not exists debt_lines_sync    on public.debt_lines (user_id, updated_at, id);
create index if not exists push_subs_sync     on public.push_subscriptions (user_id, updated_at, id);

-- ---------------------------------------------------------------------------------------------
-- 2. Triggers
-- ---------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['user_settings', 'qr_items', 'debts', 'installments', 'debt_lines', 'push_subscriptions'] loop
    execute format('drop trigger if exists %1$s_touch on public.%1$I', t);
    execute format('create trigger %1$s_touch before insert or update on public.%1$I
                    for each row execute function public.patas_touch()', t);
  end loop;
  foreach t in array array['qr_items', 'debts', 'installments', 'debt_lines', 'push_subscriptions'] loop
    execute format('drop trigger if exists %1$s_keep_key on public.%1$I', t);
    execute format('create trigger %1$s_keep_key before update on public.%1$I
                    for each row execute function public.patas_keep_key()', t);
  end loop;
end $$;

-- Row caps per account (open sign-up). Kenshin F2: worst case about 22 MB per account. Check against the owner's import counts in Phase 4.
drop trigger if exists qr_items_cap on public.qr_items;
create trigger qr_items_cap before insert on public.qr_items for each row execute function public.patas_row_cap('30');
drop trigger if exists debts_cap on public.debts;
create trigger debts_cap before insert on public.debts for each row execute function public.patas_row_cap('300');
drop trigger if exists installments_cap on public.installments;
create trigger installments_cap before insert on public.installments for each row execute function public.patas_row_cap('3000');
drop trigger if exists debt_lines_cap on public.debt_lines;
create trigger debt_lines_cap before insert on public.debt_lines for each row execute function public.patas_row_cap('10000');
drop trigger if exists push_subs_cap on public.push_subscriptions;
create trigger push_subs_cap before insert on public.push_subscriptions for each row execute function public.patas_row_cap('10');

-- Swap protection, part 1: a QR row's picture can never change in place. A "replace" is always a
-- new row, which gets a fresh server-set added_at, which shows the "QR changed" banner for 14 days.
create or replace function public.patas_qr_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.added_at := now();
    new.last_copy_saved_at := null;
    new.old_copy_saved_at := case when new.replaces_id is null then null else
      (select q.last_copy_saved_at from public.qr_items q where q.user_id = new.user_id and q.id = new.replaces_id) end;
  else
    new.added_at := old.added_at;   -- the phone cannot change it; kept quietly so a sync upsert never jams (F5)
    if new.payload_sha256 is distinct from old.payload_sha256
       or new.storage_path is distinct from old.storage_path then
      raise exception 'a QR cannot be changed in place; add a new one' using errcode = '42501';
    end if;
    new.replaces_id := old.replaces_id;             -- fixed when the QR is added (migration 0004)
    new.old_copy_saved_at := old.old_copy_saved_at;
    -- "A copy was saved": any new non-null value becomes the server's time; it can never be cleared or back-dated.
    if new.last_copy_saved_at is not null and new.last_copy_saved_at is distinct from old.last_copy_saved_at then
      new.last_copy_saved_at := now();
    else
      new.last_copy_saved_at := old.last_copy_saved_at;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists qr_items_guard on public.qr_items;
create trigger qr_items_guard before insert or update on public.qr_items
  for each row execute function public.patas_qr_guard();

-- Swap protection, part 2: pointing a debt at a different QR (even an old one) stamps qr_linked_at.
-- The app shows the banner if the QR's added_at OR the debt's qr_linked_at is under 14 days old.
create or replace function public.patas_debt_qr_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.qr_linked_at := case when new.qr_id is null then null else now() end;
  elsif new.qr_id is distinct from old.qr_id then
    new.qr_linked_at := case when new.qr_id is null then null else now() end;
  else
    new.qr_linked_at := old.qr_linked_at;   -- the phone cannot reset it
  end if;
  return new;
end $$;
drop trigger if exists debts_qr_stamp on public.debts;
create trigger debts_qr_stamp before insert or update on public.debts
  for each row execute function public.patas_debt_qr_stamp();

-- A time zone must be one Postgres knows. One fake name would break the reminder run for everyone (F4).
create or replace function public.patas_check_tz() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.time_zone) then
    raise exception 'unknown time zone' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists user_settings_tz on public.user_settings;
create trigger user_settings_tz before insert or update of time_zone on public.user_settings
  for each row execute function public.patas_check_tz();

-- ---------------------------------------------------------------------------------------------
-- 3. Row Level Security: the actual privacy wall
-- ---------------------------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['user_settings', 'qr_items', 'debts', 'installments', 'debt_lines', 'push_subscriptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('drop policy if exists "own rows: read" on public.%I', t);
    execute format('drop policy if exists "own rows: add" on public.%I', t);
    execute format('drop policy if exists "own rows: change" on public.%I', t);
    execute format('create policy "own rows: read" on public.%I for select to authenticated
                    using ((select auth.uid()) = user_id)', t);
    -- Anonymous sign-ins (if ever switched on by mistake) also get the authenticated role: refuse them (F12).
    execute format('create policy "own rows: add" on public.%I for insert to authenticated
                    with check ((select auth.uid()) = user_id
                                and coalesce(((select auth.jwt()) ->> ''is_anonymous'')::boolean, false) = false)', t);
    execute format('create policy "own rows: change" on public.%I for update to authenticated
                    using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    -- No delete policy on purpose: deletes are soft so they sync. Account deletion runs server-side.
    execute format('revoke all on public.%I from anon, public', t);
    execute format('revoke all on public.%I from authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

-- The helper functions are harmless, but nobody outside needs to call them directly.
revoke execute on function public.patas_touch(), public.patas_keep_key(), public.patas_row_cap(),
  public.patas_qr_guard(), public.patas_debt_qr_stamp(), public.patas_check_tz() from public, anon, authenticated;
-- The text checks run with the caller's rights inside CHECK constraints, so signed-in users keep them (F13).
revoke execute on function public.patas_clean_line(text, int), public.patas_clean_note(text, int) from public, anon;
grant execute on function public.patas_clean_line(text, int), public.patas_clean_note(text, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------
-- 4. QR storage: one private bucket, per-user folders, files never overwritten
-- ---------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qr', 'qr', false, 262144, array['image/png'])
on conflict (id) do update
  set public = false, file_size_limit = 262144, allowed_mime_types = array['image/png'];

drop policy if exists "qr: read own" on storage.objects;
drop policy if exists "qr: add own" on storage.objects;
drop policy if exists "qr: remove own" on storage.objects;

-- Read your own files, but never mint a shareable signed link (F3): "no links" is enforced, not a habit.
create policy "qr: read own" on storage.objects for select to authenticated
  using (
    bucket_id = 'qr'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not storage.allow_any_operation(array['object.sign', 'object.sign_many', 'render.image_sign'])
  );

-- A file may only be uploaded for a live QR row the user already made, at exactly that row's path,
-- and only during that row's first day (F1). So the 30-row cap is also the file cap, stray files
-- can't be dumped in the bucket, and an old QR can never get a new picture.
create policy "qr: add own" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'qr'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and exists (
      select 1 from public.qr_items q
      where q.user_id = (select auth.uid()) and q.storage_path = objects.name and not q.deleted
        and q.added_at > now() - interval '1 day'
    )
  );

-- A live QR's picture can't be removed (F1). Soft-delete the row first; then its file may go.
-- App order for "replace": new row, its file, soft-delete the old row, then remove the old file.
create policy "qr: remove own" on storage.objects for delete to authenticated
  using (
    bucket_id = 'qr'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.qr_items q
      where q.user_id = (select auth.uid()) and q.storage_path = objects.name and not q.deleted
    )
  );

-- Deliberately NO update policy: a QR file is never overwritten. Replace = new row + new file.
-- Supabase settings this file can't set (F12), checked again on the real project in Phase 8:
-- anonymous sign-ins OFF, bucket versioning DISABLED, Data API exposes only public + graphql_public.
-- After the first apply, change tables through numbered migrations: "create table if not exists"
-- skips edited table rules on a re-run (F11).

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
